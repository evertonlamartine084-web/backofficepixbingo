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

// --- Platform login/fetch helpers ---

async function doLogin(
  siteUrl: string, username: string, password: string,
  loginUrl?: string | null,
  log?: (msg: string) => void,
): Promise<{ cookies: string; success: boolean }> {
  const l = log || ((m: string) => console.log(`[sync-missions] ${m}`));
  const baseUrl = siteUrl.replace(/\/+$/, '');
  let loginTarget = `${baseUrl}/login`;
  if (loginUrl) {
    const cleanLogin = loginUrl.replace(/\/+$/, '');
    loginTarget = cleanLogin.endsWith('/login') ? cleanLogin : `${cleanLogin}/login`;
  }

  l(`doLogin: baseUrl=${baseUrl}, loginTarget=${loginTarget}, user=${username}, pass=${password.slice(0,4)}...`);

  let initialCookies = '';
  try {
    const initRes = await fetch(baseUrl, {
      method: 'GET', headers: { 'Accept': 'text/html' },
      redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    const setCookies = initRes.headers.getSetCookie?.() || [];
    initialCookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
    l(`doLogin: GET ${baseUrl} → ${initRes.status}, cookies: ${initialCookies.slice(0, 100)}`);
  } catch (e) {
    l(`doLogin: GET ${baseUrl} falhou: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const hdrs: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/json,*/*',
      'Referer': `${baseUrl}/`, 'Origin': baseUrl,
    };
    if (initialCookies) hdrs['Cookie'] = initialCookies;

    const postBody = new URLSearchParams({ usuario: username, senha: password }).toString();
    l(`doLogin: POST ${loginTarget} body=${postBody.replace(password, '***')}`);

    const res = await fetch(loginTarget, {
      method: 'POST', headers: hdrs,
      body: postBody,
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
      l(`doLogin: redirect ${res.status} → ${location}`);
      if (!location.includes('/login') && !location.includes('error')) {
        l(`doLogin: SUCCESS via redirect`);
        return { cookies, success: true };
      }
      l(`doLogin: redirect aponta para login/error — falha`);
    }

    const text = await res.text();
    l(`doLogin: response HTTP ${res.status}, body: ${text.slice(0, 300)}`);

    if (res.ok) {
      try {
        const d = JSON.parse(text);
        if (d.status === true || d.logged === true) {
          l(`doLogin: SUCCESS via JSON`);
          return { cookies, success: true };
        }
      } catch { /* not JSON */ }
    }

    l(`doLogin: FAILED — HTTP ${res.status}`);
  } catch (e) {
    l(`doLogin: EXCEPTION — ${e instanceof Error ? e.message : String(e)}`);
  }

  return { cookies: '', success: false };
}

function buildHeaders(cookies: string, baseUrl: string): Record<string, string> {
  return {
    'Accept': 'application/json, text/javascript, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'Cookie': cookies, 'Referer': baseUrl,
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

async function fetchPlayerTransactions(baseUrl: string, headers: Record<string, string>, playerUuid: string): Promise<Record<string, unknown>> {
  return await fetchJSON(`${baseUrl}/usuarios/transacoes?id=${playerUuid}`, headers);
}

// --- Progress calculation helpers ---

function parseDate(s: string): number {
  if (!s) return 0;
  const brMatch = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2}):(\d{2})/);
  if (brMatch) return new Date(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}T${brMatch[4]}:${brMatch[5]}:${brMatch[6]}-03:00`).getTime();
  const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (isoMatch) return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T${isoMatch[4]}:${isoMatch[5]}:${isoMatch[6]}-03:00`).getTime();
  return new Date(s).getTime();
}

function parseBrCurrency(s: string | number): number {
  if (typeof s === 'number') return Math.abs(s);
  if (!s) return 0;
  const str = String(s).trim();
  if (str.includes(',')) {
    return Math.abs(Number(str.replace(/\./g, '').replace(',', '.'))) || 0;
  }
  return Math.abs(Number(str)) || 0;
}

/**
 * Calculate mission progress from platform transactions.
 * Returns the cumulative value for the given condition_type.
 */
interface NormalizedTransaction {
  data_registro: string;
  tipo: string;
  valor: string | number;
  jogo: string;
  carteira: string;
}

function calculateMissionProgress(
  movimentacoes: Record<string, unknown>[],
  historico: Record<string, unknown>[],
  conditionType: string,
  startTs: number,
  endTs: number,
): number {
  // Normalize historico
  const normalizedHist: NormalizedTransaction[] = historico.map((h: Record<string, unknown>) => ({
    data_registro: String(h.data_registro || ''),
    tipo: String(h.operacao || h.tipo || '').toUpperCase(),
    valor: h.valor as string | number,
    jogo: String(h.jogo || ''),
    carteira: String(h.carteira || ''),
  }));
  const normalizedMov: NormalizedTransaction[] = movimentacoes.map((m: Record<string, unknown>) => ({
    data_registro: String(m.data_registro || ''),
    tipo: String(m.tipo || '').toUpperCase(),
    valor: m.valor as string | number,
    jogo: String(m.jogo || m.descricao || ''),
    carteira: String(m.carteira || ''),
  }));

  // Filter by date range
  const filterByDate = (txs: NormalizedTransaction[]) => txs.filter(tx => {
    const ts = parseDate(tx.data_registro || '');
    return ts >= startTs && ts <= endTs;
  });

  const filteredHist = filterByDate(normalizedHist);
  const filteredMov = filterByDate(normalizedMov);
  const allTx = [...filteredMov, ...filteredHist];

  switch (conditionType) {
    case 'deposit': {
      // Sum of deposit amounts from movimentacoes
      let total = 0;
      for (const tx of filteredMov) {
        if (tx.tipo.includes('DEPOSITO') || tx.tipo.includes('DEPOSIT') || tx.tipo.includes('PIX_IN')) {
          total += parseBrCurrency(tx.valor);
        }
      }
      return total;
    }

    case 'bet': {
      // Sum of bet amounts
      let total = 0;
      for (const tx of allTx) {
        if (tx.tipo.includes('COMPRA') || tx.tipo.includes('APOSTA') || tx.tipo.includes('BET')) {
          total += parseBrCurrency(tx.valor);
        }
      }
      return total;
    }

    case 'win': {
      // Count of winning transactions
      let count = 0;
      for (const tx of allTx) {
        if (tx.tipo.includes('PREMIO') || tx.tipo.includes('GANHO') || tx.tipo.includes('WIN')) {
          count++;
        }
      }
      return count;
    }

    case 'play_keno': {
      // Count keno/bingo games played
      let count = 0;
      for (const tx of filteredHist) {
        const jogo = (tx.jogo || '').toLowerCase();
        if (jogo.includes('keno') || jogo.includes('bingo')) {
          if (tx.tipo.includes('COMPRA') || tx.tipo.includes('APOSTA') || tx.tipo.includes('BET')) {
            count++;
          }
        }
      }
      return count;
    }

    case 'play_cassino': {
      // Count casino games played
      let count = 0;
      for (const tx of filteredHist) {
        const jogo = (tx.jogo || '').toLowerCase();
        const isKeno = jogo.includes('keno') || jogo.includes('bingo');
        if (!isKeno && jogo.length > 0) {
          if (tx.tipo.includes('COMPRA') || tx.tipo.includes('APOSTA') || tx.tipo.includes('BET')) {
            count++;
          }
        }
      }
      return count;
    }

    case 'total_games': {
      // Count all games played (any bet transaction)
      let count = 0;
      for (const tx of allTx) {
        if (tx.tipo.includes('COMPRA') || tx.tipo.includes('APOSTA') || tx.tipo.includes('BET')) {
          count++;
        }
      }
      return count;
    }

    case 'min_balance': {
      // Check current balance — we use the latest saldo from historico
      if (historico.length === 0) return 0;
      // historico is sorted by date desc typically — find latest saldo
      const latest = historico[0];
      return parseBrCurrency(latest.saldo || 0);
    }

    // login, consecutive_days, referral, spin_wheel, store_purchase
    // These are tracked internally (not from platform transactions)
    // They are already handled by existing widget actions
    default:
      return -1; // -1 signals "skip — tracked internally"
  }
}

// --- Main handler ---

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const logs: string[] = [];
  const log = (msg: string) => { console.log(`[sync-missions] ${msg}`); logs.push(msg); };

  try {
    // 1. Get active platform config (try all active configs, prefer pixbingobr.com)
    const { data: allConfigs } = await supabase
      .from('platform_config')
      .select('*')
      .eq('active', true);

    if (!allConfigs || allConfigs.length === 0) {
      log('Nenhuma configuração de plataforma ativa encontrada');
      return new Response(JSON.stringify({ success: false, error: 'Sem config ativa', logs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log(`${allConfigs.length} config(s) ativa(s): ${allConfigs.map(c => c.site_url).join(', ')}`);

    // Prefer configs with pixbingobr.com, fallback to first
    const config = allConfigs.find(c => c.site_url?.includes('pixbingobr.com')) || allConfigs[0];

    const siteUrl = config.site_url.replace(/\/+$/, '');
    const loginDomain = config.login_url ? config.login_url.replace(/\/+$/, '').replace(/\/login$/, '') : null;
    const baseUrl = loginDomain || siteUrl;
    log(`Config selecionada: site_url=${siteUrl}, login_url=${config.login_url ?? 'N/A'}, baseUrl=${baseUrl}, username=${config.username}`);

    // SSRF protection
    if (!ALLOWED_SITE_URLS.some(u => baseUrl === u || baseUrl.startsWith(u + '/'))) {
      log(`URL não permitida: ${baseUrl}`);
      return new Response(JSON.stringify({ success: false, error: 'URL não permitida', logs }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Login to platform
    log(`Tentando login: base=${baseUrl}`);
    const auth = await doLogin(baseUrl, config.username, config.password, config.login_url, log);
    if (!auth.success) {
      log('Falha no login');
      return new Response(JSON.stringify({ success: false, error: 'Login falhou', logs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    log('Login OK');
    const headers = buildHeaders(auth.cookies, baseUrl);

    // 3. Get active missions
    const now = new Date().toISOString();
    const { data: missions } = await supabase
      .from('missions')
      .select('id, name, condition_type, condition_value, start_date, end_date, recurrence')
      .in('status', ['ATIVO']);

    if (!missions || missions.length === 0) {
      log('Nenhuma missão ativa');
      return new Response(JSON.stringify({ success: true, updated: 0, logs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    log(`${missions.length} missão(ões) ativa(s)`);

    // 4. Get all players who opted-in to active missions and haven't completed yet
    const missionIds = missions.map(m => m.id);
    const { data: progressEntries } = await supabase
      .from('player_mission_progress')
      .select('id, cpf, mission_id, progress, target, completed, opted_in')
      .in('mission_id', missionIds)
      .eq('opted_in', true)
      .eq('completed', false);

    if (!progressEntries || progressEntries.length === 0) {
      log('Nenhum jogador com opt-in pendente');
      return new Response(JSON.stringify({ success: true, updated: 0, logs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group by CPF to minimize platform API calls
    const cpfToEntries = new Map<string, typeof progressEntries>();
    for (const entry of progressEntries) {
      const list = cpfToEntries.get(entry.cpf) || [];
      list.push(entry);
      cpfToEntries.set(entry.cpf, list);
    }

    log(`${progressEntries.length} progresso(s) de ${cpfToEntries.size} jogador(es) para atualizar`);

    const missionMap = new Map(missions.map(m => [m.id, m]));
    let totalUpdated = 0;
    let totalCompleted = 0;
    let totalErrors = 0;

    // 5. For each player, fetch transactions and calculate progress
    for (const [cpf, entries] of cpfToEntries) {
      try {
        // Get player UUID
        const playerUuid = await searchPlayerByCpf(baseUrl, headers, cpf);
        if (!playerUuid) {
          log(`  CPF ${cpf}: UUID não encontrado`);
          totalErrors++;
          continue;
        }

        // Fetch transactions once per player
        const txResult = await fetchPlayerTransactions(baseUrl, headers, playerUuid);
        const movimentacoes = (txResult?.movimentacoes as Record<string, unknown>[] | undefined) || [];
        const historico = (txResult?.historico as Record<string, unknown>[] | undefined) || [];

        // Process each mission for this player
        for (const entry of entries) {
          const mission = missionMap.get(entry.mission_id);
          if (!mission) continue;

          // Determine date range for progress calculation
          let startTs: number;
          let endTs: number;

          if (mission.recurrence === 'daily') {
            // Daily missions: only count today's transactions
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            startTs = todayStart.getTime();
            endTs = Date.now();
          } else if (mission.recurrence === 'weekly') {
            // Weekly: from start of current week (Monday)
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
            weekStart.setHours(0, 0, 0, 0);
            startTs = weekStart.getTime();
            endTs = Date.now();
          } else if (mission.recurrence === 'monthly') {
            // Monthly: from start of current month
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);
            startTs = monthStart.getTime();
            endTs = Date.now();
          } else {
            // One-time mission: use mission date range or opt-in date
            startTs = mission.start_date ? new Date(mission.start_date).getTime() : 0;
            endTs = mission.end_date ? new Date(mission.end_date).getTime() : Date.now();
          }

          const progress = calculateMissionProgress(
            movimentacoes,
            historico,
            mission.condition_type,
            startTs,
            endTs,
          );

          // Skip internally-tracked condition types
          if (progress === -1) continue;

          const target = Number(mission.condition_value) || 1;
          const completed = progress >= target;

          // Update progress
          await supabase
            .from('player_mission_progress')
            .update({
              progress,
              target,
              completed,
              ...(completed ? { completed_at: new Date().toISOString() } : {}),
            } as Record<string, unknown>)
            .eq('id', entry.id);

          totalUpdated++;
          if (completed) {
            totalCompleted++;
            log(`  CPF ${cpf} — Missão "${mission.name}": CONCLUÍDA! (${progress}/${target})`);
          } else {
            log(`  CPF ${cpf} — Missão "${mission.name}": ${progress}/${target}`);
          }
        }
      } catch (e: unknown) {
        log(`  CPF ${cpf}: ERRO — ${e instanceof Error ? e.message : 'Erro'}`);
        totalErrors++;
      }
    }

    log(`Concluído: ${totalUpdated} atualizados, ${totalCompleted} concluídos, ${totalErrors} erros`);

    return new Response(JSON.stringify({
      success: true,
      updated: totalUpdated,
      completed: totalCompleted,
      errors: totalErrors,
      missions: missions.length,
      players: cpfToEntries.size,
      logs,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : 'Erro';
    log(`ERRO GERAL: ${errMsg}`);
    return new Response(JSON.stringify({ success: false, error: errMsg, logs }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
