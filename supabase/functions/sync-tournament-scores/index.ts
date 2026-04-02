import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://backofficepixbingo.vercel.app',
  'https://pixbingobr.com',
  'https://www.pixbingobr.com',
  'https://pixbingobr.concurso.club',
  'http://localhost:8080',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsOrigin(req: Request): string {
  const origin = req.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function getCorsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const ALLOWED_SITE_URLS = [
  'https://pixbingobr.concurso.club',
  'https://pixbingobr.com',
  'https://www.pixbingobr.com',
];

// --- Platform login/fetch helpers (same as pixbingo-proxy) ---

async function doLogin(siteUrl: string, username: string, password: string, loginUrl?: string | null): Promise<{ cookies: string; success: boolean }> {
  const baseUrl = siteUrl.replace(/\/+$/, '');
  // If loginUrl is a full URL without /login path, append /login
  let loginTarget = `${baseUrl}/login`;
  if (loginUrl) {
    const cleanLogin = loginUrl.replace(/\/+$/, '');
    loginTarget = cleanLogin.endsWith('/login') ? cleanLogin : `${cleanLogin}/login`;
  }
  console.log(`[sync-login] baseUrl=${baseUrl}, loginTarget=${loginTarget}`);

  let initialCookies = '';
  try {
    const initRes = await fetch(baseUrl, {
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    const setCookies = initRes.headers.getSetCookie?.() || [];
    initialCookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
  } catch (e) {
    console.log(`[sync-login] GET failed: ${(e as Error).message}`);
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/json,*/*',
      'Referer': `${baseUrl}/`,
      'Origin': baseUrl,
    };
    if (initialCookies) headers['Cookie'] = initialCookies;

    const res = await fetch(loginTarget, {
      method: 'POST',
      headers,
      body: new URLSearchParams({ usuario: username, senha: password }).toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
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
      try {
        const data = JSON.parse(text);
        if (data.status === true || data.logged === true) {
          return { cookies, success: true };
        }
      } catch { /* ignore */ }
    }
  } catch (e) {
    console.log(`[sync-login] POST failed: ${(e as Error).message}`);
  }

  return { cookies: '', success: false };
}

function buildHeaders(cookies: string, baseUrl: string): Record<string, string> {
  return {
    'Accept': 'application/json, text/javascript, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'Cookie': cookies,
    'Referer': baseUrl,
  };
}

async function fetchJSON(url: string, headers: Record<string, string>, method = 'GET', body?: Record<string, string>): Promise<Record<string, unknown>> {
  const opts: RequestInit = { method, headers: { ...headers }, signal: AbortSignal.timeout(12000) };
  if (body && method === 'POST') {
    opts.body = new URLSearchParams(body).toString();
    (opts.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 500), _status: res.status }; }
}

// Credit bonus on the platform
async function creditBonusOnPlatform(baseUrl: string, headers: Record<string, string>, playerUuid: string, amount: number, password: string): Promise<{ success: boolean; msg?: string }> {
  const result = await fetchJSON(`${baseUrl}/usuarios/creditos`, headers, 'POST', {
    uuid: playerUuid,
    carteira: 'BONUS',
    valor: String(amount),
    senha: password,
  });
  const ok = result?.status === true || String(result?.msg || '').toLowerCase().includes('sucesso');
  return { success: ok, msg: result?.msg || result?.Msg || JSON.stringify(result).slice(0, 200) };
}

// Search player by CPF to get UUID
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

  const result = await fetchJSON(`${baseUrl}/usuarios/listar?${params}`, headers);
  const player = result?.aaData?.[0];
  return player?.uuid || null;
}

// Fetch player transactions (returns array of transactions)
async function fetchPlayerTransactions(baseUrl: string, headers: Record<string, string>, playerUuid: string): Promise<Record<string, unknown>> {
  return await fetchJSON(`${baseUrl}/usuarios/transacoes?id=${playerUuid}`, headers);
}

