import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse, verifyAuth } from './_cors.js';

export const config = { runtime: 'edge' };

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
  } catch { /* ignore */ }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/json,*/*',
      'Referer': `${baseUrl}/`, 'Origin': baseUrl,
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
      try { const data = JSON.parse(text); if (data.status === true || data.logged === true) return { cookies, success: true }; } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return { cookies: '', success: false };
}

function buildHeaders(cookies: string, baseUrl: string): Record<string, string> {
  return { 'Accept': 'application/json, text/javascript, */*', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': cookies, 'Referer': baseUrl };
}

interface Movimentacao {
  data_registro: string;
  tipo: string;
  valor: string | number;
  jogo?: string;
  descricao?: string;
  carteira?: string;
}

interface Historico {
  data_registro: string;
  operacao?: string;
  tipo?: string;
  valor: string | number;
  jogo?: string;
  carteira?: string;
  saldo?: string | number;
}

interface NormalizedTx {
  data_registro: string;
  tipo: string;
  valor: string | number;
  jogo: string;
  carteira: string;
}

async function fetchJSON(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { method: 'GET', headers: { ...headers }, signal: AbortSignal.timeout(12000) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 500), _status: res.status }; }
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
  const result = await fetchJSON(`${baseUrl}/usuarios/listar?${params}`, headers) as Record<string, unknown>;
  const aaData = result?.aaData as Record<string, unknown>[] | undefined;
  return (aaData?.[0]?.uuid as string) || null;
}

// --- Progress calculation ---

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
  if (str.includes(',')) return Math.abs(Number(str.replace(/\./g, '').replace(',', '.'))) || 0;
  return Math.abs(Number(str)) || 0;
}

function calculateMissionProgress(
  movimentacoes: Movimentacao[], historico: Historico[],
  conditionType: string, startTs: number, endTs: number,
): number {
  const normalizedHist: NormalizedTx[] = historico.map((h: Historico) => ({
    data_registro: h.data_registro,
    tipo: (h.operacao || h.tipo || '').toUpperCase(),
    valor: h.valor, jogo: h.jogo || '', carteira: h.carteira || '',
  }));
  const normalizedMov: NormalizedTx[] = movimentacoes.map((m: Movimentacao) => ({
    data_registro: m.data_registro,
    tipo: (m.tipo || '').toUpperCase(),
    valor: m.valor, jogo: m.jogo || m.descricao || '', carteira: m.carteira || '',
  }));

  const filterByDate = (txs: NormalizedTx[]) => txs.filter(tx => {
    const ts = parseDate(tx.data_registro || '');
    return ts >= startTs && ts <= endTs;
  });

  const filteredHist = filterByDate(normalizedHist);
  const filteredMov = filterByDate(normalizedMov);
  const allTx = [...filteredMov, ...filteredHist];

  switch (conditionType) {
    case 'deposit': {
      let total = 0;
      for (const tx of filteredMov) {
        if (tx.tipo.includes('DEPOSITO') || tx.tipo.includes('DEPOSIT') || tx.tipo.includes('PIX_IN')) {
          total += parseBrCurrency(tx.valor);
        }
      }
      return total;
    }
    case 'bet': {
      let total = 0;
      for (const tx of allTx) {
        if (tx.tipo.includes('COMPRA') || tx.tipo.includes('APOSTA') || tx.tipo.includes('BET')) {
          total += parseBrCurrency(tx.valor);
        }
      }
      return total;
    }
    case 'win': {
      let count = 0;
      for (const tx of allTx) {
        if (tx.tipo.includes('PREMIO') || tx.tipo.includes('GANHO') || tx.tipo.includes('WIN')) count++;
      }
      return count;
    }
    case 'play_keno': {
      let total = 0;
      for (const tx of filteredHist) {
        const jogo = (tx.jogo || '').toLowerCase();
        if ((jogo.includes('keno') || jogo.includes('bingo')) &&
            (tx.tipo.includes('COMPRA') || tx.tipo.includes('APOSTA') || tx.tipo.includes('BET'))) total += parseBrCurrency(tx.valor);
      }
      return total;
    }
    case 'play_cassino': {
      let total = 0;
      for (const tx of filteredHist) {
        const jogo = (tx.jogo || '').toLowerCase();
        const isKeno = jogo.includes('keno') || jogo.includes('bingo');
        if (!isKeno && jogo.length > 0 &&
            (tx.tipo.includes('COMPRA') || tx.tipo.includes('APOSTA') || tx.tipo.includes('BET'))) total += parseBrCurrency(tx.valor);
      }
      return total;
    }
    case 'total_games': {
      let count = 0;
      for (const tx of allTx) {
        if (tx.tipo.includes('COMPRA') || tx.tipo.includes('APOSTA') || tx.tipo.includes('BET')) count++;
      }
      return count;
    }
    case 'min_balance': {
      if (historico.length === 0) return 0;
      return parseBrCurrency(historico[0].saldo || 0);
    }
    default:
      return -1; // tracked internally
  }
}

