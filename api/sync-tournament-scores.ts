import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function doLogin(siteUrl: string, username: string, password: string, loginUrl?: string | null): Promise<{ cookies: string; success: boolean }> {
  const baseUrl = siteUrl.replace(/\/+$/, '');
  let loginTarget = `${baseUrl}/login`;
  if (loginUrl) {
    const cleanLogin = loginUrl.replace(/\/+$/, '');
    loginTarget = cleanLogin.endsWith('/login') ? cleanLogin : `${cleanLogin}/login`;
  }

  let initialCookies = '';
  try {
    const initRes = await fetch(baseUrl, { method: 'GET', headers: { 'Accept': 'text/html' }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const setCookies = initRes.headers.getSetCookie?.() || [];
    initialCookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
  } catch {}

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/json,*/*',
      'Referer': `${baseUrl}/`,
      'Origin': baseUrl,
    };
    if (initialCookies) headers['Cookie'] = initialCookies;

    const res = await fetch(loginTarget, {
      method: 'POST', headers,
      body: new URLSearchParams({ usuario: username, senha: password }).toString(),
      redirect: 'manual', signal: AbortSignal.timeout(10000),
    });

    const setCookies = res.headers.getSetCookie?.() || [];
    const cookieMap = new Map<string, string>();
    for (const c of initialCookies.split('; ').filter(Boolean)) { const [k, ...v] = c.split('='); cookieMap.set(k, v.join('=')); }
    for (const sc of setCookies) { const [kv] = sc.split(';'); const [k, ...v] = kv.split('='); cookieMap.set(k.trim(), v.join('=')); }
    const cookies = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get('location') || '';
      if (!location.includes('/login') && !location.includes('error')) return { cookies, success: true };
    }
    if (res.ok) {
      const text = await res.text();
      try { const data = JSON.parse(text); if (data.status === true || data.logged === true) return { cookies, success: true }; } catch {}
    }
  } catch {}
  return { cookies: '', success: false };
}

function buildHeaders(cookies: string, baseUrl: string): Record<string, string> {
  return { 'Accept': 'application/json, text/javascript, */*', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': cookies, 'Referer': baseUrl };
}

async function fetchJSON(url: string, headers: Record<string, string>, method = 'GET', body?: Record<string, string>): Promise<any> {
  const opts: RequestInit = { method, headers: { ...headers }, signal: AbortSignal.timeout(12000) };
  if (body && method === 'POST') {
    opts.body = new URLSearchParams(body).toString();
    (opts.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 500), _status: res.status }; }
}

async function creditBonusOnPlatform(baseUrl: string, headers: Record<string, string>, playerUuid: string, amount: number, password: string): Promise<{ success: boolean; msg?: string }> {
  const result = await fetchJSON(`${baseUrl}/usuarios/creditos`, headers, 'POST', {
    uuid: playerUuid, carteira: 'BONUS', valor: String(amount), senha: password,
  });
  const ok = result?.status === true || String(result?.msg || '').toLowerCase().includes('sucesso');
  return { success: ok, msg: result?.msg || result?.Msg || JSON.stringify(result).slice(0, 200) };
}

async function searchPlayerByCpf(baseUrl: string, headers: Record<string, string>, cpf: string): Promise<string | null> {
  const params = new URLSearchParams({ draw: '1', start: '0', length: '1', busca_cpf: cpf });
  const userCols = ['username', 'celular', 'cpf', 'created_at', 'ultimo_login', 'situacao', 'uuid'];
  userCols.forEach((col, i) => {
    params.set(`columns[${i}][data]`, col); params.set(`columns[${i}][name]`, '');
    params.set(`columns[${i}][searchable]`, 'true'); params.set(`columns[${i}][orderable]`, 'true');
    params.set(`columns[${i}][search][value]`, ''); params.set(`columns[${i}][search][regex]`, 'false');
  });
  params.set('order[0][column]', '0'); params.set('order[0][dir]', 'asc');
  params.set('search[value]', ''); params.set('search[regex]', 'false');
  const result = await fetchJSON(`${baseUrl}/usuarios/listar?${params}`, headers);
  return result?.aaData?.[0]?.uuid || null;
}