// Fetch financeiro-resumo for a player (bets, wins per product)
async function fetchFinanceiroResumo(baseUrl: string, headers: Record<string, string>, dateStart: string, dateEnd: string, cpf: string): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  params.set('draw', '1');
  params.set('start', '0');
  params.set('length', '5000');
  params.set('exportar', '0');
  const txCols = ['id', 'tipo', 'valor', 'saldo_anterior', 'saldo_posterior', 'cpf', 'username', 'created_at', 'descricao', 'status'];
  txCols.forEach((col, i) => {
    params.set(`columns[${i}][data]`, col);
    params.set(`columns[${i}][name]`, '');
    params.set(`columns[${i}][searchable]`, 'true');
    params.set(`columns[${i}][orderable]`, 'true');
    params.set(`columns[${i}][search][value]`, '');
    params.set(`columns[${i}][search][regex]`, 'false');
  });
  params.set('order[0][column]', '0');
  params.set('order[0][dir]', 'desc');
  params.set('search[value]', '');
  params.set('search[regex]', 'false');
  params.set('busca_cpf', cpf);
  params.set('busca_data_inicio', dateStart);
  params.set('busca_data_fim', dateEnd);

  return await fetchJSON(`${baseUrl}/transferencias/listar?${params}`, headers);
}