// --- Main handler ---

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);

  const corsHeaders = getCorsHeaders(req);

  const authResult = await verifyAuth(req);
  if (!authResult) {
    return new Response(JSON.stringify({ success: false, error: 'Não autorizado' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

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
      return new Response(JSON.stringify({ success: false, error: 'Sem config ativa', logs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const siteUrl = config.site_url.replace(/\/+$/, '');
    const loginDomain = config.login_url ? config.login_url.replace(/\/+$/, '').replace(/\/login$/, '') : null;
    const baseUrl = loginDomain || siteUrl;

    const auth = await doLogin(baseUrl, config.username, config.password, config.login_url);
    if (!auth.success) {
      log('Falha no login');
      return new Response(JSON.stringify({ success: false, error: 'Login falhou', logs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    log('Login OK');
    const headers = buildHeaders(auth.cookies, baseUrl);

    // Get active missions
    const { data: missions } = await supabase
      .from('missions')
      .select('id, name, condition_type, condition_value, start_date, end_date, recurrence, reward_type, reward_value, manual_claim')
      .in('status', ['ATIVO']);

    if (!missions || missions.length === 0) {
      log('Nenhuma missão ativa');
      return new Response(JSON.stringify({ success: true, updated: 0, completed: 0, logs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    log(`${missions.length} missão(ões) ativa(s)`);

    // Get opted-in, non-completed progress entries
    const missionIds = missions.map(m => m.id);
    const { data: progressEntries } = await supabase
      .from('player_mission_progress')
      .select('id, cpf, mission_id, progress, target, completed, opted_in, started_at, reset_at')
      .in('mission_id', missionIds)
      .eq('opted_in', true)
      .eq('completed', false);

    if (!progressEntries || progressEntries.length === 0) {
      log('Nenhum jogador com opt-in pendente');
      return new Response(JSON.stringify({ success: true, updated: 0, completed: 0, logs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Group by CPF
    const cpfToEntries = new Map<string, typeof progressEntries>();
    for (const entry of progressEntries) {
      const list = cpfToEntries.get(entry.cpf) || [];
      list.push(entry);
      cpfToEntries.set(entry.cpf, list);
    }

    log(`${progressEntries.length} progresso(s) de ${cpfToEntries.size} jogador(es)`);

    const missionMap = new Map(missions.map(m => [m.id, m]));
    let totalUpdated = 0, totalCompleted = 0, totalErrors = 0;

    for (const [cpf, entries] of cpfToEntries) {
      try {
        const playerUuid = await searchPlayerByCpf(baseUrl, headers, cpf);
        if (!playerUuid) { log(`CPF ${cpf}: UUID não encontrado`); totalErrors++; continue; }

        const txResult = await fetchJSON(`${baseUrl}/usuarios/transacoes?id=${playerUuid}`, headers) as Record<string, unknown>;
        const movimentacoes: Movimentacao[] = (txResult?.movimentacoes as Movimentacao[]) || [];
        const historico: Historico[] = (txResult?.historico as Historico[]) || [];

        for (const entry of entries) {
          const mission = missionMap.get(entry.mission_id);
          if (!mission) continue;

          // Use reset_at if available (mission was reset), otherwise started_at
          const refDate = (entry.reset_at as string) || (entry.started_at as string);
          const optedInAt = refDate ? new Date(refDate).getTime() : 0;
          let startTs: number, endTs: number;
          if (mission.recurrence === 'daily') {
            const d = new Date(); d.setHours(0, 0, 0, 0);
            startTs = Math.max(d.getTime(), optedInAt); endTs = Date.now();
          } else if (mission.recurrence === 'weekly') {
            const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0);
            startTs = Math.max(d.getTime(), optedInAt); endTs = Date.now();
          } else if (mission.recurrence === 'monthly') {
            const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
            startTs = Math.max(d.getTime(), optedInAt); endTs = Date.now();
          } else {
            startTs = mission.start_date ? new Date(mission.start_date).getTime() : 0;
            startTs = Math.max(startTs, optedInAt);
            endTs = mission.end_date ? new Date(mission.end_date).getTime() : Date.now();
          }

          const rawProgress = calculateMissionProgress(movimentacoes, historico, mission.condition_type, startTs, endTs);
          if (rawProgress === -1) continue;
          const progress = Math.round(rawProgress * 100) / 100;

          const target = Number(mission.condition_value) || 1;
          const completed = progress >= target;

          await supabase.from('player_mission_progress')
            .update({
              progress, target, completed,
              ...(completed ? { completed_at: new Date().toISOString() } : {}),
            } as Record<string, unknown>)
            .eq('id', entry.id);

          totalUpdated++;
          if (completed && !entry.completed) {
            totalCompleted++;
            log(`CPF ${cpf} — "${mission.name}": CONCLUÍDA (${progress}/${target})`);

            // Auto-reward if not manual_claim
            if (!mission.manual_claim && mission.reward_value > 0) {
              try {
                const rType = mission.reward_type || 'bonus';
                const rVal = Number(mission.reward_value);
                if (rType === 'coins' || rType === 'xp' || rType === 'diamonds') {
                  const { data: w } = await supabase.from('player_wallets').select(rType).eq('cpf', cpf).maybeSingle();
                  if (w) await supabase.from('player_wallets').update({ [rType]: ((w as unknown as Record<string, number>)[rType] || 0) + rVal } as Record<string, unknown>).eq('cpf', cpf);
                } else if (rType === 'bonus' || rType === 'free_bet') {
                  // Credit on platform using existing login session
                  try {
                    // Search player by CPF
                    const searchRes = await fetch(`${baseUrl}/usuarios/lista?search=${cpf}&start=0&length=1`, { headers, signal: AbortSignal.timeout(10000) });
                    const searchText = await searchRes.text();
                    let uuid = '';
                    try {
                      const searchData = JSON.parse(searchText);
                      const rows = searchData?.data || searchData?.aaData || [];
                      if (rows.length > 0) uuid = rows[0]?.uuid || rows[0]?.id || '';
                    } catch { /* ignore */ }
                    if (uuid) {
                      await fetch(`${baseUrl}/usuarios/creditos`, {
                        method: 'POST',
                        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({ uuid, carteira: 'BONUS', valor: String(rVal), senha: config.password }).toString(),
                        signal: AbortSignal.timeout(15000),
                      });
                      log(`CPF ${cpf} — Bônus R$${rVal} creditado na plataforma (uuid: ${uuid})`);
                    }
                  } catch { /* ignore platform credit error */ }
                  await supabase.from('player_rewards_pending').insert({
                    cpf, reward_type: rType, reward_value: rVal, source: mission.name,
                    description: `Missão completada: ${mission.name}`, claimed_at: new Date().toISOString(),
                  } as Record<string, unknown>);
                }
                // Mark as claimed
                await supabase.from('player_mission_progress').update({
                  claimed: true, claimed_at: new Date().toISOString(),
                } as Record<string, unknown>).eq('id', entry.id);
                // Log activity
                await supabase.from('player_activity_log').insert({
                  cpf, type: 'mission_complete', amount: rVal, source: mission.name,
                  description: `Missão completada: ${mission.name} — ${rType} ${rVal}`,
                } as Record<string, unknown>);
                log(`CPF ${cpf} — "${mission.name}": RECOMPENSA ${rType} ${rVal} entregue`);
              } catch (e) {
                log(`CPF ${cpf} — "${mission.name}": ERRO na recompensa — ${(e as Error).message}`);
              }
            }
          }
        }
      } catch (e) {
        log(`CPF ${cpf}: ERRO — ${(e as Error).message}`);
        totalErrors++;
      }
    }

    log(`Concluído: ${totalUpdated} atualizados, ${totalCompleted} concluídos, ${totalErrors} erros`);

    return new Response(JSON.stringify({
      success: true, updated: totalUpdated, completed: totalCompleted,
      errors: totalErrors, missions: missions.length, players: cpfToEntries.size, logs,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    log(`Erro fatal: ${(error as Error).message}`);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message, logs }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
