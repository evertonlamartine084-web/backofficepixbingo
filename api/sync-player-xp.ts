import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse } from './_cors.js';
import { platformLogin, buildPlatformHeaders, buildDataTableParams, USER_COLUMNS } from './_platform.js';

export const config = { runtime: 'edge', maxDuration: 60 };

// --- Mission progress helper ---

async function updateMissionProgress(supabase: SupabaseClient, cpf: string, eventType: string, eventAmount: number, eventCount: number = 1, transactions?: Array<{ valor: number; ts: number }>) {
  const CONDITION_MAP: Record<string, string[]> = {
    deposit: ['deposit'], bet: ['bet'], play_keno: ['play_keno', 'total_games'], play_cassino: ['play_cassino', 'total_games'],
  };
  const matchingConditions = CONDITION_MAP[eventType] || [];
  if (matchingConditions.length === 0) return;

  const { data: playerSegments } = await supabase.from('segment_items').select('segment_id').eq('cpf', cpf);
  const playerSegmentIds = new Set((playerSegments || []).map((s: Record<string, unknown>) => s.segment_id));

  const { data: missions } = await supabase.from('missions').select('*').eq('status', 'ATIVO').eq('active', true).in('condition_type', matchingConditions);

  for (const mission of (missions || [])) {
    if (mission.segment_id && !playerSegmentIds.has(mission.segment_id)) continue;

    const now = new Date().toISOString();
    if (mission.start_date && now < mission.start_date) continue;
    if (mission.end_date && now > mission.end_date) continue;

    const { data: existing } = await supabase.from('player_mission_progress').select('*').eq('cpf', cpf).eq('mission_id', mission.id).maybeSingle();

    if (mission.require_optin && (!existing || !existing.opted_in)) continue;
    if (existing?.completed && existing?.claimed) {
      if (mission.recurrence === 'none') continue;
      const resetAt = existing.reset_at ? new Date(existing.reset_at) : new Date(existing.completed_at || existing.created_at);
      const nowDate = new Date();
      let shouldReset = false;
      if (mission.recurrence === 'daily') shouldReset = nowDate.toDateString() !== resetAt.toDateString();
      else if (mission.recurrence === 'weekly') shouldReset = (nowDate.getTime() - resetAt.getTime()) / 86400000 >= 7;
      else if (mission.recurrence === 'monthly') shouldReset = nowDate.getMonth() !== resetAt.getMonth() || nowDate.getFullYear() !== resetAt.getFullYear();
      if (shouldReset) {
        await supabase.from('player_mission_progress').update({ progress: 0, completed: false, claimed: false, completed_at: null, claimed_at: null, reset_at: now } as Record<string, unknown>).eq('cpf', cpf).eq('mission_id', mission.id);
      } else continue;
    }
    if (existing?.completed && !existing?.claimed) continue;

    const currentProgress = existing?.progress || 0;
    const target = mission.condition_value || 1;

    // Filter transactions to only those AFTER opt-in (started_at)
    let increment: number;
    if (transactions && existing?.started_at) {
      const optInTs = new Date(existing.started_at).getTime();
      const afterOptIn = transactions.filter(t => t.ts >= optInTs);
      increment = mission.condition_mode === 'count' ? afterOptIn.length : afterOptIn.reduce((sum, t) => sum + t.valor, 0);
    } else {
      // No transactions detail or no started_at — use totals as-is
      increment = mission.condition_mode === 'count' ? eventCount : eventAmount;
    }
    if (increment <= 0) continue;

    const newProgress = Math.min(currentProgress + increment, target);
    const isCompleted = newProgress >= target;

    if (existing) {
      await supabase.from('player_mission_progress').update({
        progress: newProgress, completed: isCompleted, ...(isCompleted ? { completed_at: now } : {}),
      } as Record<string, unknown>).eq('cpf', cpf).eq('mission_id', mission.id);
    } else {
      await supabase.from('player_mission_progress').insert({
        cpf, mission_id: mission.id, progress: newProgress, target, opted_in: !mission.require_optin,
        completed: isCompleted, ...(isCompleted ? { completed_at: now } : {}), started_at: now,
      } as Record<string, unknown>);
    }

    // Auto-credit reward if mission completed and doesn't need manual claim
    if (isCompleted && !mission.manual_claim) {
      try {
        await supabase.from('player_mission_progress').update({ claimed: true, claimed_at: now } as Record<string, unknown>).eq('cpf', cpf).eq('mission_id', mission.id);
        await supabase.from('player_rewards_pending').insert({
          cpf, reward_type: mission.reward_type, reward_value: mission.reward_value, source: mission.name, source_id: mission.id,
        } as Record<string, unknown>);
        await supabase.from('player_activity_log').insert({
          cpf, type: 'mission_complete', amount: mission.reward_value, source: mission.name, source_id: mission.id,
          description: `Missão completada: ${mission.name} — ${mission.reward_type} ${mission.reward_value}`,
        } as Record<string, unknown>);
      } catch { /* ignore */ }
    }
  }
}