// Calculate score from transactions based on metric and points_per
function calculateScore(
  transactions: Record<string, unknown>[],
  metric: string,
  pointsPer: string,
  gameFilter: string,
  minBet: number,
): number {
  // points_per divisor: how many R$ per 1 point
  const divisor = pointsPer === '1_centavo' ? 0.01 : pointsPer === '10_centavos' ? 0.1 : 1;

  let totalBet = 0;
  let totalWon = 0;
  let totalDeposit = 0;

  for (const tx of transactions) {
    const tipo = String(tx.tipo || tx.type || '').toLowerCase();
    const valor = Math.abs(Number(tx.valor || tx.value || 0));
    const descricao = String(tx.descricao || tx.description || '').toLowerCase();

    // Apply game filter
    if (gameFilter !== 'all') {
      const isKeno = descricao.includes('keno') || descricao.includes('bingo');
      const isCassino = descricao.includes('cassino') || descricao.includes('casino') || descricao.includes('slot') || descricao.includes('crash');
      if (gameFilter === 'keno' && !isKeno) continue;
      if (gameFilter === 'cassino' && !isCassino) continue;
    }

    // Apply min_bet filter
    if (minBet > 0 && valor < minBet) continue;

    // Categorize transaction
    if (tipo.includes('compra') || tipo.includes('aposta') || tipo.includes('bet')) {
      totalBet += valor;
    } else if (tipo.includes('premio') || tipo.includes('ganho') || tipo.includes('win')) {
      totalWon += valor;
    } else if (tipo.includes('deposito') || tipo.includes('deposit') || tipo.includes('pix_in')) {
      totalDeposit += valor;
    }
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

// Calculate score from platform transactions (BR format)
function calculateScoreBR(
  transactions: Record<string, unknown>[],
  metric: string,
  pointsPer: string,
  gameFilter: string,
  minBet: number,
): number {
  const divisor = pointsPer === '1_centavo' ? 0.01 : pointsPer === '10_centavos' ? 0.1 : 1;

  const parseValue = (s: string | number): number => {
    if (typeof s === 'number') return Math.abs(s);
    if (!s) return 0;
    const str = String(s).trim();
    // If contains comma, it's BR format "1.234,56"
    if (str.includes(',')) {
      return Math.abs(Number(str.replace(/\./g, '').replace(',', '.'))) || 0;
    }
    // Otherwise it's standard format "-14.40"
    return Math.abs(Number(str)) || 0;
  };

  let totalBet = 0;
  let totalWon = 0;
  let totalDeposit = 0;

  for (const tx of transactions) {
    const tipo = String(tx.tipo || '').toUpperCase();
    const valor = parseValue(tx.valor);
    const jogo = String(tx.jogo || tx.descricao || tx.description || '').toLowerCase();

    // Apply game filter
    if (gameFilter !== 'all') {
      const isKeno = jogo.includes('keno') || jogo.includes('bingo');
      const isCassino = !isKeno && jogo.length > 0; // If it has a game name and it's not keno, it's cassino
      if (gameFilter === 'keno' && !isKeno) continue;
      if (gameFilter === 'cassino' && !isCassino) continue;
    }

    if (minBet > 0 && valor < minBet) continue;

    // Platform transaction types: COMPRA, PREMIO, DEPOSITO, SAQUE, BONUS, etc.
    if (tipo.includes('COMPRA') || tipo.includes('APOSTA') || tipo.includes('BET')) {
      totalBet += valor;
    } else if (tipo.includes('PREMIO') || tipo.includes('GANHO') || tipo.includes('WIN')) {
      totalWon += valor;
    } else if (tipo.includes('DEPOSITO') || tipo.includes('DEPOSIT') || tipo.includes('PIX_IN')) {
      totalDeposit += valor;
    }
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

function formatDate(d: Date): string {
  // Platform expects dd/mm/yyyy format (Brazilian)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Auth verification
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Não autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  );
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) {
    return new Response(JSON.stringify({ success: false, error: 'Token inválido' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const logs: string[] = [];
  const log = (msg: string) => { console.log(`[sync-scores] ${msg}`); logs.push(msg); };

  try {
    // 1. Get active platform config
    const { data: config } = await supabase
      .from('platform_config')
      .select('*')
      .eq('active', true)
      .limit(1)
      .single();

    if (!config) {
      log('Nenhuma configuração de plataforma ativa encontrada');
      return new Response(JSON.stringify({ success: false, error: 'Sem config ativa', logs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use login_url domain as the API base if provided, otherwise site_url
    const siteUrl = config.site_url.replace(/\/+$/, '');
    const loginDomain = config.login_url ? config.login_url.replace(/\/+$/, '').replace(/\/login$/, '') : null;
    const baseUrl = loginDomain || siteUrl;

    // SSRF protection: validate baseUrl against whitelist
    if (!ALLOWED_SITE_URLS.some(u => baseUrl === u || baseUrl.startsWith(u + '/'))) {
      log(`URL não permitida: ${baseUrl}`);
      return new Response(JSON.stringify({ success: false, error: 'URL não permitida', logs }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log(`Plataforma: ${baseUrl}${loginDomain ? ` (login_url usado como base)` : ''}`);

    // 2. Login to platform
    log(`Tentando login: base=${baseUrl}, user=${config.username}`);
    const auth = await doLogin(baseUrl, config.username, config.password);
    if (!auth.success) {
      log(`Falha no login. Cookies recebidos: ${auth.cookies ? 'sim' : 'não'}`);
      return new Response(JSON.stringify({ success: false, error: 'Login falhou. Verifique URL e credenciais.', logs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    log('Login OK');
    const headers = buildHeaders(auth.cookies, baseUrl);

    // 3. Get active tournaments with enrolled players
    const now = new Date().toISOString();

    // First check all tournaments for debugging
    const { data: allTournaments } = await supabase
      .from('tournaments')
      .select('id, name, status, start_date, end_date');
    log(`Total torneios no banco: ${allTournaments?.length || 0}`);
    for (const t of allTournaments || []) {
      log(`  - "${t.name}" status=${t.status} start=${t.start_date} end=${t.end_date}`);
    }

    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('id, name, metric, game_filter, min_bet, points_per, start_date, end_date')
      .eq('status', 'ATIVO')
      .lte('start_date', now)
      .gte('end_date', now);

    if (!tournaments || tournaments.length === 0) {
      log(`Nenhum torneio ativo no momento (now=${now})`);
    } else {
      log(`${tournaments.length} torneio(s) ativo(s)`);
    }

    let totalUpdated = 0;
    let totalErrors = 0;

    for (const tournament of (tournaments || [])) {
      // Get enrolled players
      const { data: entries } = await supabase
        .from('player_tournament_entries')
        .select('id, cpf')
        .eq('tournament_id', tournament.id);

      if (!entries || entries.length === 0) {
        log(`Torneio "${tournament.name}": 0 jogadores inscritos`);
        continue;
      }

      log(`Torneio "${tournament.name}": ${entries.length} jogador(es)`);

      const dateStart = formatDate(new Date(tournament.start_date));
      const dateEnd = formatDate(new Date(tournament.end_date));

      // Cache player UUIDs to avoid repeated lookups
      const uuidCache = new Map<string, string | null>();

      for (const entry of entries) {
        try {
          // Get player UUID (needed to fetch transactions)
          let playerUuid = uuidCache.get(entry.cpf);
          if (playerUuid === undefined) {
            playerUuid = await searchPlayerByCpf(baseUrl, headers, entry.cpf);
            uuidCache.set(entry.cpf, playerUuid);
          }

          if (!playerUuid) {
            log(`  CPF ${entry.cpf}: UUID não encontrado`);
            totalErrors++;
            continue;
          }

          // Fetch player's individual transactions
          const txResult = await fetchPlayerTransactions(baseUrl, headers, playerUuid);

          // Platform returns { carteiras, movimentacoes, historico }
          // movimentacoes: [{ data_registro (dd/mm/yyyy HH:mm:ss), tipo, valor ("1.234,56"), saldo }] — deposits, bonuses
          // historico: [{ data_registro (yyyy-mm-dd HH:mm:ss), carteira, operacao, valor ("-14.40"), saldo, jogo }] — bets, wins
          const movimentacoes = (txResult?.movimentacoes as Record<string, unknown>[] | undefined) || [];
          const historico = (txResult?.historico as Record<string, unknown>[] | undefined) || [];

          // Normalize historico to have consistent field names with movimentacoes
          const normalizedHist = historico.map((h: Record<string, unknown>) => ({
            data_registro: h.data_registro,
            tipo: h.operacao || h.tipo || '',
            valor: h.valor,
            jogo: h.jogo || '',
            carteira: h.carteira || '',
          }));
          const allTx = [...movimentacoes, ...normalizedHist];

          // Parse date to timestamp — handles:
          // "dd/mm/yyyy HH:mm:ss" (movimentacoes)
          // "yyyy-mm-dd HH:mm:ss" (historico)
          // ISO format
          const parseDate = (s: string): number => {
            if (!s) return 0;
            // dd/mm/yyyy HH:mm:ss
            const brMatch = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2}):(\d{2})/);
            if (brMatch) return new Date(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}T${brMatch[4]}:${brMatch[5]}:${brMatch[6]}-03:00`).getTime();
            // yyyy-mm-dd HH:mm:ss
            const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
            if (isoMatch) return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T${isoMatch[4]}:${isoMatch[5]}:${isoMatch[6]}-03:00`).getTime();
            return new Date(s).getTime();
          };

          // Parse BR currency "1.234,56" to number
          const parseBrCurrency = (s: string | number): number => {
            if (typeof s === 'number') return s;
            if (!s) return 0;
            return Number(String(s).replace(/\./g, '').replace(',', '.')) || 0;
          };

          // Filter by tournament date range
          const startTs = new Date(tournament.start_date).getTime();
          const endTs = new Date(tournament.end_date).getTime();
          const filteredTx = allTx.filter((tx: Record<string, unknown>) => {
            const txTs = parseDate(tx.data_registro || tx.created_at || tx.data || '');
            return txTs >= startTs && txTs <= endTs;
          });

          // Calculate score with BR format parsing
          const score = calculateScoreBR(
            filteredTx,
            tournament.metric,
            tournament.points_per || '1_real',
            tournament.game_filter,
            Number(tournament.min_bet || 0),
          );

          // Update score
          await supabase
            .from('player_tournament_entries')
            .update({ score, updated_at: new Date().toISOString() })
            .eq('id', entry.id);

          log(`  CPF ${entry.cpf}: score=${score}`);
          totalUpdated++;
        } catch (e: unknown) {
          log(`  CPF ${entry.cpf}: ERRO - ${e instanceof Error ? e.message : 'Erro'}`);
          totalErrors++;
        }
      }

      // Update ranks for this tournament
      const { data: allEntries } = await supabase
        .from('player_tournament_entries')
        .select('id, score')
        .eq('tournament_id', tournament.id)
        .order('score', { ascending: false });

      if (allEntries) {
        for (let i = 0; i < allEntries.length; i++) {
          await supabase
            .from('player_tournament_entries')
            .update({ rank: i + 1 })
            .eq('id', allEntries[i].id);
        }
        log(`  Ranks atualizados: ${allEntries.length} posições`);
      }
    }

    // 4. Check for tournaments that just ended — distribute prizes and mark ENCERRADO
    // Also support force_prizes param to re-distribute for already ENCERRADO tournaments
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const forceTournamentId = body?.force_prizes_tournament_id;

    let endedFilter = supabase
      .from('tournaments')
      .select('id, name, prizes, end_date')
      .lt('end_date', now);

    if (forceTournamentId) {
      endedFilter = endedFilter.eq('id', forceTournamentId);
      log(`Forçando distribuição de prêmios para torneio ${forceTournamentId}`);
    } else {
      endedFilter = endedFilter.eq('status', 'ATIVO');
    }
    const { data: endedTournaments } = await endedFilter;

    let prizesPaid = 0;
    for (const t of endedTournaments || []) {
      log(`Torneio "${t.name}" encerrou — distribuindo prêmios`);

      // Get final rankings
      const { data: ranked } = await supabase
        .from('player_tournament_entries')
        .select('id, cpf, score, rank')
        .eq('tournament_id', t.id)
        .order('score', { ascending: false });

      const prizes: Record<string, unknown>[] = t.prizes || [];

      for (const prize of prizes) {
        const rank = Number(prize.rank);
        const value = Number(prize.value || 0);
        const type = prize.type || 'bonus';
        if (!value || !rank) continue;

        // Find player at this rank
        const winner = ranked?.find((_: Record<string, unknown>, i: number) => i + 1 === rank);
        if (!winner) {
          log(`  Rank ${rank}: sem jogador`);
          continue;
        }

        log(`  Rank ${rank} → CPF ${winner.cpf}: ${type} R$${value}`);

        try {
          if (type === 'bonus' || type === 'free_bet') {
            // Credit bonus directly on the platform
            const winnerUuid = await searchPlayerByCpf(baseUrl, headers, winner.cpf);
            if (winnerUuid) {
              const creditResult = await creditBonusOnPlatform(baseUrl, headers, winnerUuid, value, config.password);
              if (creditResult.success) {
                log(`    Bônus R$${value} creditado na plataforma!`);
              } else {
                log(`    AVISO: falha ao creditar na plataforma: ${creditResult.msg}`);
              }
            } else {
              log(`    AVISO: UUID não encontrado para creditar na plataforma`);
            }

            // Also track internally
            await supabase.from('player_rewards_pending').insert({
              cpf: winner.cpf,
              reward_type: type,
              reward_value: value,
              source: 'tournament',
              source_id: t.id,
              description: `Prêmio do torneio "${t.name}" — ${prize.description || `${rank}º lugar`}`,
              claimed_at: new Date().toISOString(), // already paid
            } as Record<string, unknown>);
          } else if (type === 'coins') {
            const { data: w } = await supabase.from('player_wallets').select('coins').eq('cpf', winner.cpf).maybeSingle();
            await supabase.from('player_wallets').update({ coins: (w?.coins || 0) + value } as Record<string, unknown>).eq('cpf', winner.cpf);
          } else if (type === 'xp') {
            const { data: w } = await supabase.from('player_wallets').select('xp').eq('cpf', winner.cpf).maybeSingle();
            await supabase.from('player_wallets').update({ xp: (w?.xp || 0) + value } as Record<string, unknown>).eq('cpf', winner.cpf);
          }

          // Log activity
          await supabase.from('player_activity_log').insert({
            cpf: winner.cpf,
            type: 'tournament_prize',
            amount: value,
            source: 'Torneio',
            source_id: t.id,
            description: `Prêmio ${rank}º lugar no torneio "${t.name}": ${type} R$${value}`,
          } as Record<string, unknown>);

          prizesPaid++;
        } catch (e: unknown) {
          log(`  ERRO ao pagar prêmio rank ${rank}: ${e instanceof Error ? e.message : 'Erro'}`);
        }
      }

      // Mark tournament as ENCERRADO
      await supabase.from('tournaments').update({ status: 'ENCERRADO', updated_at: new Date().toISOString() } as Record<string, unknown>).eq('id', t.id);
      log(`  Torneio "${t.name}" marcado como ENCERRADO`);
    }

    // Update last_sync_at
    await supabase.from('platform_config').update({ last_sync_at: new Date().toISOString() }).eq('id', config.id);

    log(`Concluído: ${totalUpdated} scores, ${prizesPaid} prêmios pagos, ${totalErrors} erros`);

    return new Response(JSON.stringify({
      success: true,
      updated: totalUpdated,
      errors: totalErrors,
      prizes_paid: prizesPaid,
      tournaments: (tournaments || []).length,
      logs,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Erro';
    log(`Erro fatal: ${errMsg}`);
    return new Response(JSON.stringify({ success: false, error: errMsg, logs }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
