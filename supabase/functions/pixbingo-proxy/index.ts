const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Action = 'login' | 'list_users' | 'search_player' | 'player_transactions'
  | 'credit_bonus' | 'cancel_bonus' | 'list_transactions' | 'financeiro' | 'credit_batch';

interface ProxyRequest {
  action: Action;
  site_url: string;
  login_url?: string;
  username: string;
  password: string;
  cpf?: string;
  uuid?: string;
  player_id?: string;
  bonus_amount?: number;
  batch_id?: string;
  page?: number;
  limit?: number;
  search?: string;
  // DataTables params
  draw?: number;
  start?: number;
  length?: number;
  busca_username?: string;
  busca_cpf?: string;
  busca_celular?: string;
  busca_data_inicio?: string;
  busca_data_fim?: string;
  busca_tipo_transacao?: string;
  busca_email?: string;
  busca_agrupamento?: string;
}

async function doLogin(body: ProxyRequest): Promise<{ cookies: string; success: boolean }> {
  const baseUrl = body.site_url.replace(/\/+$/, '');
  const loginUrl = body.login_url || `${baseUrl}/login`;

  // Step 1: GET site for session cookie
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
    console.log(`[doLogin] GET failed: ${(e as Error).message}`);
  }

  // Step 2: POST login with usuario/senha (form-encoded)
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/json,*/*',
      'Referer': `${baseUrl}/`,
      'Origin': baseUrl,
    };
    if (initialCookies) headers['Cookie'] = initialCookies;

    const res = await fetch(loginUrl, {
      method: 'POST',
      headers,
      body: new URLSearchParams({ usuario: body.username, senha: body.password }).toString(),
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

    console.log(`[doLogin] Status=${res.status}, cookies=${cookieMap.size}`);

    // 302 redirect to non-login page = success
    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get('location') || '';
      if (!location.includes('/login') && !location.includes('error')) {
        return { cookies, success: true };
      }
    }

    // 200 with JSON success
    if (res.ok) {
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data.status === true || data.logged === true) {
          return { cookies, success: true };
        }
      } catch {}
    }
  } catch (e) {
    console.log(`[doLogin] POST failed: ${(e as Error).message}`);
  }

  return { cookies: '', success: false };
}

function buildHeaders(cookies: string, baseUrl: string): Record<string, string> {
  const h: Record<string, string> = {
    'Accept': 'application/json, text/javascript, */*',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (cookies) h['Cookie'] = cookies;
  if (baseUrl) h['Referer'] = baseUrl;
  return h;
}

