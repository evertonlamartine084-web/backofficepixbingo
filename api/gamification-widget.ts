import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Platform login/credit helpers (for store reward delivery) ---

async function platformLogin(siteUrl: string, username: string, password: string, loginUrl?: string | null): Promise<{ cookies: string; success: boolean }> {
  const baseUrl = siteUrl.replace(/\/+$/, '');
  let loginTarget = `${baseUrl}/login`;
  if (loginUrl) {
    const cleanLogin = loginUrl.replace(/\/+$/, '');
    loginTarget = cleanLogin.endsWith('/login') ? cleanLogin : `${cleanLogin}/login`;
  }

  let initialCookies = '';
  try {
    const initRes = await fetch(baseUrl, {
      method: 'GET', headers: { 'Accept': 'text/html' },
      redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    const setCookies = initRes.headers.getSetCookie?.() || [];
    initialCookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
  } catch {}

  try {
    const hdrs: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/json,*/*',
      'Referer': `${baseUrl}/`, 'Origin': baseUrl,
    };
    if (initialCookies) hdrs['Cookie'] = initialCookies;

    const res = await fetch(loginTarget, {
      method: 'POST', headers: hdrs,
      body: new URLSearchParams({ usuario: username, senha: password }).toString(),
      redirect: 'manual', signal: AbortSignal.timeout(10000),
    });

    const setCookies = res.headers.getSetCookie?.() || [];
    const cookieMap = new Map<string, string>();
    for (const c of initialCookies.split('; ').filter(Boolean)) {
      const [k, ...v] = c.split('=');
      cookieMap.set(k, v.join('='));
    }
    for (const sc of setCookies) {
      const [kv] = sc.split(';');
      const [k, ...v] = kv.split('=');
      cookieMap.set(k.trim(), v.join('='));
    }
    const cookies = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get('location') || '';
      if (!location.includes('/login') && !location.includes('error')) {
        return { cookies, success: true };
      }
    }
    if (res.ok) {
      const text = await res.text();
      try { const d = JSON.parse(text); if (d.status === true || d.logged === true) return { cookies, success: true }; } catch {}
    }
  } catch {}

  return { cookies: '', success: false };
}

function buildPlatformHeaders(cookies: string, baseUrl: string): Record<string, string> {
  return {
    'Accept': 'application/json, text/javascript, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'Cookie': cookies, 'Referer': baseUrl,
  };
}

async function searchPlayerByCpf(baseUrl: string, headers: Record<string, string>, cpf: string): Promise<string | null> {
  const params = new URLSearchParams({ draw: '1', start: '0', length: '1', busca_cpf: cpf });
  const userCols = ['username', 'celular', 'cpf', 'created_at', 'ultimo_login', 'situacao', 'uuid'];
  userCols.forEach((col, i) => {
    params.set(`columns[${i}][data]`, col);
    params.set(`columns[${i}][name]`, '');
    params.set(`columns[${i}][searchable]`, 'true');
    params.set(`columns[${i}][orderable]`, 'true');
    params.set(`columns[${i}][search][value]`, '');
    params.set(`columns[${i}][search][regex]`, 'false');
  });
  params.set('order[0][column]', '0');
  params.set('order[0][dir]', 'asc');
  params.set('search[value]', '');
  params.set('search[regex]', 'false');

  try {
    const res = await fetch(`${baseUrl}/usuarios/listar?${params.toString()}`, {
      method: 'GET', headers, signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    const data = JSON.parse(text);
    if (data?.data?.length > 0) return data.data[0].uuid || null;
  } catch {}
  return null;
}

async function creditBonusOnPlatform(baseUrl: string, headers: Record<string, string>, playerUuid: string, amount: number, password: string): Promise<{ success: boolean; msg?: string }> {
  const hdrs = { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' };
  try {
    const res = await fetch(`${baseUrl}/usuarios/creditos`, {
      method: 'POST', headers: hdrs, signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({ uuid: playerUuid, carteira: 'BONUS', valor: String(amount), senha: password }).toString(),
    });
    const text = await res.text();
    const result = JSON.parse(text);
    const ok = result?.status === true || String(result?.msg || '').toLowerCase().includes('sucesso');
    return { success: ok, msg: result?.msg || result?.Msg || JSON.stringify(result).slice(0, 200) };
  } catch (e: any) {
    return { success: false, msg: e.message };
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'data';
    const segmentId = url.searchParams.get('segment') || null;
    const playerCpf = url.searchParams.get('player') || null;

    // Helper: filter by segment (show items matching segment OR items with no segment)
    const applySegmentFilter = (query: any) => {
      if (!segmentId) return query;
      return query.or(`segment_id.eq.${segmentId},segment_id.is.null`);
    };

    // Return all active gamification data
    if (action === 'data') {
      // Hard timeout: return empty data after 20s rather than hanging forever
      const hardTimeout = new Promise<Response>((resolve) =>
        setTimeout(() => resolve(new Response(JSON.stringify({
          achievements: [], missions: [], tournaments: [], wheel_prizes: [],
          levels: [], store_items: [], wheel_config: { max_spins_per_day: 3, spin_cost_coins: 0, free_spins_per_day: 1 },
          leaderboards: {}, wallet: null, player_spins: null, mission_progress: [],
          achievement_progress: [], activity_log: [], pending_rewards: [],
          tournament_entries: [], mini_games: [], mini_game_prizes: [], mini_game_attempts: [],
          _timeout: true,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })), 20000)
      );
      return Promise.race([dataHandler(), hardTimeout]);
    }

    async function dataHandler() {
      const now = new Date().toISOString();

      let achievementsQ = supabase.from('achievements').select('id, name, description, icon_url, category, condition_type, condition_value, reward_type, reward_value, segment_id, segments(name), stages, start_date, end_date, hide_if_not_earned, manual_claim, priority')
        .eq('active', true).order('priority').order('category').order('condition_value');
      let missionsQ = supabase.from('missions').select('id, name, description, icon_url, type, condition_type, condition_value, reward_type, reward_value, segment_id, segments(name), status, priority, require_optin, time_limit_hours, start_date, end_date, recurrence, cta_text, cta_url, manual_claim')
        .in('status', ['ATIVO']).order('priority').order('type').order('condition_value');
      let tournamentsQ = supabase.from('tournaments').select('id, name, description, image_url, start_date, end_date, metric, game_filter, min_bet, prizes, status, segment_id, segments(name), require_optin, points_per, buy_in_cost, min_players, max_players, allow_late_join')
        .eq('status', 'ATIVO').lte('start_date', now).gte('end_date', now).order('end_date');
      let wheelPrizesQ = supabase.from('daily_wheel_prizes').select('id, label, value, type, probability, color, icon_url, segment_id, segments(name)')
        .eq('active', true).order('probability', { ascending: false });

      // Fire all independent queries in a single Promise.all
      const baseQueries: PromiseLike<any>[] = [
        applySegmentFilter(achievementsQ),          // 0
        applySegmentFilter(missionsQ),              // 1
        applySegmentFilter(tournamentsQ),           // 2
        applySegmentFilter(wheelPrizesQ),           // 3
        applySegmentFilter(                         // 4 mini_games
          supabase.from('mini_games').select('id, type, name, description, theme, config, max_attempts_per_day, free_attempts_per_day, attempt_cost_coins, segment_id, segments(name)').eq('active', true)
        ),
        supabase.from('player_levels').select('*').order('level_number'),          // 5
        supabase.from('store_items').select('*').eq('active', true).order('price_coins'),  // 6
        supabase.from('wheel_config').select('*').limit(1).maybeSingle(),          // 7
      ];
      if (playerCpf) {
        baseQueries.push(
          supabase.from('player_wallets').select('*').eq('cpf', playerCpf).maybeSingle(),       // 8
          supabase.from('player_spins').select('*').eq('cpf', playerCpf).maybeSingle(),         // 9
          supabase.from('player_mission_progress').select('*').eq('cpf', playerCpf),            // 10
          supabase.from('player_achievements').select('*').eq('cpf', playerCpf),                // 11
          supabase.from('player_activity_log').select('*').eq('cpf', playerCpf).order('created_at', { ascending: false }).limit(50), // 12
          supabase.from('player_rewards_pending').select('*').eq('cpf', playerCpf).is('claimed_at', null), // 13
          supabase.from('player_tournament_entries').select('*').eq('cpf', playerCpf),          // 14
          supabase.from('player_mini_game_attempts').select('*').eq('cpf', playerCpf),          // 15
        );
      }
      const allResults = await Promise.all(baseQueries);

      const achievements = allResults[0];
      const missions = allResults[1];
      const tournaments = allResults[2];
      const wheelPrizes = allResults[3];
      const miniGamesResult = allResults[4];
      const miniGames = miniGamesResult.data || [];

      // Get mini game prizes (depends on mini game IDs)
      const miniGameIds = miniGames.map((g: any) => g.id);
      let miniGamePrizes: any[] = [];
      if (miniGameIds.length > 0) {
        const { data: mgp } = await supabase.from('mini_game_prizes').select('*').in('game_id', miniGameIds).eq('active', true).order('sort_order');
        miniGamePrizes = mgp || [];
      }
      const levels = allResults[5];
      const storeItems = allResults[6];
      const wheelConfigResult = allResults[7];

      // Player-specific data
      let wallet = null;
      let playerSpins = null;
      let missionProgress: any[] = [];
      let achievementProgress: any[] = [];
      let activityLog: any[] = [];
      let pendingRewards: any[] = [];
      let tournamentEntries: any[] = [];
      let miniGameAttempts: any[] = [];

      if (playerCpf) {
        const walletResult = allResults[8];
        const spinsResult = allResults[9];
        const missionProgressResult = allResults[10];
        const achievementProgressResult = allResults[11];
        const activityLogResult = allResults[12];
        const pendingRewardsResult = allResults[13];
        const tournamentEntriesResult = allResults[14];
        const miniGameAttemptsResult = allResults[15];

        wallet = walletResult?.data || null;
        playerSpins = spinsResult?.data || null;
        missionProgress = missionProgressResult?.data || [];
        achievementProgress = achievementProgressResult?.data || [];
        activityLog = activityLogResult?.data || [];
        pendingRewards = pendingRewardsResult?.data || [];
        tournamentEntries = tournamentEntriesResult?.data || [];
        miniGameAttempts = miniGameAttemptsResult?.data || [];

        // If player doesn't have a wallet yet, create one
        if (!wallet) {
          const { data: newWallet } = await supabase.from('player_wallets')
            .upsert({ cpf: playerCpf, coins: 0, xp: 0, level: 1 } as any, { onConflict: 'cpf' })
            .select()
            .single();
          wallet = newWallet;
        }

        // Reset daily spins if new day
        if (playerSpins && playerSpins.last_spin_date !== new Date().toISOString().slice(0, 10)) {
          await supabase.from('player_spins')
            .update({ spins_used_today: 0, last_spin_date: new Date().toISOString().slice(0, 10) } as any)
            .eq('cpf', playerCpf);
          playerSpins.spins_used_today = 0;
        }
      }

      // Get tournament leaderboards for active tournaments
      const tournamentIds = (tournaments.data || []).map((t: any) => t.id);
      let leaderboards: Record<string, any[]> = {};
      if (tournamentIds.length > 0) {
        const { data: entries } = await supabase
          .from('player_tournament_entries')
          .select('tournament_id, cpf, score, rank')
          .in('tournament_id', tournamentIds)
          .order('score', { ascending: false });
        if (entries) {
          for (const entry of entries) {
            if (!leaderboards[entry.tournament_id]) leaderboards[entry.tournament_id] = [];
            leaderboards[entry.tournament_id].push(entry);
          }
        }
      }

      const wheelCfg = wheelConfigResult?.data || { max_spins_per_day: 3, spin_cost_coins: 0, free_spins_per_day: 1 };

      return new Response(JSON.stringify({
        achievements: achievements.data || [],
        missions: missions.data || [],
        tournaments: tournaments.data || [],
        wheel_prizes: wheelPrizes.data || [],
        levels: levels.data || [],
        store_items: storeItems.data || [],
        wheel_config: wheelCfg,
        leaderboards,
        wallet: wallet || null,
        player_spins: playerSpins || null,
        mission_progress: missionProgress,
        achievement_progress: achievementProgress,
        activity_log: activityLog,
        pending_rewards: pendingRewards,
        tournament_entries: tournamentEntries,
        mini_games: miniGames,
        mini_game_prizes: miniGamePrizes,
        mini_game_attempts: miniGameAttempts,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
      });
    }

    // Spin the wheel
    if (action === 'spin') {
      if (!playerCpf) {
        return new Response(JSON.stringify({ error: 'CPF do jogador é obrigatório para girar' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get wheel config
      const { data: wheelCfg } = await supabase.from('wheel_config').select('*').limit(1).maybeSingle();
      const cfg = wheelCfg || { max_spins_per_day: 3, spin_cost_coins: 0, free_spins_per_day: 1 };

      // Get/create player spins record
      const today = new Date().toISOString().slice(0, 10);
      let { data: spinRecord } = await supabase.from('player_spins').select('*').eq('cpf', playerCpf).maybeSingle();

      if (!spinRecord) {
        const { data: newRecord } = await supabase.from('player_spins')
          .upsert({ cpf: playerCpf, spins_used_today: 0, last_spin_date: today, total_spins: 0 } as any, { onConflict: 'cpf' })
          .select().single();
        spinRecord = newRecord;
      }

      // Reset if new day
      if (spinRecord && spinRecord.last_spin_date !== today) {
        spinRecord.spins_used_today = 0;
      }

      const spinsUsed = spinRecord?.spins_used_today || 0;

      // Check max spins
      if (cfg.max_spins_per_day > 0 && spinsUsed >= cfg.max_spins_per_day) {
        return new Response(JSON.stringify({ error: 'Limite de giros diários atingido', max: cfg.max_spins_per_day }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if needs to pay coins (beyond free spins)
      const isFree = spinsUsed < (cfg.free_spins_per_day || 1);
      let coinsCost = 0;

      if (!isFree && cfg.spin_cost_coins > 0) {
        coinsCost = cfg.spin_cost_coins;
        // Check wallet balance
        const { data: wallet } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
        if (!wallet || (wallet.coins || 0) < coinsCost) {
          return new Response(JSON.stringify({ error: 'Moedas insuficientes', cost: coinsCost, balance: wallet?.coins || 0 }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Deduct coins
        await supabase.from('player_wallets').update({ coins: (wallet.coins || 0) - coinsCost } as any).eq('cpf', playerCpf);
      }

      // Get prizes
      let spinQ = supabase.from('daily_wheel_prizes')
        .select('id, label, value, type, probability, color')
        .eq('active', true);
      if (segmentId) spinQ = spinQ.or(`segment_id.eq.${segmentId},segment_id.is.null`);
      const { data: prizes } = await spinQ;

      if (!prizes || prizes.length === 0) {
        return new Response(JSON.stringify({ error: 'Nenhum prêmio configurado' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Weighted random selection
      const totalWeight = prizes.reduce((s, p) => s + (p.probability || 1), 0);
      let random = Math.random() * totalWeight;
      let selected = prizes[0];
      for (const prize of prizes) {
        random -= (prize.probability || 1);
        if (random <= 0) { selected = prize; break; }
      }

      // Update spins record
      await supabase.from('player_spins')
        .upsert({
          cpf: playerCpf,
          spins_used_today: spinsUsed + 1,
          last_spin_date: today,
          total_spins: (spinRecord?.total_spins || 0) + 1,
        } as any, { onConflict: 'cpf' });

      // Award prize to wallet
      if (selected.type === 'coins' && selected.value > 0) {
        const { data: w } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
        await supabase.from('player_wallets').update({ coins: (w?.coins || 0) + selected.value } as any).eq('cpf', playerCpf);
      } else if (selected.type === 'xp' && selected.value > 0) {
        const { data: w } = await supabase.from('player_wallets').select('xp').eq('cpf', playerCpf).maybeSingle();
        await supabase.from('player_wallets').update({ xp: (w?.xp || 0) + selected.value } as any).eq('cpf', playerCpf);
      } else if (selected.type === 'bonus' && selected.value > 0) {
        try {
          await supabase.from('player_rewards_pending').insert({
            cpf: playerCpf,
            reward_type: 'bonus',
            reward_value: selected.value,
            source: 'Roleta Diária',
            description: `Bônus de R$${selected.value} da roleta`,
          } as any);
        } catch { /* ignore */ }
      } else if (selected.type === 'free_bet' && selected.value > 0) {
        try {
          await supabase.from('player_rewards_pending').insert({
            cpf: playerCpf,
            reward_type: 'free_bet',
            reward_value: selected.value,
            source: 'Roleta Diária',
            description: `Free bet de R$${selected.value} da roleta`,
          } as any);
        } catch { /* ignore */ }
      } else if (selected.type === 'spins' && selected.value > 0) {
        // Award extra spins by reducing spins_used_today
        const newUsed = Math.max(0, spinsUsed + 1 - selected.value);
        await supabase.from('player_spins')
          .update({ spins_used_today: newUsed } as any)
          .eq('cpf', playerCpf);
      }

      // Log activity
      try {
        await supabase.from('player_activity_log').insert({
          cpf: playerCpf,
          type: 'wheel',
          amount: selected.type === 'nothing' ? 0 : selected.value,
          source: 'Roleta Diária',
          description: `Girou a roleta e ganhou: ${selected.label}`,
        } as any);
      } catch { /* ignore */ }

      // If coins were spent, log that too
      if (coinsCost > 0) {
        try {
          await supabase.from('player_activity_log').insert({
            cpf: playerCpf,
            type: 'coins',
            amount: -coinsCost,
            source: 'Roleta Diária',
            description: `Gasto ${coinsCost} moedas para girar a roleta`,
          } as any);
        } catch { /* ignore */ }
      }

      return new Response(JSON.stringify({
        prize: selected,
        prizes: prizes,
        spins_used: spinsUsed + 1,
        max_spins: cfg.max_spins_per_day,
        free_spins: cfg.free_spins_per_day,
        coins_spent: coinsCost,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tournament opt-in / buy-in
    if (action === 'tournament_join') {
      if (!playerCpf) {
        return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const tournamentId = url.searchParams.get('tournament_id');
      if (!tournamentId) {
        return new Response(JSON.stringify({ error: 'tournament_id obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get tournament
      const { data: tournament } = await supabase.from('tournaments').select('*').eq('id', tournamentId).single();
      if (!tournament) {
        return new Response(JSON.stringify({ error: 'Torneio não encontrado' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if already joined
      const { data: existing } = await supabase.from('player_tournament_entries')
        .select('id').eq('cpf', playerCpf).eq('tournament_id', tournamentId).maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ error: 'Já inscrito neste torneio' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check buy-in
      let coinsPaid = 0;
      if (tournament.buy_in_cost && tournament.buy_in_cost > 0) {
        coinsPaid = tournament.buy_in_cost;
        const { data: wallet } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
        if (!wallet || (wallet.coins || 0) < coinsPaid) {
          return new Response(JSON.stringify({ error: 'Moedas insuficientes', cost: coinsPaid, balance: wallet?.coins || 0 }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // Deduct
        await supabase.from('player_wallets')
          .update({ coins: (wallet.coins || 0) - coinsPaid } as any)
          .eq('cpf', playerCpf);
      }

      // Create entry
      await supabase.from('player_tournament_entries').insert({
        cpf: playerCpf,
        tournament_id: tournamentId,
        opted_in: true,
        bought_in: coinsPaid > 0,
        coins_paid: coinsPaid,
      } as any);

      // Log
      try {
        await supabase.from('player_activity_log').insert({
          cpf: playerCpf,
          type: 'tournament',
          amount: coinsPaid > 0 ? -coinsPaid : 0,
          source: 'Torneio',
          source_id: tournamentId,
          description: `Inscreveu-se no torneio: ${tournament.name}`,
        } as any);
      } catch { /* ignore */ }

      return new Response(JSON.stringify({ success: true, coins_paid: coinsPaid }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Platform balance
    if (action === 'platform_balance') {
      if (!playerCpf) {
        return new Response(JSON.stringify({ saldo: 0, bonus: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      try {
        const { data: config } = await supabase.from('platform_config').select('*').limit(1).maybeSingle();
        if (!config?.username || !config?.password) {
          return new Response(JSON.stringify({ saldo: 0, bonus: 0, error: 'config' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const baseUrl = (config.site_url || 'https://pixbingobr.concurso.club').replace(/\/+$/, '');
        const login = await platformLogin(baseUrl, config.username, config.password, config.login_url);
        if (!login.success) {
          return new Response(JSON.stringify({ saldo: 0, bonus: 0, error: 'login' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const headers2: Record<string, string> = {
          'Cookie': login.cookies,
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        };
        let saldo = 0, bonus = 0;
        let debug: any = {};
        // First find uuid by CPF
        const uuid = await searchPlayerByCpf(baseUrl, headers2, playerCpf);
        debug.uuid = uuid;
        if (uuid) {
          // Fetch /usuarios/transacoes which returns carteiras
          const txRes = await fetch(`${baseUrl}/usuarios/transacoes?id=${uuid}`, {
            headers: headers2, signal: AbortSignal.timeout(10000),
          });
          const txText = await txRes.text();
          let txData: any;
          try { txData = JSON.parse(txText); } catch { txData = null; }
          debug.txKeys = txData ? Object.keys(txData) : null;
          debug.txSnippet = txText.slice(0, 500);
          const carteiras = txData?.carteiras;
          debug.carteiras = carteiras;
          if (Array.isArray(carteiras)) {
            for (const c of carteiras) {
              const nome = (c.carteira || c.nome || c.tipo || '').toUpperCase();
              const val = Number(c.saldo || c.valor || 0);
              if (nome.includes('BONUS')) bonus = val;
              else if (nome.includes('REAL') || nome.includes('PRINCIPAL') || nome === 'CREDITO') saldo = val;
              else if (!nome.includes('BONUS') && saldo === 0) saldo = val;
            }
          } else if (carteiras && typeof carteiras === 'object') {
            saldo = Number(carteiras.saldo || carteiras.real || carteiras.credito || 0);
            bonus = Number(carteiras.bonus || carteiras.saldo_bonus || 0);
          }
        }
        return new Response(JSON.stringify({ saldo, bonus, debug }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ saldo: 0, bonus: 0, error: e.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Store purchase
    if (action === 'store_buy') {
      if (!playerCpf) {
        return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const itemId = url.searchParams.get('item_id');
      if (!itemId) {
        return new Response(JSON.stringify({ error: 'item_id obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: item } = await supabase.from('store_items').select('*').eq('id', itemId).single();
      if (!item || !item.active) {
        return new Response(JSON.stringify({ error: 'Item não encontrado ou inativo' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check stock
      if (item.stock !== null && item.stock <= 0) {
        return new Response(JSON.stringify({ error: 'Item fora de estoque' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check wallet
      const { data: wallet } = await supabase.from('player_wallets').select('*').eq('cpf', playerCpf).maybeSingle();
      const coins = wallet?.coins || 0;
      const diamonds = wallet?.diamonds || 0;
      if (item.price_coins > 0 && coins < item.price_coins) {
        return new Response(JSON.stringify({ error: 'Moedas insuficientes', cost: item.price_coins, balance: coins }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (item.price_diamonds > 0 && diamonds < item.price_diamonds) {
        return new Response(JSON.stringify({ error: 'Diamantes insuficientes', cost: item.price_diamonds, balance: diamonds }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Deduct coins and diamonds
      const walletUpdate: any = {};
      if (item.price_coins > 0) walletUpdate.coins = coins - item.price_coins;
      if (item.price_diamonds > 0) walletUpdate.diamonds = diamonds - item.price_diamonds;
      if (Object.keys(walletUpdate).length > 0) {
        await supabase.from('player_wallets')
          .update(walletUpdate)
          .eq('cpf', playerCpf);
      }

      // Determine reward type and value
      const rewardType = item.reward_type || 'bonus';
      const rewardValue = item.reward_value || '';
      let deliveryStatus = 'pending';
      let deliveryNote = '';

      // Process reward based on type
      if (['bonus', 'free_bet', 'cartelas'].includes(rewardType)) {
        const numericValue = parseFloat(rewardValue.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (numericValue > 0) {
          try {
            const { data: config } = await supabase.from('platform_config')
              .select('*').eq('active', true).order('created_at', { ascending: false }).limit(1).single();
            if (config) {
              const loginDomain = (config.login_url || config.site_url || '').replace(/\/+$/, '');
              const loginResult = await platformLogin(loginDomain, config.username, config.password, config.login_url);
              if (loginResult.success) {
                const headers = buildPlatformHeaders(loginResult.cookies, loginDomain);
                const playerUuid = await searchPlayerByCpf(loginDomain, headers, playerCpf);
                if (playerUuid) {
                  const creditResult = await creditBonusOnPlatform(loginDomain, headers, playerUuid, numericValue, config.password);
                  if (creditResult.success) {
                    deliveryStatus = 'delivered';
                    deliveryNote = `Creditado R$${numericValue.toFixed(2)} (${rewardType}) na plataforma`;
                  } else {
                    deliveryNote = `Erro ao creditar: ${creditResult.msg}`;
                  }
                } else {
                  deliveryNote = 'UUID do jogador não encontrado na plataforma';
                }
              } else {
                deliveryNote = 'Falha no login da plataforma';
              }
            } else {
              deliveryNote = 'Config da plataforma não encontrada';
            }
          } catch (e: any) {
            deliveryNote = `Erro: ${e.message}`;
          }
        } else {
          deliveryNote = 'Valor inválido para crédito';
        }
      } else if (rewardType === 'coins') {
        const bonusCoins = parseInt(rewardValue) || 0;
        if (bonusCoins > 0) {
          const newBalance = (coins - (item.price_coins || 0)) + bonusCoins;
          await supabase.from('player_wallets')
            .update({ coins: newBalance } as any)
            .eq('cpf', playerCpf);
          deliveryStatus = 'delivered';
          deliveryNote = `+${bonusCoins} moedas adicionadas`;
        }
      } else if (rewardType === 'xp') {
        const bonusXp = parseInt(rewardValue) || 0;
        if (bonusXp > 0) {
          const { data: w } = await supabase.from('player_wallets').select('xp').eq('cpf', playerCpf).maybeSingle();
          await supabase.from('player_wallets')
            .update({ xp: (w?.xp || 0) + bonusXp } as any)
            .eq('cpf', playerCpf);
          deliveryStatus = 'delivered';
          deliveryNote = `+${bonusXp} XP adicionado`;
        }
      } else if (rewardType === 'diamonds') {
        const bonusDiamonds = parseInt(rewardValue) || 0;
        if (bonusDiamonds > 0) {
          const { data: w } = await supabase.from('player_wallets').select('diamonds, total_diamonds_earned').eq('cpf', playerCpf).maybeSingle();
          await supabase.from('player_wallets')
            .update({
              diamonds: (w?.diamonds || 0) + bonusDiamonds,
              total_diamonds_earned: (w?.total_diamonds_earned || 0) + bonusDiamonds,
            } as any)
            .eq('cpf', playerCpf);
          deliveryStatus = 'delivered';
          deliveryNote = `+${bonusDiamonds} diamantes adicionados`;
        }
      } else if (rewardType === 'physical' || rewardType === 'coupon') {
        await supabase.from('player_rewards_pending').insert({
          cpf: playerCpf,
          reward_type: rewardType,
          reward_value: rewardValue ? parseFloat(rewardValue.replace(/[^\d.,]/g, '').replace(',', '.')) || 0 : 0,
          source: 'Loja',
          source_id: itemId,
          description: `${item.name}${rewardType === 'coupon' ? ' — Cupom' : ' — Entrega física'}`,
        } as any);
        deliveryStatus = 'pending_manual';
        deliveryNote = rewardType === 'coupon' ? 'Cupom gerado, aguardando entrega' : 'Item físico, aguardando entrega';
      }

      // Record purchase with delivery status
      await supabase.from('store_purchases').insert({
        cpf: playerCpf,
        store_item_id: itemId,
        price_coins: item.price_coins || 0,
        price_xp: item.price_xp || 0,
        status: deliveryStatus,
        reward_type: rewardType,
        reward_value: rewardValue,
        delivered_at: deliveryStatus === 'delivered' ? new Date().toISOString() : null,
        delivery_note: deliveryNote,
      } as any);

      // Reduce stock
      if (item.stock !== null) {
        await supabase.from('store_items').update({ stock: item.stock - 1 } as any).eq('id', itemId);
      }

      // Log
      try {
        await supabase.from('player_activity_log').insert({
          cpf: playerCpf,
          type: 'store',
          amount: -(item.price_coins || 0),
          source: 'Loja',
          source_id: itemId,
          description: `Comprou: ${item.name}`,
        } as any);
        if (deliveryStatus === 'delivered') {
          await supabase.from('player_activity_log').insert({
            cpf: playerCpf,
            type: rewardType,
            amount: parseFloat(rewardValue.replace(/[^\d.,]/g, '').replace(',', '.')) || 0,
            source: 'Loja',
            source_id: itemId,
            description: deliveryNote,
          } as any);
        }
      } catch { /* ignore */ }

      const resultMsg = deliveryStatus === 'delivered'
        ? `${item.name} entregue com sucesso!`
        : deliveryStatus === 'pending_manual'
          ? `${item.name} comprado! Entrega em processamento.`
          : `${item.name} comprado, mas houve um problema na entrega. Contate o suporte.`;

      return new Response(JSON.stringify({
        success: true,
        item_name: item.name,
        delivery_status: deliveryStatus,
        delivery_note: deliveryNote,
        message: resultMsg,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Claim pending reward
    if (action === 'claim_reward') {
      if (!playerCpf) {
        return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const rewardId = url.searchParams.get('reward_id');
      if (!rewardId) {
        return new Response(JSON.stringify({ error: 'reward_id obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: reward } = await supabase.from('player_rewards_pending')
        .select('*').eq('id', rewardId).eq('cpf', playerCpf).is('claimed_at', null).maybeSingle();
      if (!reward) {
        return new Response(JSON.stringify({ error: 'Recompensa não encontrada ou já resgatada' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Mark claimed
      await supabase.from('player_rewards_pending')
        .update({ claimed_at: new Date().toISOString() } as any)
        .eq('id', rewardId);

      // Award to wallet
      if (reward.reward_type === 'coins') {
        const { data: w } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
        await supabase.from('player_wallets')
          .update({ coins: (w?.coins || 0) + reward.reward_value } as any)
          .eq('cpf', playerCpf);
      } else if (reward.reward_type === 'xp') {
        const { data: w } = await supabase.from('player_wallets').select('xp').eq('cpf', playerCpf).maybeSingle();
        await supabase.from('player_wallets')
          .update({ xp: (w?.xp || 0) + reward.reward_value } as any)
          .eq('cpf', playerCpf);
      }

      // Log
      try {
        await supabase.from('player_activity_log').insert({
          cpf: playerCpf,
          type: reward.reward_type,
          amount: reward.reward_value,
          source: reward.source,
          description: `Resgatou: ${reward.description || reward.source}`,
        } as any);
      } catch { /* ignore */ }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mission opt-in
    if (action === 'mission_optin') {
      if (!playerCpf) {
        return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const missionId = url.searchParams.get('mission_id');
      if (!missionId) {
        return new Response(JSON.stringify({ error: 'mission_id obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase.from('player_mission_progress').upsert({
        cpf: playerCpf,
        mission_id: missionId,
        opted_in: true,
        started_at: new Date().toISOString(),
      } as any, { onConflict: 'cpf,mission_id' });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mission claim (manual claim)
    if (action === 'mission_claim') {
      if (!playerCpf) {
        return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const missionId = url.searchParams.get('mission_id');
      if (!missionId) {
        return new Response(JSON.stringify({ error: 'mission_id obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check progress
      const { data: prog } = await supabase.from('player_mission_progress')
        .select('*').eq('cpf', playerCpf).eq('mission_id', missionId).maybeSingle();
      if (!prog || !prog.completed) {
        return new Response(JSON.stringify({ error: 'Missão não concluída' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (prog.claimed) {
        return new Response(JSON.stringify({ error: 'Já resgatada' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get mission to award reward
      const { data: mission } = await supabase.from('missions').select('*').eq('id', missionId).single();
      if (!mission) {
        return new Response(JSON.stringify({ error: 'Missão não encontrada' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Award reward
      if (mission.reward_type === 'coins' && mission.reward_value > 0) {
        const { data: w } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
        await supabase.from('player_wallets').update({ coins: (w?.coins || 0) + mission.reward_value } as any).eq('cpf', playerCpf);
      } else if (mission.reward_type === 'xp' && mission.reward_value > 0) {
        const { data: w } = await supabase.from('player_wallets').select('xp').eq('cpf', playerCpf).maybeSingle();
        await supabase.from('player_wallets').update({ xp: (w?.xp || 0) + mission.reward_value } as any).eq('cpf', playerCpf);
      } else if ((mission.reward_type === 'bonus' || mission.reward_type === 'free_bet') && mission.reward_value > 0) {
        try {
          await supabase.from('player_rewards_pending').insert({
            cpf: playerCpf,
            reward_type: mission.reward_type,
            reward_value: mission.reward_value,
            source: mission.name,
            description: `Missão: ${mission.name}`,
          } as any);
        } catch { /* ignore */ }
      }

      // Mark as claimed
      await supabase.from('player_mission_progress')
        .update({ claimed: true, claimed_at: new Date().toISOString() } as any)
        .eq('cpf', playerCpf).eq('mission_id', missionId);

      // Log activity
      try {
        await supabase.from('player_activity_log').insert({
          cpf: playerCpf,
          type: 'mission_claim',
          amount: mission.reward_value,
          source: mission.name,
          description: `Missão resgatada: ${mission.name}`,
        } as any);
      } catch { /* ignore */ }

      return new Response(JSON.stringify({ success: true, reward_type: mission.reward_type, reward_value: mission.reward_value }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Play mini game (scratch_card, gift_box, prize_drop)
    if (action === 'play_mini_game') {
      if (!playerCpf) {
        return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const gameId = url.searchParams.get('game_id');
      if (!gameId) {
        return new Response(JSON.stringify({ error: 'game_id obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get game config
      const { data: game } = await supabase.from('mini_games').select('*').eq('id', gameId).eq('active', true).single();
      if (!game) {
        return new Response(JSON.stringify({ error: 'Jogo não encontrado' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get/create attempt record
      const today = new Date().toISOString().slice(0, 10);
      let { data: attemptRec } = await supabase.from('player_mini_game_attempts')
        .select('*').eq('cpf', playerCpf).eq('game_id', gameId).maybeSingle();

      if (!attemptRec) {
        const { data: newRec } = await supabase.from('player_mini_game_attempts')
          .upsert({ cpf: playerCpf, game_id: gameId, attempts_today: 0, last_attempt_date: today, total_attempts: 0 } as any, { onConflict: 'cpf,game_id' })
          .select().single();
        attemptRec = newRec;
      }

      // Reset if new day
      if (attemptRec && attemptRec.last_attempt_date !== today) {
        attemptRec.attempts_today = 0;
      }

      const attemptsUsed = attemptRec?.attempts_today || 0;
      const maxAttempts = game.max_attempts_per_day || 1;
      const freeAttempts = game.free_attempts_per_day || 1;

      // Check max
      if (maxAttempts > 0 && attemptsUsed >= maxAttempts) {
        return new Response(JSON.stringify({ error: 'Limite de tentativas atingido', max: maxAttempts }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check coin cost
      const isFree = attemptsUsed < freeAttempts;
      let coinsCost = 0;
      if (!isFree && game.attempt_cost_coins > 0) {
        coinsCost = game.attempt_cost_coins;
        const { data: wallet } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
        if (!wallet || (wallet.coins || 0) < coinsCost) {
          return new Response(JSON.stringify({ error: 'Moedas insuficientes', cost: coinsCost, balance: wallet?.coins || 0 }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        await supabase.from('player_wallets').update({ coins: (wallet.coins || 0) - coinsCost } as any).eq('cpf', playerCpf);
      }

      // Get prizes
      const { data: prizes } = await supabase.from('mini_game_prizes')
        .select('*').eq('game_id', gameId).eq('active', true).order('sort_order');

      if (!prizes || prizes.length === 0) {
        return new Response(JSON.stringify({ error: 'Nenhum prêmio configurado' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Weighted random selection
      const totalWeight = prizes.reduce((s: number, p: any) => s + (p.probability || 1), 0);
      let random = Math.random() * totalWeight;
      let selected = prizes[0];
      for (const prize of prizes) {
        random -= (prize.probability || 1);
        if (random <= 0) { selected = prize; break; }
      }

      // Update attempt record
      await supabase.from('player_mini_game_attempts')
        .upsert({
          cpf: playerCpf,
          game_id: gameId,
          attempts_today: attemptsUsed + 1,
          last_attempt_date: today,
          total_attempts: (attemptRec?.total_attempts || 0) + 1,
        } as any, { onConflict: 'cpf,game_id' });

      // Award prize
      if (selected.type === 'coins' && selected.value > 0) {
        const { data: w } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
        await supabase.from('player_wallets').update({ coins: (w?.coins || 0) + selected.value } as any).eq('cpf', playerCpf);
      } else if (selected.type === 'xp' && selected.value > 0) {
        const { data: w } = await supabase.from('player_wallets').select('xp').eq('cpf', playerCpf).maybeSingle();
        await supabase.from('player_wallets').update({ xp: (w?.xp || 0) + selected.value } as any).eq('cpf', playerCpf);
      } else if ((selected.type === 'bonus' || selected.type === 'free_bet') && selected.value > 0) {
        try {
          await supabase.from('player_rewards_pending').insert({
            cpf: playerCpf,
            reward_type: selected.type,
            reward_value: selected.value,
            source: game.name,
            description: `${selected.label} - ${game.name}`,
          } as any);
        } catch { /* ignore */ }
      }

      // Log activity
      try {
        await supabase.from('player_activity_log').insert({
          cpf: playerCpf,
          type: game.type,
          amount: selected.type === 'nothing' ? 0 : selected.value,
          source: game.name,
          description: `${game.name}: ${selected.label}`,
        } as any);
      } catch { /* ignore */ }

      // For scratch card: return 9 cells (3 winning + 6 random), shuffled
      let gameData: any = {};
      if (game.type === 'scratch_card') {
        const cells: any[] = [];
        for (let i = 0; i < 3; i++) cells.push({ prize: selected, winning: true });
        const others = prizes.filter((p: any) => p.id !== selected.id);
        for (let i = 0; i < 6; i++) {
          cells.push({ prize: others[i % Math.max(1, others.length)] || selected, winning: false });
        }
        for (let i = cells.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [cells[i], cells[j]] = [cells[j], cells[i]];
        }
        gameData.cells = cells;
      } else if (game.type === 'gift_box') {
        const numBoxes = 6;
        const boxes: any[] = [];
        boxes.push({ prize: selected, winning: true });
        const nothing = prizes.find((p: any) => p.type === 'nothing') || { label: 'Tente novamente', type: 'nothing', value: 0 };
        for (let i = 0; i < numBoxes - 1; i++) {
          boxes.push({ prize: nothing, winning: false });
        }
        for (let i = boxes.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [boxes[i], boxes[j]] = [boxes[j], boxes[i]];
        }
        gameData.boxes = boxes;
      }

      return new Response(JSON.stringify({
        prize: selected,
        prizes,
        game_type: game.type,
        game_data: gameData,
        attempts_used: attemptsUsed + 1,
        max_attempts: maxAttempts,
        free_attempts: freeAttempts,
        coins_spent: coinsCost,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Ação desconhecida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
