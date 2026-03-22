/* eslint-disable @typescript-eslint/no-explicit-any */
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

async function fetchJSON(url: string, headers: Record<string, string>, method = 'GET', body?: any): Promise<any> {
  const opts: RequestInit = { method, headers: { ...headers }, signal: AbortSignal.timeout(15000) };
  if (body && method === 'POST') {
    opts.body = new URLSearchParams(body).toString();
    (opts.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 500), _status: res.status }; }
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

async function getPlayerDepositTotal(cpf: string, headers: Record<string, string>, dateStart: string, dateEnd: string, type: string, walletType: string): Promise<number> {
  const params = new URLSearchParams();
  params.set('draw', '1'); params.set('start', '0'); params.set('length', '5000'); params.set('exportar', '0');
  const txCols = ['id', 'tipo', 'valor', 'saldo_anterior', 'saldo_posterior', 'cpf', 'username', 'created_at', 'descricao', 'status'];
  txCols.forEach((col, i) => {
    params.set(`columns[${i}][data]`, col); params.set(`columns[${i}][name]`, '');
    params.set(`columns[${i}][searchable]`, 'true'); params.set(`columns[${i}][orderable]`, 'true');
    params.set(`columns[${i}][search][value]`, ''); params.set(`columns[${i}][search][regex]`, 'false');
  });
  params.set('order[0][column]', '0'); params.set('order[0][dir]', 'desc');
  params.set('search[value]', ''); params.set('search[regex]', 'false');
  params.set('busca_cpf', cpf);
  params.set('busca_data_inicio', dateStart);
  params.set('busca_data_fim', dateEnd);
  if (type === 'deposite_e_ganhe') params.set('busca_tipo_transacao', 'DEPOSITO');

  const result = await fetchJSON(`${DEFAULT_SITE}/transferencias/listar?${params}`, headers);
  const transactions = result?.aaData || [];

  let totalValue = 0;
  for (const tx of transactions) {
    const valor = Math.abs(normalizeMoney(tx.valor));
    const tipoStr = String(tx.tipo_transacao || tx.tipo || tx.descricao || '').toUpperCase();
    const descStr = String(tx.descricao || '').toUpperCase();
    const isBonusTransaction = descStr.includes('BONUS') || descStr.includes('BÔNUS') || tipoStr.includes('BONUS');
    if (walletType === 'BONUS' && !isBonusTransaction) continue;
    if (walletType === 'REAL' && isBonusTransaction) continue;
    if (tipoStr.includes('DEPOSITO')) totalValue += valor;
  }
  return totalValue;
}

async function getPlayerBetTotal(uuid: string, headers: Record<string, string>, startDt: string, endDt: string, walletType: string, gameFilter: string): Promise<number> {
  const result = await fetchJSON(`${DEFAULT_SITE}/usuarios/transacoes?id=${encodeURIComponent(uuid)}`, headers);
  const transactions = result?.historico || result?.data?.historico || [];
  let totalValue = 0;
  const gameFilterUpper = (gameFilter || '').toUpperCase();

  for (const tx of transactions) {
    const operation = String(tx.operacao || tx.tipo || '').toUpperCase();
    if (!operation.includes('COMPRA') && !operation.includes('APOSTA') && !operation.includes('BET')) continue;
    const txDt = extractDateTime(tx.data_registro || tx.created_at || tx.data);
    if (!isDateTimeInRange(txDt, startDt, endDt)) continue;
    if (gameFilterUpper) {
      const gameName = String(tx.jogo || tx.game || tx.descricao || '').toUpperCase();
      const isBingoGame = gameName.includes('BINGO') || gameName.includes('KENO');
      if (gameFilterUpper === 'BINGO' && !isBingoGame) continue;
      else if (gameFilterUpper === 'CASSINO' && isBingoGame) continue;
      else if (gameFilterUpper !== 'BINGO' && gameFilterUpper !== 'CASSINO' && !gameName.includes(gameFilterUpper)) continue;
    }
    const wallet = String(tx.carteira || '').toUpperCase();
    const walletIsBonus = wallet === 'BONUS';
    const walletIsReal = wallet === 'REAL' || wallet === 'CREDITO' || wallet === 'PREMIO';
    if (walletType === 'BONUS' && !walletIsBonus) continue;
    if (walletType === 'REAL' && !walletIsReal) continue;
    totalValue += Math.abs(normalizeMoney(tx.valor));
  }
  return totalValue;
}