function calculateScoreBR(transactions: any[], metric: string, pointsPer: string, gameFilter: string, minBet: number): number {
  const divisor = pointsPer === '1_centavo' ? 0.01 : pointsPer === '10_centavos' ? 0.1 : 1;
  const parseValue = (s: string | number): number => {
    if (typeof s === 'number') return Math.abs(s);
    if (!s) return 0;
    const str = String(s).trim();
    if (str.includes(',')) return Math.abs(Number(str.replace(/\./g, '').replace(',', '.'))) || 0;
    return Math.abs(Number(str)) || 0;
  };

  let totalBet = 0, totalWon = 0, totalDeposit = 0;
  for (const tx of transactions) {
    const tipo = String(tx.tipo || '').toUpperCase();
    const valor = parseValue(tx.valor);
    const jogo = String(tx.jogo || tx.descricao || '').toLowerCase();
    if (gameFilter !== 'all') {
      const isKeno = jogo.includes('keno') || jogo.includes('bingo');
      const isCassino = !isKeno && jogo.length > 0;
      if (gameFilter === 'keno' && !isKeno) continue;
      if (gameFilter === 'cassino' && !isCassino) continue;
    }
    if (minBet > 0 && valor < minBet) continue;
    if (tipo.includes('COMPRA') || tipo.includes('APOSTA') || tipo.includes('BET')) totalBet += valor;
    else if (tipo.includes('PREMIO') || tipo.includes('GANHO') || tipo.includes('WIN')) totalWon += valor;
    else if (tipo.includes('DEPOSITO') || tipo.includes('DEPOSIT') || tipo.includes('PIX_IN')) totalDeposit += valor;
  }

  let metricValue = 0;
  switch (metric) {
    case 'total_bet': metricValue = totalBet; break;
    case 'total_won': metricValue = totalWon; break;
    case 'total_deposit': metricValue = totalDeposit; break;
    case 'ggr': metricValue = totalBet - totalWon; break;
    default: metricValue = totalBet;
  }
  return Math.max(0, Math.floor(metricValue / divisor));
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); };

  try {
    const { data: config } = await supabase
      .from('platform_config').select('*').eq('active', true).limit(1).single();

    if (!config) {
      log('Nenhuma configuração de plataforma ativa encontrada');
      return new Response(JSON.stringify({ success: false, error: 'Sem config ativa', logs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const siteUrl = config.site_url.replace(/\/+$/, '');
    const loginDomain = config.login_url ? config.login_url.replace(/\/+$/, '').replace(/\/login$/, '') : null;
    const baseUrl = loginDomain || siteUrl;

    const auth = await doLogin(baseUrl, config.username, config.password, config.login_url);
    if (!auth.success) {
      log('Falha no login');
      return new Response(JSON.stringify({ success: false, error: 'Login falhou. Verifique URL e credenciais.', logs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const headers = buildHeaders(auth.cookies, baseUrl);

    const now = new Date().toISOString();

    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('id, name, metric, game_filter, min_bet, points_per, start_date, end_date')
      .eq('status', 'ATIVO')
      .lte('start_date', now)
      .gte('end_date', now);

    log(`${(tournaments || []).length} torneio(s) ativo(s)`);

    let totalUpdated = 0, totalErrors = 0;

    for (const tournament of (tournaments || [])) {
      const { data: entries } = await supabase
        .from('player_tournament_entries').select('id, cpf').eq('tournament_id', tournament.id);

      if (!entries || entries.length === 0) continue;

      const uuidCache = new Map<string, string | null>();

      for (const entry of entries) {
        try {
          let playerUuid = uuidCache.get(entry.cpf);
          if (playerUuid === undefined) {
            playerUuid = await searchPlayerByCpf(baseUrl, headers, entry.cpf);
            uuidCache.set(entry.cpf, playerUuid);
          }
          if (!playerUuid) { totalErrors++; continue; }

          const txResult = await fetchJSON(`${baseUrl}/usuarios/transacoes?id=${playerUuid}`, headers);
          const movimentacoes: any[] = txResult?.movimentacoes || [];
          const historico: any[] = txResult?.historico || [];
          const normalizedHist = historico.map((h: any) => ({
            data_registro: h.data_registro, tipo: h.operacao || h.tipo || '',
            valor: h.valor, jogo: h.jogo || '', carteira: h.carteira || '',
          }));
          const allTx = [...movimentacoes, ...normalizedHist];

          const parseDate = (s: string): number => {
            if (!s) return 0;
            const brMatch = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2}):(\d{2})/);
            if (brMatch) return new Date(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}T${brMatch[4]}:${brMatch[5]}:${brMatch[6]}-03:00`).getTime();
            const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
            if (isoMatch) return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T${isoMatch[4]}:${isoMatch[5]}:${isoMatch[6]}-03:00`).getTime();
            return new Date(s).getTime();
          };

          const startTs = new Date(tournament.start_date).getTime();
          const endTs = new Date(tournament.end_date).getTime();
          const filteredTx = allTx.filter((tx: any) => {
            const txTs = parseDate(tx.data_registro || tx.created_at || tx.data || '');
            return txTs >= startTs && txTs <= endTs;
          });

          const score = calculateScoreBR(filteredTx, tournament.metric, tournament.points_per || '1_real', tournament.game_filter, Number(tournament.min_bet || 0));

          await supabase.from('player_tournament_entries')
            .update({ score, updated_at: new Date().toISOString() }).eq('id', entry.id);

          totalUpdated++;
        } catch (e) {
          log(`CPF ${entry.cpf}: ERRO - ${(e as Error).message}`);
          totalErrors++;
        }
      }

      const { data: allEntries } = await supabase
        .from('player_tournament_entries').select('id, score')
        .eq('tournament_id', tournament.id).order('score', { ascending: false });

      if (allEntries) {
        for (let i = 0; i < allEntries.length; i++) {
          await supabase.from('player_tournament_entries').update({ rank: i + 1 }).eq('id', allEntries[i].id);
        }
      }
    }

    // Check for tournaments that just ended — distribute prizes
    let body: any = {};
    try { body = await req.json(); } catch {}
    const forceTournamentId = body?.force_prizes_tournament_id;

    let endedFilter = supabase.from('tournaments').select('id, name, prizes, end_date').lt('end_date', now);
    if (forceTournamentId) {
      endedFilter = endedFilter.eq('id', forceTournamentId);
    } else {
      endedFilter = endedFilter.eq('status', 'ATIVO');
    }
    const { data: endedTournaments } = await endedFilter;

    let prizesPaid = 0;
    for (const t of endedTournaments || []) {
      log(`Torneio "${t.name}" encerrou — distribuindo prêmios`);
      const { data: ranked } = await supabase
        .from('player_tournament_entries').select('id, cpf, score, rank')
        .eq('tournament_id', t.id).order('score', { ascending: false });

      const prizes: any[] = t.prizes || [];
      for (const prize of prizes) {
        const rank = Number(prize.rank);
        const value = Number(prize.value || 0);
        const type = prize.type || 'bonus';
        if (!value || !rank) continue;

        const winner = ranked?.find((_: any, i: number) => i + 1 === rank);
        if (!winner) continue;

        try {
          if (type === 'bonus' || type === 'free_bet') {
            const winnerUuid = await searchPlayerByCpf(baseUrl, headers, winner.cpf);
            if (winnerUuid) await creditBonusOnPlatform(baseUrl, headers, winnerUuid, value, config.password);
            await supabase.from('player_rewards_pending').insert({
              cpf: winner.cpf, reward_type: type, reward_value: value,
              source: 'tournament', source_id: t.id,
              description: `Prêmio do torneio "${t.name}" — ${prize.description || `${rank}º lugar`}`,
              claimed_at: new Date().toISOString(),
            } as any);
          } else if (type === 'coins') {
            const { data: w } = await supabase.from('player_wallets').select('coins').eq('cpf', winner.cpf).maybeSingle();
            await supabase.from('player_wallets').update({ coins: (w?.coins || 0) + value } as any).eq('cpf', winner.cpf);
          } else if (type === 'xp') {
            const { data: w } = await supabase.from('player_wallets').select('xp').eq('cpf', winner.cpf).maybeSingle();
            await supabase.from('player_wallets').update({ xp: (w?.xp || 0) + value } as any).eq('cpf', winner.cpf);
          }
          await supabase.from('player_activity_log').insert({
            cpf: winner.cpf, type: 'tournament_prize', amount: value,
            source: 'Torneio', source_id: t.id,
            description: `Prêmio ${rank}º lugar no torneio "${t.name}": ${type} R$${value}`,
          } as any);
          prizesPaid++;
        } catch (e) {
          log(`ERRO ao pagar prêmio rank ${rank}: ${(e as Error).message}`);
        }
      }
      await supabase.from('tournaments').update({ status: 'ENCERRADO', updated_at: new Date().toISOString() } as any).eq('id', t.id);
    }

    await supabase.from('platform_config').update({ last_sync_at: new Date().toISOString() }).eq('id', config.id);
    log(`Concluído: ${totalUpdated} scores, ${prizesPaid} prêmios, ${totalErrors} erros`);

    return new Response(JSON.stringify({
      success: true, updated: totalUpdated, errors: totalErrors,
      prizes_paid: prizesPaid, tournaments: (tournaments || []).length, logs,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    log(`Erro fatal: ${(error as Error).message}`);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message, logs }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