// --- Core XP sync logic ---

interface SyncResult {
  success: boolean;
  cpf: string;
  xp_earned: number;
  _debug?: unknown;
  bet_xp: number;
  deposit_xp: number;
  total_bets: number;
  total_deposits: number;
  transactions_processed: number;
  levels_gained: number;
  new_level: number;
  rewards_credited: RewardCredit[];
  error?: string;
}

interface RewardCredit {
  level: number;
  name: string;
  tier: string;
  rewards: string[];
}

interface Movimentacao {
  tipo: string;
  valor: string | number;
  data_registro: string;
  jogo?: string;
  descricao?: string;
  carteira?: string;
}

interface Historico {
  operacao?: string;
  tipo?: string;
  valor: string | number;
  data_registro: string;
  jogo?: string;
  carteira?: string;
  saldo?: string | number;
}

interface NormalizedTx {
  tipo: string;
  valor: string | number;
  data_registro: string;
  jogo?: string;
  descricao?: string;
  carteira?: string;
}

export async function syncPlayerXp(cpf: string, supabase: SupabaseClient, debug = false): Promise<SyncResult> {
  const result: SyncResult = {
    success: false, cpf, xp_earned: 0, bet_xp: 0, deposit_xp: 0,
    total_bets: 0, total_deposits: 0, transactions_processed: 0,
    levels_gained: 0, new_level: 0, rewards_credited: [],
  };

  try {
    // 1. Get XP config weights
    const { data: xpConfigs } = await supabase.from('xp_config').select('*');
    if (!xpConfigs || xpConfigs.length === 0) {
      result.error = 'xp_config not configured';
      return result;
    }

    const weights: Record<string, number> = {};
    for (const cfg of xpConfigs) {
      weights[cfg.action || cfg.type || cfg.name] = cfg.xp_per_unit ?? cfg.weight ?? cfg.value ?? 1;
    }
    const apostaWeight = weights['aposta'] ?? weights['bet'] ?? 1;
    const depositoWeight = weights['deposito'] ?? weights['deposit'] ?? 0.3;

    // 2. Get or create player wallet
    let { data: wallet } = await supabase.from('player_wallets')
      .select('*').eq('cpf', cpf).maybeSingle();

    if (!wallet) {
      const { data: newWallet } = await supabase.from('player_wallets')
        .upsert({ cpf, coins: 0, xp: 0, level: 1, total_xp_earned: 0 } as Record<string, unknown>, { onConflict: 'cpf' })
        .select().single();
      wallet = newWallet;
    }

    if (!wallet) {
      result.error = 'Failed to get/create player wallet';
      return result;
    }

    // 3. Get platform config for login credentials
    const { data: platformConfig } = await supabase.from('platform_config')
      .select('*').eq('active', true).order('created_at', { ascending: false }).limit(1).single();

    if (!platformConfig) {
      result.error = 'Platform config not found';
      return result;
    }

    // 4. Login to platform
    const siteUrl = (platformConfig.site_url || 'https://pixbingobr.concurso.club').replace(/\/+$/, '');
    const login = await platformLogin(siteUrl, platformConfig.username, platformConfig.password, platformConfig.login_url);

    if (!login.success) {
      result.error = 'Platform login failed';
      return result;
    }

    const headers = buildPlatformHeaders(login.cookies, siteUrl);

    // 5. Find player UUID on platform
    const searchStrategies = [
      { busca_cpf: cpf },
      { busca_username: cpf },
    ];

    let playerUuid: string | null = null;
    for (const extra of searchStrategies) {
      if (playerUuid) break;
      try {
        const params = buildDataTableParams({
          columns: USER_COLUMNS,
          length: 5,
          extraParams: extra,
        });

        const res = await fetch(`${siteUrl}/usuarios/listar?${params.toString()}`, {
          method: 'GET', headers, signal: AbortSignal.timeout(15000),
        });
        const data = JSON.parse(await res.text());
        const rows = data?.data || data?.aaData || [];
        if (rows.length > 0 && rows[0].uuid) {
          playerUuid = rows[0].uuid;
        }
      } catch { /* ignore */ }
    }

    if (!playerUuid) {
      result.error = 'Player UUID not found on platform';
      return result;
    }

    // 6. Fetch real game transactions via /transferencias/listar (has actual bets, deposits)
    let movimentacoes: Movimentacao[] = [];
    let historico: Historico[] = [];
    try {
      // Build DataTables params for /transferencias/listar filtered by CPF
      const txParams = buildDataTableParams({
        columns: ['tipo', 'operacao', 'valor', 'carteira', 'jogo', 'data_registro'],
        length: 500,
        orderColumn: 5,
        orderDir: 'desc',
        extraParams: { busca_cpf: cpf },
      });

      const txRes = await fetch(`${siteUrl}/transferencias/listar?${txParams.toString()}`, {
        method: 'GET', headers, signal: AbortSignal.timeout(15000),
      });
      const txData = JSON.parse(await txRes.text());
      // /transferencias/listar returns DataTables format: { data: [...] } or { aaData: [...] }
      const rows = txData?.data || txData?.aaData || [];
      movimentacoes = rows.map((r: Record<string, unknown>) => ({
        tipo: String(r.tipo || r.operacao || ''),
        valor: r.valor as string | number,
        data_registro: String(r.data_registro || ''),
        jogo: String(r.jogo || ''),
        descricao: String(r.descricao || ''),
        carteira: String(r.carteira || ''),
      }));
    } catch (e: unknown) {
      result.error = `Failed to fetch transactions: ${e instanceof Error ? e.message : 'Erro'}`;
      return result;
    }

    // Also fetch /usuarios/transacoes for bonus/deposit history
    try {
      const txRes2 = await fetch(`${siteUrl}/usuarios/transacoes?id=${playerUuid}`, {
        headers, signal: AbortSignal.timeout(15000),
      });
      const txData2 = JSON.parse(await txRes2.text());
      historico = txData2?.historico || [];
    } catch { /* ignore — transferencias/listar is the primary source */ }

    // Normalize all transactions into a unified format
    const allTx: NormalizedTx[] = [
      ...movimentacoes.map((m: Movimentacao) => ({
        tipo: (m.tipo || '').toUpperCase(),
        valor: m.valor,
        data_registro: m.data_registro,
        jogo: (m.jogo || '').toUpperCase(),
        descricao: (m.descricao || '').toUpperCase(),
        carteira: (m.carteira || '').toUpperCase(),
      })),
      ...historico.map((h: Historico) => ({
        tipo: (h.operacao || h.tipo || '').toUpperCase(),
        valor: h.valor,
        data_registro: h.data_registro,
        jogo: (h.jogo || '').toUpperCase(),
        carteira: (h.carteira || '').toUpperCase(),
      })),
    ];

    // 7. Parse transactions and filter by last_xp_sync
    const lastSync = wallet.last_xp_sync ? new Date(wallet.last_xp_sync).getTime() : null;

    if (allTx.length === 0) {
      result.success = true;
      result.new_level = wallet.level || 1;
      return result;
    }

    const parseVal = (v: string | number | null | undefined): number => {
      if (typeof v === 'number') return Math.abs(v);
      if (!v) return 0;
      const s = String(v).trim();
      if (s.includes(',')) return Math.abs(Number(s.replace(/\./g, '').replace(',', '.'))) || 0;
      return Math.abs(Number(s)) || 0;
    };

    const parseDate = (s: string): number => {
      if (!s) return 0;
      const brMatch = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2}):(\d{2})/);
      if (brMatch) return new Date(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}T${brMatch[4]}:${brMatch[5]}:${brMatch[6]}`).getTime();
      return new Date(s).getTime();
    };

    let totalBets = 0;
    let totalDeposits = 0;
    let betCount = 0;
    let depositCount = 0;
    let newestTs = 0;
    let processedCount = 0;

    for (const tx of allTx) {
      const tipo = tx.tipo;
      const valor = parseVal(tx.valor);
      const txTs = parseDate(tx.data_registro || '');

      // Skip transactions we already processed
      if (lastSync && txTs && txTs <= lastSync) continue;

      // Track newest transaction date
      if (txTs > newestTs) newestTs = txTs;

      // Classify transaction
      const isBet = tipo.includes('COMPRA') || tipo.includes('APOSTA') || tipo.includes('BET') || tipo.includes('PURCHASE');
      const isDeposit = tipo.includes('DEPOSITO') || tipo.includes('DEPOSIT') || tipo.includes('PIX_IN');

      if (isBet && valor > 0) {
        totalBets += valor;
        betCount++;
        processedCount++;
      } else if (isDeposit && valor > 0) {
        totalDeposits += valor;
        depositCount++;
        processedCount++;
      }
    }

    result.total_bets = totalBets;
    result.total_deposits = totalDeposits;

    if (debug) {
      // Show raw transaction types and classification
      const debugTxs = allTx.slice(0, 50).map(tx => {
        const tipo = tx.tipo;
        const valor = parseVal(tx.valor);
        const allFields = `${tipo} ${tx.jogo || ''} ${tx.carteira || ''} ${tx.descricao || ''}`;
        const isBet = tipo.includes('COMPRA') || tipo.includes('APOSTA') || tipo.includes('BET') || tipo.includes('PURCHASE');
        const isDeposit = tipo.includes('DEPOSITO') || tipo.includes('DEPOSIT') || tipo.includes('PIX_IN');
        const isKenoBet = isBet && (allFields.includes('KENO') || allFields.includes('BINGO') || allFields.includes('LOTERIA'));
        return { tipo, jogo: tx.jogo || '', carteira: tx.carteira || '', descricao: tx.descricao || '', valor, data: tx.data_registro, class: isKenoBet ? 'KENO' : isBet ? 'CASSINO' : isDeposit ? 'DEPOSITO' : 'OUTRO' };
      });
      result._debug = { total_raw_tx: allTx.length, sample: debugTxs, betCount, depositCount, lastSync: lastSync ? new Date(lastSync).toISOString() : null };
    }
    result.transactions_processed = processedCount;

    if (processedCount === 0) {
      // Nothing new to process — but fix level if it drifted
      const { data: fixLevels } = await supabase.from('levels').select('level,xp_required').order('level');
      if (fixLevels?.length) {
        let correctLevel = 0;
        for (const lvl of fixLevels) {
          if ((wallet.xp || 0) >= lvl.xp_required) correctLevel = lvl.level;
        }
        if (correctLevel !== (wallet.level || 0)) {
          await supabase.from('player_wallets').update({ level: correctLevel } as Record<string, unknown>).eq('cpf', cpf);
          wallet.level = correctLevel;
        }
      }
      result.success = true;
      result.new_level = wallet.level || 1;
      return result;
    }

    // 8. Calculate XP
    const betXp = Math.floor(totalBets * apostaWeight);
    const depXp = Math.floor(totalDeposits * depositoWeight);
    const totalXpEarned = betXp + depXp;

    result.bet_xp = betXp;
    result.deposit_xp = depXp;
    result.xp_earned = totalXpEarned;

    if (totalXpEarned <= 0) {
      result.success = true;
      result.new_level = wallet.level || 1;
      return result;
    }

    // 9. Update player wallet XP
    const currentXp = (wallet.xp || 0) + totalXpEarned;
    const currentTotalXp = (wallet.total_xp_earned || 0) + totalXpEarned;

    // 10. Check level ups
    const { data: levels } = await supabase.from('levels')
      .select('*').order('level');

    let newLevel = wallet.level || 1;
    const rewardsCredited: RewardCredit[] = [];

    if (levels && levels.length > 0) {
      for (const lvl of levels) {
        // Check if player crossed this level threshold
        if (lvl.level > (wallet.level || 1) && currentXp >= lvl.xp_required) {
          newLevel = lvl.level;

          // Credit level-up rewards
          const rewardUpdate: Record<string, number> = {};
          const rewardDesc: string[] = [];

          if (lvl.reward_coins && lvl.reward_coins > 0) {
            rewardUpdate.coins_bonus = lvl.reward_coins;
            rewardDesc.push(`+${lvl.reward_coins} moedas`);
          }
          if (lvl.reward_gems && lvl.reward_gems > 0) {
            rewardUpdate.gems_bonus = lvl.reward_gems;
            rewardDesc.push(`+${lvl.reward_gems} gemas`);
          }
          if (lvl.reward_diamonds && lvl.reward_diamonds > 0) {
            rewardUpdate.diamonds_bonus = lvl.reward_diamonds;
            rewardDesc.push(`+${lvl.reward_diamonds} diamantes`);
          }

          // Log level-up reward
          try {
            await supabase.from('level_rewards_log').insert({
              cpf,
              level: lvl.level,
              tier: lvl.tier,
              level_name: lvl.name,
              reward_coins: lvl.reward_coins || 0,
              reward_gems: lvl.reward_gems || 0,
              reward_diamonds: lvl.reward_diamonds || 0,
            } as Record<string, unknown>);
          } catch { /* ignore */ }

          rewardsCredited.push({
            level: lvl.level,
            name: lvl.name,
            tier: lvl.tier,
            rewards: rewardDesc,
          });
        }
      }
    }

    result.levels_gained = newLevel - (wallet.level || 1);
    result.new_level = newLevel;
    result.rewards_credited = rewardsCredited;

    // 11. Build wallet update
    const walletUpdate: Record<string, unknown> = {
      xp: currentXp,
      total_xp_earned: currentTotalXp,
      level: newLevel,
      last_xp_sync: newestTs ? new Date(newestTs).toISOString() : new Date().toISOString(),
    };

    // Add level-up reward currencies
    if (rewardsCredited.length > 0) {
      let bonusCoins = 0, bonusGems = 0, bonusDiamonds = 0;
      for (const reward of rewardsCredited) {
        // Re-fetch level data for reward values
        const lvl = levels?.find((l) => l.level === reward.level);
        if (lvl) {
          bonusCoins += lvl.reward_coins || 0;
          bonusGems += lvl.reward_gems || 0;
          bonusDiamonds += lvl.reward_diamonds || 0;
        }
      }
      if (bonusCoins > 0) walletUpdate.coins = (wallet.coins || 0) + bonusCoins;
      if (bonusDiamonds > 0) {
        walletUpdate.diamonds = (wallet.diamonds || 0) + bonusDiamonds;
        walletUpdate.total_diamonds_earned = (wallet.total_diamonds_earned || 0) + bonusDiamonds;
      }
      // gems stored as xp in some setups, but we keep them separate if column exists
    }

    await supabase.from('player_wallets').update(walletUpdate).eq('cpf', cpf);

    // 12. Log XP history
    if (betXp > 0) {
      try {
        await supabase.from('xp_history').insert({
          cpf,
          action: 'aposta',
          amount: totalBets,
          xp_earned: betXp,
          description: `XP de apostas: R$${totalBets.toFixed(2)} x ${apostaWeight} = ${betXp} XP`,
        } as Record<string, unknown>);
      } catch { /* ignore */ }
    }

    if (depXp > 0) {
      try {
        await supabase.from('xp_history').insert({
          cpf,
          action: 'deposito',
          amount: totalDeposits,
          xp_earned: depXp,
          description: `XP de depósitos: R$${totalDeposits.toFixed(2)} x ${depositoWeight} = ${depXp} XP`,
        } as Record<string, unknown>);
      } catch { /* ignore */ }
    }

    // 13. Log level-ups in activity log
    for (const reward of rewardsCredited) {
      try {
        await supabase.from('player_activity_log').insert({
          cpf,
          type: 'level_up',
          amount: reward.level,
          source: 'XP Sync',
          description: `Subiu para nível ${reward.level} (${reward.name || reward.tier})! ${reward.rewards.join(', ')}`,
        } as Record<string, unknown>);
      } catch { /* ignore */ }
    }

    // 14. Update mission progress based on transaction totals
    // We classify bets into keno/cassino based on transaction type keywords
    try {
      let totalKeno = 0;
      let totalCassino = 0;
      let kenoCount = 0;
      let cassinoCount = 0;
      const kenoTxs: Array<{ valor: number; ts: number }> = [];
      const cassinoTxs: Array<{ valor: number; ts: number }> = [];
      const betTxs: Array<{ valor: number; ts: number }> = [];
      const depositTxs: Array<{ valor: number; ts: number }> = [];
      for (const tx of allTx) {
        const tipo = tx.tipo;
        const valor = parseVal(tx.valor);
        const txTs = parseDate(tx.data_registro || '');
        if (lastSync && txTs && txTs <= lastSync) continue;
        const isBet = tipo.includes('COMPRA') || tipo.includes('APOSTA') || tipo.includes('BET') || tipo.includes('PURCHASE');
        const isDeposit = tipo.includes('DEPOSITO') || tipo.includes('DEPOSIT') || tipo.includes('PIX_IN');
        if (isBet && valor > 0) {
          betTxs.push({ valor, ts: txTs });
          // Classify by jogo, carteira, descricao, or tipo keywords
          const allFields = `${tipo} ${tx.jogo || ''} ${tx.carteira || ''} ${tx.descricao || ''}`;
          const isKenoBet = allFields.includes('KENO') || allFields.includes('BINGO') || allFields.includes('LOTERIA');
          if (isKenoBet) { totalKeno += valor; kenoCount++; kenoTxs.push({ valor, ts: txTs }); }
          else { totalCassino += valor; cassinoCount++; cassinoTxs.push({ valor, ts: txTs }); }
        } else if (isDeposit && valor > 0) {
          depositTxs.push({ valor, ts: txTs });
        }
      }
      // Update missions — pass individual transactions so progress can filter by opt-in date
      const missionEvents: Array<{ event_type: string; event_amount: number; event_count: number; txs: Array<{ valor: number; ts: number }> }> = [];
      if (betTxs.length > 0) missionEvents.push({ event_type: 'bet', event_amount: totalBets, event_count: betCount, txs: betTxs });
      if (depositTxs.length > 0) missionEvents.push({ event_type: 'deposit', event_amount: totalDeposits, event_count: depositCount, txs: depositTxs });
      if (kenoTxs.length > 0) missionEvents.push({ event_type: 'play_keno', event_amount: totalKeno, event_count: kenoCount, txs: kenoTxs });
      if (cassinoTxs.length > 0) missionEvents.push({ event_type: 'play_cassino', event_amount: totalCassino, event_count: cassinoCount, txs: cassinoTxs });

      for (const evt of missionEvents) {
        await updateMissionProgress(supabase, cpf, evt.event_type, evt.event_amount, evt.event_count, evt.txs);
      }
    } catch { /* mission update is best-effort */ }

    result.success = true;
    return result;

  } catch (e: unknown) {
    result.error = e instanceof Error ? e.message : 'Erro';
    return result;
  }
}

// --- HTTP handler ---

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let cpf: string | null = null;

    if (req.method === 'POST') {
      const body = await req.json();
      cpf = body.cpf || null;
    } else {
      const url = new URL(req.url);
      cpf = url.searchParams.get('cpf') || null;
    }

    const urlObj = new URL(req.url);
    const debug = urlObj.searchParams.get('debug') === 'true';

    if (!cpf) {
      return new Response(JSON.stringify({ success: false, error: 'CPF é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize CPF
    cpf = cpf.replace(/[.\-\s/]/g, '');

    const result = await syncPlayerXp(cpf, supabase, debug);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