async function getPlayerWinTotal(uuid: string, headers: Record<string, string>, startDt: string, endDt: string, gameFilter: string): Promise<number> {
  const result = await fetchJSON(`${DEFAULT_SITE}/usuarios/transacoes?id=${encodeURIComponent(uuid)}`, headers);
  const transactions = result?.historico || result?.data?.historico || [];
  let totalWin = 0;
  const gameFilterUpper = gameFilter.toUpperCase();

  for (const tx of transactions) {
    const operation = String(tx.operacao || tx.tipo || '').toUpperCase();
    if (!operation.includes('PREMIO') && !operation.includes('GANHO') && !operation.includes('VENDA')) continue;
    const txDt = extractDateTime(tx.data_registro || tx.created_at || tx.data);
    if (!isDateTimeInRange(txDt, startDt, endDt)) continue;
    if (gameFilter) {
      const gameName = String(tx.jogo || tx.game || '').toUpperCase();
      if (!gameName.includes(gameFilterUpper)) continue;
    }
    totalWin += Math.abs(normalizeMoney(tx.valor));
  }
  return totalWin;
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
    const { campaign_id } = body;
    let { username, password } = body;

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auto-fill credentials from platform_config if not provided
    if (!username || !password || username === 'auto' || password === 'auto') {
      const { data: config } = await supabase.from('platform_config')
        .select('*').eq('active', true).order('created_at', { ascending: false }).limit(1).single();
      if (config) {
        username = config.username;
        password = config.password;
      }
    }

    const { data: campaign, error: campErr } = await supabase
      .from('campaigns').select('*').eq('id', campaign_id).single();
    if (campErr || !campaign) {
      return new Response(JSON.stringify({ success: false, error: 'Campanha não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!campaign.segment_id) {
      return new Response(JSON.stringify({ success: false, error: 'Campanha sem segmento vinculado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: segmentItems, error: segErr } = await supabase
      .from('segment_items').select('cpf, cpf_masked').eq('segment_id', campaign.segment_id);
    if (segErr || !segmentItems?.length) {
      return new Response(JSON.stringify({ success: false, error: 'Segmento vazio ou erro ao buscar jogadores' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let eligibleCpfs = segmentItems;
    if (campaign.popup_id) {
      const { data: clickEvents } = await supabase
        .from('popup_events').select('cpf, cpf_masked')
        .eq('popup_id', campaign.popup_id).eq('event_type', 'click');

      if (!clickEvents?.length) {
        return new Response(JSON.stringify({ success: true, data: { processed: 0, eligible: 0, credited: 0, errors: 0, waiting_for_optins: true, message: 'Nenhum jogador fez opt-in (clicou no popup)' } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const clickedCpfs = new Set(clickEvents.map((e: any) => e.cpf));
      eligibleCpfs = segmentItems.filter((si: any) => clickedCpfs.has(si.cpf));

      if (!eligibleCpfs.length) {
        return new Response(JSON.stringify({ success: true, data: { processed: 0, eligible: 0, credited: 0, errors: 0, waiting_for_optins: true, message: 'Nenhum jogador do segmento fez opt-in no popup' } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const auth = await doLogin(username, password);
    if (!auth.success) {
      return new Response(JSON.stringify({ success: false, error: 'Login na plataforma falhou' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const headers = buildHeaders(auth.cookies);

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
    function toFortalezaDate(isoStr: string): string {
      const local = toFortaleza(isoStr);
      const [y, m, d] = local.split('T')[0].split('-');
      return `${d}/${m}/${y}`;
    }

    const effectiveStart = campaign.activated_at || campaign.start_date;
    const dateStart = toFortalezaDate(effectiveStart);
    const dateEnd = toFortalezaDate(campaign.end_date);
    const startDt = toFortaleza(effectiveStart);
    const endDt = toFortaleza(campaign.end_date);

    const participantsToUpsert = eligibleCpfs.map((si: any) => ({
      campaign_id, cpf: si.cpf, cpf_masked: si.cpf_masked, status: 'PENDENTE',
    }));

    for (let i = 0; i < participantsToUpsert.length; i += 500) {
      await supabase.from('campaign_participants')
        .upsert(participantsToUpsert.slice(i, i + 500), { onConflict: 'campaign_id,cpf', ignoreDuplicates: true });
    }

    const BATCH_LIMIT = 5; // Process max 5 per call to avoid 504 timeout

    const { data: participants } = await supabase
      .from('campaign_participants').select('*')
      .eq('campaign_id', campaign_id).eq('prize_credited', false)
      .in('status', ['PENDENTE', 'NAO_ELEGIVEL'])
      .limit(BATCH_LIMIT);

    if (!participants?.length) {
      return new Response(JSON.stringify({ success: true, data: { processed: 0, eligible: 0, credited: 0, errors: 0, remaining: 0, waiting_for_optins: !!campaign.popup_id, message: 'Todos já foram processados' } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let processed = 0, eligible = 0, credited = 0, errors = 0;

    for (const participant of participants) {
      processed++;
      try {
        let uuid = participant.uuid;
        if (!uuid) {
          uuid = await resolveUuid(participant.cpf, headers);
          if (uuid) await supabase.from('campaign_participants').update({ uuid }).eq('id', participant.id);
        }

        let totalValue = 0;
        if (campaign.type === 'aposte_e_ganhe') {
          if (!uuid) {
            await supabase.from('campaign_participants').update({ status: 'ERRO', credit_result: 'UUID não encontrado para leitura de apostas' }).eq('id', participant.id);
            errors++;
            continue;
          }
          totalValue = await getPlayerBetTotal(uuid, headers, startDt, endDt, campaign.wallet_type || 'REAL', campaign.game_filter || '');
        } else if (campaign.type === 'ganhou_no_keno') {
          if (!uuid) {
            await supabase.from('campaign_participants').update({ status: 'ERRO', credit_result: 'UUID não encontrado para leitura de prêmios' }).eq('id', participant.id);
            errors++;
            continue;
          }
          totalValue = await getPlayerWinTotal(uuid, headers, startDt, endDt, campaign.game_filter || '');
        } else {
          totalValue = await getPlayerDepositTotal(participant.cpf, headers, dateStart, dateEnd, campaign.type, campaign.wallet_type || 'REAL');
        }

        await supabase.from('campaign_participants').update({ total_value: totalValue }).eq('id', participant.id);

        if (totalValue < Number(campaign.min_value)) {
          await supabase.from('campaign_participants').update({ status: 'NAO_ELEGIVEL' }).eq('id', participant.id);
          continue;
        }

        eligible++;

        if (!uuid) {
          await supabase.from('campaign_participants').update({ status: 'ERRO', credit_result: 'UUID não encontrado' }).eq('id', participant.id);
          errors++;
          continue;
        }

        const { data: locked } = await supabase
          .from('campaign_participants')
          .update({ status: 'PROCESSANDO' } as any)
          .eq('id', participant.id).eq('prize_credited', false)
          .in('status', ['PENDENTE', 'NAO_ELEGIVEL'])
          .select('id').maybeSingle();

        if (!locked) continue;

        const creditBody = { uuid, carteira: 'BONUS', valor: String(campaign.prize_value), senha: password };
        const creditResult = await fetchJSON(`${DEFAULT_SITE}/usuarios/creditos`, headers, 'POST', creditBody);

        if (creditResult.status === true || creditResult.msg?.includes('sucesso')) {
          await supabase.from('campaign_participants').update({
            status: 'CREDITADO', prize_credited: true,
            credit_result: JSON.stringify(creditResult).slice(0, 200),
          }).eq('id', participant.id);
          credited++;
        } else {
          await supabase.from('campaign_participants').update({
            status: 'ERRO', credit_result: JSON.stringify(creditResult).slice(0, 200),
          }).eq('id', participant.id);
          errors++;
        }
      } catch (e) {
        await supabase.from('campaign_participants').update({
          status: 'ERRO', credit_result: (e as Error).message,
        }).eq('id', participant.id);
        errors++;
      }

      await new Promise(r => setTimeout(r, 300));
    }

    // Check how many still remain
    const { count: remaining } = await supabase
      .from('campaign_participants').select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign_id).eq('prize_credited', false)
      .in('status', ['PENDENTE', 'NAO_ELEGIVEL']);

    return new Response(JSON.stringify({
      success: true,
      data: { processed, eligible, credited, errors, total: participants.length, remaining: remaining || 0 },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[process-campaign]', (error as Error).message);
    return new Response(JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