async function fetchJSON(url: string, headers: Record<string, string>, method = 'GET', body?: any): Promise<any> {
  const opts: RequestInit = { method, headers: { ...headers }, signal: AbortSignal.timeout(15000) };
  if (body && method === 'POST') {
    if (typeof body === 'string') {
      opts.body = body;
      (opts.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded';
    } else {
      opts.body = new URLSearchParams(body).toString();
      (opts.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }

  console.log(`[fetchJSON] ${method} ${url}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`[fetchJSON] Status=${res.status}, body=${text.slice(0, 300)}`);

  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 500), _status: res.status };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body: ProxyRequest = await req.json();
    const baseUrl = body.site_url.replace(/\/+$/, '');

    const auth = await doLogin(body);
    if (!auth.success) {
      return new Response(JSON.stringify({ success: false, error: 'Login falhou. Verifique credenciais e URL.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const headers = buildHeaders(auth.cookies, baseUrl);

    let result: any = null;

    switch (body.action) {
      case 'login':
        result = { logged: true };
        break;

      case 'list_users': {
        const params = new URLSearchParams();
        params.set('draw', String(body.draw || 1));
        params.set('start', String(body.start || 0));
        params.set('length', String(body.length || 50));
        // DataTables required column params
        const userCols = ['username','celular','cpf','created_at','ultimo_login','situacao','uuid'];
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
        if (body.busca_username) params.set('busca_username', body.busca_username);
        if (body.busca_cpf) params.set('busca_cpf', body.busca_cpf);
        if (body.busca_celular) params.set('busca_celular', body.busca_celular);
        if (body.busca_data_inicio) params.set('busca_data_inicio', body.busca_data_inicio);
        if (body.busca_data_fim) params.set('busca_data_fim', body.busca_data_fim);
        if (body.search && !body.busca_cpf && !body.busca_username) {
          params.set('busca_cpf', body.search);
        }
        result = await fetchJSON(`${baseUrl}/usuarios/listar?${params}`, headers);
        break;
      }

      case 'search_player': {
        const query = body.cpf || body.uuid || '';
        const params = new URLSearchParams({
          draw: '1', start: '0', length: '10',
        });
        // Detect if query is UUID format or CPF
        if (query.includes('-')) {
          params.set('busca_uuid', query);
        } else {
          params.set('busca_cpf', query);
        }
        // Add mandatory DataTables columns (same as list_users)
        const userCols = ['username','celular','cpf','created_at','ultimo_login','situacao','uuid'];
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
        result = await fetchJSON(`${baseUrl}/usuarios/listar?${params}`, headers);
        break;
      }

      case 'player_transactions': {
        const id = body.player_id || body.uuid || '';
        result = await fetchJSON(`${baseUrl}/usuarios/transacoes?id=${id}`, headers);
        break;
      }

      case 'credit_bonus': {
        const id = body.player_id || body.uuid || '';
        const amount = body.bonus_amount || 0;
        // Real form fields: uuid, carteira, valor, senha (admin password required)
        const creditBody: Record<string, string> = {
          uuid: id,
          carteira: (body as any).carteira || 'BONUS',
          valor: String(amount),
          senha: body.password, // admin password is required by the form
        };
        result = await fetchJSON(`${baseUrl}/usuarios/creditos`, headers, 'POST', creditBody);
        break;
      }

      case 'list_transactions': {
        const params = new URLSearchParams();
        params.set('draw', String(body.draw || 1));
        params.set('start', String(body.start || 0));
        params.set('length', String(body.length || 50));
        params.set('exportar', '0');
        const txCols = ['id','tipo','valor','saldo_anterior','saldo_posterior','cpf','username','created_at','descricao','status'];
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
        if (body.busca_data_inicio) params.set('busca_data_inicio', body.busca_data_inicio);
        if (body.busca_data_fim) params.set('busca_data_fim', body.busca_data_fim);
        if (body.busca_tipo_transacao) params.set('busca_tipo_transacao', body.busca_tipo_transacao);
        if (body.busca_email) params.set('busca_email', body.busca_email);
        if (body.busca_cpf) params.set('busca_cpf', body.busca_cpf);
        if (body.busca_agrupamento) params.set('busca_agrupamento', body.busca_agrupamento || '');
        if (body.search && !body.busca_cpf) {
          params.set('busca_cpf', body.search);
        }
        result = await fetchJSON(`${baseUrl}/transferencias/listar?${params}`, headers);
        break;
      }

      case 'financeiro': {
        const buildDtParams = (usePeriodoKeys: boolean) => {
          const p = new URLSearchParams();
          p.set('draw', String(body.draw || 1));
          p.set('start', String(body.start || 0));
          p.set('length', String(body.length || 50));
          p.set('exportar', '0');

          const finCols = ['data', 'depositos', 'saques', 'bonus', 'ggr', 'comissao', 'lucro'];
          finCols.forEach((col, i) => {
            p.set(`columns[${i}][data]`, col);
            p.set(`columns[${i}][name]`, '');
            p.set(`columns[${i}][searchable]`, 'true');
            p.set(`columns[${i}][orderable]`, 'true');
            p.set(`columns[${i}][search][value]`, '');
            p.set(`columns[${i}][search][regex]`, 'false');
          });

          p.set('order[0][column]', '0');
          p.set('order[0][dir]', 'desc');
          p.set('search[value]', '');
          p.set('search[regex]', 'false');

          if (body.busca_data_inicio) p.set(usePeriodoKeys ? 'busca_periodo_ini' : 'busca_data_inicio', body.busca_data_inicio);
          if (body.busca_data_fim) p.set(usePeriodoKeys ? 'busca_periodo_fim' : 'busca_data_fim', body.busca_data_fim);
          p.set('busca_agrupamento', body.busca_agrupamento || 'dia');
          if (csrfToken) p.set('_token', csrfToken);
          return p;
        };

        const buildMinimalParams = (usePeriodoKeys: boolean) => {
          const p = new URLSearchParams();
          if (body.busca_data_inicio) p.set(usePeriodoKeys ? 'busca_periodo_ini' : 'busca_data_inicio', body.busca_data_inicio);
          if (body.busca_data_fim) p.set(usePeriodoKeys ? 'busca_periodo_fim' : 'busca_data_fim', body.busca_data_fim);
          p.set('busca_agrupamento', body.busca_agrupamento || 'dia');
          if (csrfToken) p.set('_token', csrfToken);
          return p;
        };

        const financePageRes = await fetch(`${baseUrl}/financeiro`, {
          method: 'GET',
          headers: { ...headers, Accept: 'text/html,application/xhtml+xml,*/*' },
          signal: AbortSignal.timeout(12000),
        });
        const financeHtml = await financePageRes.text();

        const detectedPathMatch = financeHtml.match(/['"`](\/[^'"`]*financeiro[^'"`]*listar[^'"`]*)['"`]/i);
        const detectedPath = detectedPathMatch?.[1] || '/financeiro/listar';
        const csrfMatch = financeHtml.match(/name=["']_token["'][^>]*value=["']([^"']+)["']/i)
          || financeHtml.match(/meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i);
        const csrfToken = csrfMatch?.[1] || '';

        console.log(`[financeiro] page_status=${financePageRes.status}, login_page=${financeHtml.toLowerCase().includes('<h1>login')}, endpoint=${detectedPath}, csrf=${csrfToken ? 'yes' : 'no'}`);

        const isFinanceError = (r: any) => {
          const code = Number(r?.code ?? r?._status ?? 0);
          const msg = String(r?.Msg || r?._raw || '').toLowerCase();
          return code >= 400 || msg.includes('inválid') || msg.includes('inval') || msg.includes('não encontrada') || msg.includes('nao encontrada');
        };

        const attempts: Array<{ label: string; method: 'GET' | 'POST'; url: string; body?: Record<string, string> }> = [
          { label: 'GET dt + periodo', method: 'GET', url: `${baseUrl}${detectedPath}?${buildDtParams(true).toString()}` },
          { label: 'GET dt + data', method: 'GET', url: `${baseUrl}${detectedPath}?${buildDtParams(false).toString()}` },
          { label: 'GET minimal + periodo', method: 'GET', url: `${baseUrl}${detectedPath}?${buildMinimalParams(true).toString()}` },
          { label: 'GET minimal + data', method: 'GET', url: `${baseUrl}${detectedPath}?${buildMinimalParams(false).toString()}` },
          { label: 'POST dt + periodo', method: 'POST', url: `${baseUrl}${detectedPath}`, body: Object.fromEntries(buildDtParams(true).entries()) },
          { label: 'POST dt + data', method: 'POST', url: `${baseUrl}${detectedPath}`, body: Object.fromEntries(buildDtParams(false).entries()) },
          { label: 'POST minimal + periodo', method: 'POST', url: `${baseUrl}${detectedPath}`, body: Object.fromEntries(buildMinimalParams(true).entries()) },
          { label: 'POST minimal + data', method: 'POST', url: `${baseUrl}${detectedPath}`, body: Object.fromEntries(buildMinimalParams(false).entries()) },
        ];

        let lastError: any = null;
        for (const attempt of attempts) {
          console.log(`[financeiro] tentativa: ${attempt.label}`);
          const current = await fetchJSON(attempt.url, headers, attempt.method, attempt.body);
          if (!isFinanceError(current)) {
            result = current;
            break;
          }
          lastError = current;
        }

        if (!result) {
          // Fallback: combine transferencias (dep/saque) + financeiro-resumo (apostas/premios)
          console.log('[financeiro] usando fallback: transferencias + financeiro-resumo');

          // 1) Get deposits/withdrawals from transferencias
          const txParams = new URLSearchParams();
          txParams.set('draw', '1');
          txParams.set('start', '0');
          txParams.set('length', '1');
          txParams.set('exportar', '0');
          const txCols = ['id', 'tipo', 'valor', 'saldo_anterior', 'saldo_posterior', 'cpf', 'username', 'created_at', 'descricao', 'status'];
          txCols.forEach((col, i) => {
            txParams.set(`columns[${i}][data]`, col);
            txParams.set(`columns[${i}][name]`, '');
            txParams.set(`columns[${i}][searchable]`, 'true');
            txParams.set(`columns[${i}][orderable]`, 'true');
            txParams.set(`columns[${i}][search][value]`, '');
            txParams.set(`columns[${i}][search][regex]`, 'false');
          });
          txParams.set('order[0][column]', '0');
          txParams.set('order[0][dir]', 'desc');
          txParams.set('search[value]', '');
          txParams.set('search[regex]', 'false');
          if (body.busca_data_inicio) txParams.set('busca_data_inicio', body.busca_data_inicio);
          if (body.busca_data_fim) txParams.set('busca_data_fim', body.busca_data_fim);

          // 2) Get bets/prizes from financeiro-resumo/listar
          const frParams = new URLSearchParams();
          if (body.busca_data_inicio) frParams.set('busca_periodo_ini', body.busca_data_inicio);
          if (body.busca_data_fim) frParams.set('busca_periodo_fim', body.busca_data_fim);

          // Fetch financeiro-geral/listar for saldo (wallet balance)
          const fgParams = new URLSearchParams();
          if (body.busca_data_inicio) fgParams.set('busca_periodo_ini', body.busca_data_inicio);
          if (body.busca_data_fim) fgParams.set('busca_periodo_fim', body.busca_data_fim);

          const [txSummary, frData, fgData] = await Promise.all([
            fetchJSON(`${baseUrl}/transferencias/listar?${txParams.toString()}`, headers, 'GET'),
            fetchJSON(`${baseUrl}/financeiro-resumo/listar?${frParams.toString()}`, headers, 'GET'),
            fetchJSON(`${baseUrl}/financeiro-geral/listar?${fgParams.toString()}`, headers, 'GET'),
          ]);

          console.log('[financeiro] transferencias:', JSON.stringify(txSummary).slice(0, 500));
          console.log('[financeiro] financeiro-resumo:', JSON.stringify(frData).slice(0, 500));
          console.log('[financeiro] financeiro-geral:', JSON.stringify(fgData).slice(0, 1000));

          const valorDeposito = Number(txSummary?.valorDeposito || 0);
          const valorSaque = Number(txSummary?.valorSaque || 0);
          // API returns qtdeDeposito/qtdeSaque (with 'e')
          const qtdDeposito = Number(txSummary?.qtdeDeposito || txSummary?.qtdDeposito || 0);
          const qtdSaque = Number(txSummary?.qtdeSaque || txSummary?.qtdSaque || 0);
          // These are not available in the API
          const qtdDepositantes = Number(txSummary?.qtdDepositantes || txSummary?.depositantes || 0);
          const qtdSacantes = Number(txSummary?.qtdSacantes || txSummary?.sacantes || 0);

          // Sum total_compra (bets) and total_premio (prizes) per product
          const kenoRows = frData?.keno || [];
          const cassinoRows = frData?.cassino || [];

          const sumRows = (rows: any[]) => {
            let compra = 0, premio = 0, bonusCompra = 0, bonusPremio = 0;
            for (const row of rows) {
              compra += Number(row?.total_compra || 0);
              premio += Number(row?.total_premio || 0);
              bonusCompra += Number(row?.total_compra_bonus || row?.bonus_compra || 0);
              bonusPremio += Number(row?.total_premio_bonus || row?.bonus_premio || 0);
            }
            const ggr = compra - premio;
            const bonusGgr = bonusCompra - bonusPremio;
            return { apostas: compra, premios: premio, turnover: compra, ggr, bonusTurnover: bonusCompra, bonusGgr, margin: compra > 0 ? ((ggr / compra) * 100) : 0 };
          };

          const totalKeno = frData?.totalKeno?.[0] || {};
          const totalCassino = frData?.totalCassino?.[0] || {};

          const buildFromTotal = (t: any) => {
            const apostas = Number(t?.total_compra || 0);
            const premios = Number(t?.total_premio || 0);
            const bonusTurnover = Number(t?.total_compra_bonus || t?.bonus_compra || 0);
            const bonusGgr = bonusTurnover - Number(t?.total_premio_bonus || t?.bonus_premio || 0);
            const ggr = apostas - premios;
            return { apostas, premios, turnover: apostas, ggr, bonusTurnover, bonusGgr, margin: apostas > 0 ? ((ggr / apostas) * 100) : 0 };
          };

          const kenoTotals = kenoRows.length > 0 ? sumRows(kenoRows) : buildFromTotal(totalKeno);
          const cassinoTotals = cassinoRows.length > 0 ? sumRows(cassinoRows) : buildFromTotal(totalCassino);

          const totalApostas = kenoTotals.apostas + cassinoTotals.apostas;
          const totalPremios = kenoTotals.premios + cassinoTotals.premios;
          const totalGGR = totalApostas - totalPremios;
          const totalBonusTurnover = kenoTotals.bonusTurnover + cassinoTotals.bonusTurnover;
          const totalBonusGgr = kenoTotals.bonusGgr + cassinoTotals.bonusGgr;

          // FTD data
          const ftdValor = Number(txSummary?.valorPrimeiroDeposito || txSummary?.ftdValor || 0);
          const ftdQtd = Number(txSummary?.qtdePrimeiroDeposito || txSummary?.ftdQtd || 0);

          const totalTransactions = Number(txSummary?.iTotalDisplayRecords || txSummary?.iTotalRecords || 0);

          // Extract totais - contains aggregated financial summary
          const totaisArr = frData?.totais || [];
          const totais = Array.isArray(totaisArr) ? totaisArr[0] : totaisArr;
          const totalNewUsersArr = frData?.totalNewUsers || [];
          const totalNewUsersObj = Array.isArray(totalNewUsersArr) ? totalNewUsersArr[0] : totalNewUsersArr;

          // Users data from totalNewUsers
          const newUsers = Number(totalNewUsersObj?.new_users || totalNewUsersObj?.novos || 0);

          // Totais fields: total_deposito, total_bonus, total_saque, total_compra, total_compra_bonus,
          // total_premio, total_compra_premio, bonus_x_deposito, rtp, liquido, margem
          const totaisData = totais ? {
            totalDeposito: Number(totais.total_deposito || 0),
            totalBonus: Number(totais.total_bonus || 0),
            totalSaque: Number(totais.total_saque || 0),
            totalCompra: Number(totais.total_compra || 0),
            totalCompraBonusVal: Number(totais.total_compra_bonus || 0),
            totalPremio: Number(totais.total_premio || 0),
            totalCompraPremio: Number(totais.total_compra_premio || 0),
            bonusXDeposito: Number(totais.bonus_x_deposito || 0),
            rtp: Number(totais.rtp || 0),
            liquido: Number(totais.liquido || 0),
            margem: Number(totais.margem || 0),
          } : null;

          // Wallet balance = liquido (net balance = deposits - withdrawals)
          // Wallet bonus = total_bonus
          const walletBonus = totaisData ? {
            valor: totaisData.totalBonus,
            bonusXDeposito: totaisData.bonusXDeposito,
          } : null;

          // Wallet balance from financeiro-geral/listar -> totais[0].saldo
          const fgTotais = fgData?.totais;
          const fgTotaisObj = Array.isArray(fgTotais) ? fgTotais[0] : fgTotais;
          const saldoCreditos = fgTotaisObj ? Number(fgTotaisObj.saldo || 0) : null;
          console.log('[financeiro] saldo from financeiro-geral:', saldoCreditos, 'fgTotais:', JSON.stringify(fgTotaisObj).slice(0, 500));

          const walletBalance = saldoCreditos !== null ? {
            liquido: saldoCreditos,
            rtp: totaisData?.rtp || 0,
            margem: totaisData?.margem || 0,
          } : (totaisData ? {
            liquido: totaisData.liquido,
            rtp: totaisData.rtp,
            margem: totaisData.margem,
          } : null);

          result = {
            depositos: valorDeposito,
            saques: valorSaque,
            qtdDeposito, qtdSaque, qtdDepositantes, qtdSacantes,
            totalTransactions,
            keno: kenoTotals,
            cassino: cassinoTotals,
            total: { apostas: totalApostas, premios: totalPremios, turnover: totalApostas, ggr: totalGGR, bonusTurnover: totalBonusTurnover, bonusGgr: totalBonusGgr, margin: totalApostas > 0 ? ((totalGGR / totalApostas) * 100) : 0 },
            ftd: { valor: ftdValor, qtd: ftdQtd },
            newUsers,
            walletBonus,
            walletBalance,
            adjustments: null,
            fonte: 'combined_fallback',
          };
        }
        break;
      }

      case 'credit_batch': {
        if (!body.batch_id) { result = { error: 'batch_id obrigatório' }; break; }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: items, error: itemsErr } = await supabase
          .from('batch_items').select('*')
          .eq('batch_id', body.batch_id)
          .in('status', ['PENDENTE', 'SEM_BONUS']);

        if (itemsErr || !items) { result = { error: itemsErr?.message || 'Erro ao buscar itens' }; break; }

        const { data: batch } = await supabase
          .from('batches').select('bonus_valor')
          .eq('id', body.batch_id).single();

        const bonusValor = batch?.bonus_valor || body.bonus_amount || 0;
        let credited = 0, errors = 0;

        for (const item of items) {
          try {
            // Resolve UUID from CPF if missing
            let itemUuid = item.uuid || '';
            if (!itemUuid && item.cpf) {
              const searchParams = new URLSearchParams({ draw: '1', start: '0', length: '1', busca_cpf: item.cpf });
              const userCols = ['username','celular','cpf','created_at','ultimo_login','situacao','uuid'];
              userCols.forEach((col, i) => {
                searchParams.set(`columns[${i}][data]`, col);
                searchParams.set(`columns[${i}][name]`, '');
                searchParams.set(`columns[${i}][searchable]`, 'true');
                searchParams.set(`columns[${i}][orderable]`, 'true');
                searchParams.set(`columns[${i}][search][value]`, '');
                searchParams.set(`columns[${i}][search][regex]`, 'false');
              });
              searchParams.set('order[0][column]', '0');
              searchParams.set('order[0][dir]', 'asc');
              searchParams.set('search[value]', '');
              searchParams.set('search[regex]', 'false');
              const searchResult = await fetchJSON(`${baseUrl}/usuarios/listar?${searchParams}`, headers);
              const found = searchResult?.aaData?.[0];
              if (found?.uuid) {
                itemUuid = found.uuid;
                // Save resolved UUID to batch_item
                await supabase.from('batch_items').update({ uuid: itemUuid }).eq('id', item.id);
              }
            }

            if (!itemUuid) {
              await supabase.from('batch_items').update({
                status: 'ERRO', tentativas: item.tentativas + 1,
                log: ['UUID não encontrado para CPF: ' + item.cpf]
              }).eq('id', item.id);
              errors++;
              continue;
            }

            const creditBody: Record<string, string> = {
              uuid: itemUuid,
              carteira: 'BONUS',
              valor: String(bonusValor),
              senha: body.password,
            };
            const creditResult = await fetchJSON(`${baseUrl}/usuarios/creditos`, headers, 'POST', creditBody);

            if (creditResult.status === true || creditResult.msg?.includes('sucesso')) {
              await supabase.from('batch_items').update({
                status: 'BONUS_1X', qtd_bonus: 1,
                log: [JSON.stringify(creditResult).slice(0, 200)]
              }).eq('id', item.id);
              credited++;
            } else {
              await supabase.from('batch_items').update({
                status: 'ERRO', tentativas: item.tentativas + 1,
                log: [JSON.stringify(creditResult).slice(0, 200)]
              }).eq('id', item.id);
              errors++;
            }
          } catch (e) {
            await supabase.from('batch_items').update({
              status: 'ERRO', tentativas: item.tentativas + 1,
              log: [(e as Error).message]
            }).eq('id', item.id);
            errors++;
          }
        }

        // Update batch stats
        const { data: updatedItems } = await supabase
          .from('batch_items').select('status').eq('batch_id', body.batch_id);

        const newStats = { pendente: 0, processando: 0, sem_bonus: 0, bonus_1x: 0, bonus_2x_plus: 0, erro: 0 };
        for (const i of updatedItems || []) {
          if (i.status === 'PENDENTE') newStats.pendente++;
          else if (i.status === 'SEM_BONUS') newStats.sem_bonus++;
          else if (i.status === 'BONUS_1X') newStats.bonus_1x++;
          else if (i.status === 'BONUS_2X+') newStats.bonus_2x_plus++;
          else if (i.status === 'ERRO') newStats.erro++;
        }

        const processed = (updatedItems || []).filter(i => i.status !== 'PENDENTE').length;
        await supabase.from('batches').update({
          stats: newStats, processed,
          status: newStats.pendente === 0 ? 'CONCLUIDO' : 'EM_ANDAMENTO'
        }).eq('id', body.batch_id);

        result = { credited, errors, total: items.length };
        break;
      }
      case 'cancel_bonus': {
        result = { status: false, msg: 'A plataforma não suporta cancelamento de bônus. Use o painel original para esta operação.' };
        break;
      }
      case 'scrape_page': {
        const path = (body as any).path || '/dashboard';
        const pageRes = await fetch(`${baseUrl}${path}`, {
          method: 'GET',
          headers: { ...headers, Accept: 'text/html,application/xhtml+xml,*/*' },
          signal: AbortSignal.timeout(12000),
        });
        const html = await pageRes.text();
        const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim().length > 10);
        const ajaxUrls = [...html.matchAll(/(?:url|href|src|action)\s*[:=]\s*['"`]([^'"`\s]+)['"`]/gi)].map(m => m[1]);
        const dataTableUrls = [...html.matchAll(/ajax\s*:\s*['"`]([^'"`]+)['"`]/gi)].map(m => m[1]);
        // Extract wallet/saldo/carteira related content
        const walletMatches = [...html.matchAll(/(wallet|saldo|carteira|balance|credito)[^<]{0,200}/gi)].map(m => m[0].slice(0, 200));
        result = {
          status: pageRes.status,
          html_length: html.length,
          is_login: html.toLowerCase().includes('<h1>login'),
          title: html.match(/<title>(.*?)<\/title>/i)?.[1] || '',
          ajax_urls: [...new Set([...ajaxUrls, ...dataTableUrls])],
          scripts_count: scripts.length,
          scripts_preview: scripts.map(s => s.slice(0, 2000)),
          menu_links: [...html.matchAll(/href=['"]([^'"]+)['"]/gi)].map(m => m[1]).filter(h => h.startsWith('/')),
          wallet_matches: walletMatches,
        };
        break;
      }
    }


    return new Response(
      JSON.stringify({ success: true, action: body.action, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
