import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse, verifyAuth } from './_cors.js';

export const config = { runtime: 'edge' };

const DEFAULT_SITE = 'https://pixbingobr.concurso.club';
const DEFAULT_LOGIN = 'https://pixbingobr.concurso.club/login';

async function doLogin(username: string, password: string): Promise<{ cookies: string; success: boolean }> {
  let initialCookies = '';
  try {
    const initRes = await fetch(DEFAULT_SITE, { method: 'GET', headers: { 'Accept': 'text/html' }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const setCookies = initRes.headers.getSetCookie?.() || [];
    initialCookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
  } catch { /* ignore */ }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/json,*/*',
      'Referer': `${DEFAULT_SITE}/`,
      'Origin': DEFAULT_SITE,
    };
    if (initialCookies) headers['Cookie'] = initialCookies;

    const res = await fetch(DEFAULT_LOGIN, {
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

function buildHeaders(cookies: string): Record<string, string> {
  return { 'Accept': 'application/json, text/javascript, */*', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': cookies, 'Referer': DEFAULT_SITE };
}

async function fetchJSON(url: string, headers: Record<string, string>, method = 'GET', body?: Record<string, string>): Promise<Record<string, unknown>> {
  const opts: RequestInit = { method, headers: { ...headers }, signal: AbortSignal.timeout(15000) };
  if (body && method === 'POST') {
    opts.body = new URLSearchParams(body).toString();
    (opts.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { _raw: text.slice(0, 500), _status: res.status }; }
}

async function resolveUuid(cpf: string, headers: Record<string, string>): Promise<string | null> {
  const params = new URLSearchParams({ draw: '1', start: '0', length: '1', busca_cpf: cpf });
  const cols = ['username', 'celular', 'cpf', 'created_at', 'ultimo_login', 'situacao', 'uuid'];
  cols.forEach((col, i) => {
    params.set(`columns[${i}][data]`, col); params.set(`columns[${i}][name]`, '');
    params.set(`columns[${i}][searchable]`, 'true'); params.set(`columns[${i}][orderable]`, 'true');
    params.set(`columns[${i}][search][value]`, ''); params.set(`columns[${i}][search][regex]`, 'false');
  });
  params.set('order[0][column]', '0'); params.set('order[0][dir]', 'asc');
  params.set('search[value]', ''); params.set('search[regex]', 'false');
  const result = await fetchJSON(`${DEFAULT_SITE}/usuarios/listar?${params}`, headers);
  return result?.aaData?.[0]?.uuid || null;
}

function normalizeMoney(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const str = String(value ?? '').trim();
  if (!str) return 0;
  const normalized = str.includes(',') ? str.replace(/\./g, '').replace(',', '.') : str;
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}

function extractDateTime(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const directMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (directMatch) return `${directMatch[1]}T${directMatch[2]}`;
  const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}T00:00:00`;
  const parsed = new Date(raw.includes(' ') ? raw.replace(' ', 'T') : raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19);
}

function isDateTimeInRange(dt: string | null, startDt: string, endDt: string): boolean {
  if (!dt) return false;
  return dt >= startDt && dt <= endDt;
}

async function getPlayerBetsAndWins(
  uuid: string, headers: Record<string, string>,
  startDt: string, endDt: string, gameFilter: string
): Promise<{ bets: number; wins: number }> {
  const result = await fetchJSON(`${DEFAULT_SITE}/usuarios/transacoes?id=${encodeURIComponent(uuid)}`, headers);
  const transactions = result?.historico || result?.data?.historico || [];

  let bets = 0, wins = 0;
  const gameFilterUpper = (gameFilter || '').toUpperCase();

  for (const tx of transactions) {
    const operation = String(tx.operacao || tx.tipo || '').toUpperCase();
    const txDt = extractDateTime(tx.data_registro || tx.created_at || tx.data);
    if (!isDateTimeInRange(txDt, startDt, endDt)) continue;

    if (gameFilterUpper) {
      const gameName = String(tx.jogo || tx.game || tx.descricao || '').toUpperCase();
      const isBingoGame = gameName.includes('BINGO') || gameName.includes('KENO');
      if (gameFilterUpper === 'BINGO' && !isBingoGame) continue;
      if (gameFilterUpper === 'CASSINO' && isBingoGame) continue;
    }

    const valor = Math.abs(normalizeMoney(tx.valor));
    if (operation.includes('COMPRA') || operation.includes('APOSTA') || operation.includes('BET')) {
      bets += valor;
    } else if (operation.includes('PREMIO') || operation.includes('GANHO') || operation.includes('VENDA')) {
      wins += valor;
    }
  }

  return { bets, wins };
}

function toFortaleza(isoStr: string): string {
  const d = new Date(isoStr);
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Fortaleza',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);

  const corsHeaders = getCorsHeaders(req);

  const authResult = await verifyAuth(req);
  if (!authResult) {
    return new Response(JSON.stringify({ success: false, error: 'Não autorizado' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json();
    const { rule_id, username, password, period_start, period_end, action, execution_id } = body;

    if (!rule_id || !username || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Parâmetros obrigatórios: rule_id, username, password' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: rule, error: ruleErr } = await supabase
      .from('cashback_rules').select('*').eq('id', rule_id).single();
    if (ruleErr || !rule) {
      return new Response(JSON.stringify({ success: false, error: 'Regra de cashback não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!rule.segment_id) {
      return new Response(JSON.stringify({ success: false, error: 'Regra sem segmento vinculado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: segmentItems, error: segErr } = await supabase
      .from('segment_items').select('cpf, cpf_masked').eq('segment_id', rule.segment_id);
    if (segErr || !segmentItems?.length) {
      return new Response(JSON.stringify({ success: false, error: 'Segmento vazio ou erro ao buscar jogadores' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === ACTION: CREDIT - approve and credit an existing execution ===
    if (action === 'credit' && execution_id) {
      const auth = await doLogin(username, password);
      if (!auth.success) {
        return new Response(JSON.stringify({ success: false, error: 'Login na plataforma falhou' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const headers = buildHeaders(auth.cookies);

      const { data: pendingItems, error: itemsErr } = await supabase
        .from('cashback_items').select('*').eq('execution_id', execution_id).eq('status', 'AGUARDANDO');

      if (itemsErr || !pendingItems?.length) {
        return new Response(JSON.stringify({ success: false, error: 'Nenhum item aguardando aprovação' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let credited = 0, errors = 0;
      let totalCredited = 0;

      for (const item of pendingItems) {
        try {
          const creditBody = {
            uuid: item.uuid,
            carteira: rule.wallet_type === 'BONUS' ? 'BONUS' : 'CREDITO',
            valor: String(item.cashback_value), senha: password,
          };
          const creditResult = await fetchJSON(`${DEFAULT_SITE}/usuarios/creditos`, headers, 'POST', creditBody);

          if (creditResult.status === true || creditResult.msg?.includes('sucesso')) {
            await supabase.from('cashback_items').update({
              status: 'CREDITADO', credit_result: JSON.stringify(creditResult).slice(0, 200),
            }).eq('id', item.id);
            credited++;
            totalCredited += Number(item.cashback_value);
          } else {
            await supabase.from('cashback_items').update({
              status: 'ERRO', credit_result: JSON.stringify(creditResult).slice(0, 200),
            }).eq('id', item.id);
            errors++;
          }
        } catch (e: unknown) {
          await supabase.from('cashback_items').update({
            status: 'ERRO', credit_result: e instanceof Error ? e.message : 'Erro',
          }).eq('id', item.id);
          errors++;
        }
        await new Promise(r => setTimeout(r, 300));
      }

      await supabase.from('cashback_executions').update({
        total_credited: totalCredited, errors, status: 'CONCLUIDO',
      }).eq('id', execution_id);

      return new Response(JSON.stringify({
        success: true,
        data: { execution_id, credited, errors, total_credited: totalCredited },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === CALCULATE or FULL PROCESS ===
    const isCalculateOnly = action === 'calculate';

    const auth = await doLogin(username, password);
    if (!auth.success) {
      return new Response(JSON.stringify({ success: false, error: 'Login na plataforma falhou' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const headers = buildHeaders(auth.cookies);

    const now = new Date();
    let pStart: string, pEnd: string;

    if (period_start && period_end) {
      pStart = period_start;
      pEnd = period_end;
    } else if (rule.period === 'daily') {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const yStart = new Date(yesterday);
      yStart.setHours(0, 0, 0, 0);
      const yEnd = new Date(yesterday);
      yEnd.setHours(23, 59, 59, 999);
      pStart = yStart.toISOString();
      pEnd = yEnd.toISOString();
    } else {
      const dayOfWeek = now.getDay();
      const lastSunday = new Date(now);
      lastSunday.setDate(now.getDate() - (dayOfWeek === 0 ? 7 : dayOfWeek));
      lastSunday.setHours(23, 59, 59, 999);
      const lastMonday = new Date(lastSunday);
      lastMonday.setDate(lastSunday.getDate() - 6);
      lastMonday.setHours(0, 0, 0, 0);
      pStart = lastMonday.toISOString();
      pEnd = lastSunday.toISOString();
    }

    const startDt = toFortaleza(pStart);
    const endDt = toFortaleza(pEnd);

    const { data: execution, error: execErr } = await supabase
      .from('cashback_executions')
      .insert({ rule_id, period_start: pStart, period_end: pEnd, total_players: segmentItems.length, status: 'PROCESSANDO' })
      .select('id').single();

    if (execErr || !execution) {
      console.error('[process-cashback] Erro ao criar execução:', execErr?.message);
      return new Response(JSON.stringify({ success: false, error: 'Erro ao criar execução' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const executionId = execution.id;
    const gameFilter = rule.game_type === 'both' ? '' : rule.game_type.toUpperCase();
    const percentage = Number(rule.percentage);
    const minLoss = Number(rule.min_loss);
    const maxCashback = rule.max_cashback ? Number(rule.max_cashback) : null;

    let eligible = 0, credited = 0, errors = 0;
    let totalCredited = 0;

    for (const player of segmentItems) {
      try {
        const uuid = await resolveUuid(player.cpf, headers);

        if (!uuid) {
          await supabase.from('cashback_items').insert({
            execution_id: executionId, rule_id, cpf: player.cpf, cpf_masked: player.cpf_masked,
            status: 'ERRO', credit_result: 'UUID não encontrado',
          });
          errors++;
          continue;
        }

        const { bets, wins } = await getPlayerBetsAndWins(uuid, headers, startDt, endDt, gameFilter);
        const netLoss = bets - wins;

        if (netLoss <= 0 || netLoss < minLoss) {
          await supabase.from('cashback_items').insert({
            execution_id: executionId, rule_id, cpf: player.cpf, cpf_masked: player.cpf_masked,
            uuid, total_bets: bets, total_wins: wins, net_loss: Math.max(0, netLoss),
            cashback_value: 0, status: 'SEM_PERDA',
          });
          continue;
        }

        eligible++;
        let cashbackValue = netLoss * (percentage / 100);
        if (maxCashback && cashbackValue > maxCashback) cashbackValue = maxCashback;
        cashbackValue = Math.round(cashbackValue * 100) / 100;

        if (isCalculateOnly) {
          await supabase.from('cashback_items').insert({
            execution_id: executionId, rule_id, cpf: player.cpf, cpf_masked: player.cpf_masked,
            uuid, total_bets: bets, total_wins: wins, net_loss: netLoss,
            cashback_value: cashbackValue, status: 'AGUARDANDO',
          });
          totalCredited += cashbackValue;
        } else {
          const creditBody = {
            uuid, carteira: rule.wallet_type === 'BONUS' ? 'BONUS' : 'CREDITO',
            valor: String(cashbackValue), senha: password,
          };
          const creditResult = await fetchJSON(`${DEFAULT_SITE}/usuarios/creditos`, headers, 'POST', creditBody);

          if (creditResult.status === true || creditResult.msg?.includes('sucesso')) {
            await supabase.from('cashback_items').insert({
              execution_id: executionId, rule_id, cpf: player.cpf, cpf_masked: player.cpf_masked,
              uuid, total_bets: bets, total_wins: wins, net_loss: netLoss,
              cashback_value: cashbackValue, status: 'CREDITADO',
              credit_result: JSON.stringify(creditResult).slice(0, 200),
            });
            credited++;
            totalCredited += cashbackValue;
          } else {
            await supabase.from('cashback_items').insert({
              execution_id: executionId, rule_id, cpf: player.cpf, cpf_masked: player.cpf_masked,
              uuid, total_bets: bets, total_wins: wins, net_loss: netLoss,
              cashback_value: cashbackValue, status: 'ERRO',
              credit_result: JSON.stringify(creditResult).slice(0, 200),
            });
            errors++;
          }
        }
      } catch (e: unknown) {
        await supabase.from('cashback_items').insert({
          execution_id: executionId, rule_id, cpf: player.cpf, cpf_masked: player.cpf_masked,
          status: 'ERRO', credit_result: e instanceof Error ? e.message : 'Erro',
        });
        errors++;
      }

      await new Promise(r => setTimeout(r, 300));
    }

    const finalStatus = isCalculateOnly ? 'AGUARDANDO_APROVACAO' : 'CONCLUIDO';
    await supabase.from('cashback_executions').update({
      eligible_players: eligible,
      total_credited: isCalculateOnly ? 0 : totalCredited,
      errors, status: finalStatus,
    }).eq('id', executionId);

    return new Response(JSON.stringify({
      success: true,
      data: {
        execution_id: executionId,
        total_players: segmentItems.length,
        eligible, credited, errors,
        total_credited: isCalculateOnly ? 0 : totalCredited,
        estimated_total: isCalculateOnly ? totalCredited : undefined,
        awaiting_approval: isCalculateOnly,
        period: { start: pStart, end: pEnd },
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('[process-cashback]', error instanceof Error ? error.message : 'Erro');
    return new Response(JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
