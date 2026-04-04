import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse, verifyAuth } from './_cors.js';
import { platformLogin, buildPlatformHeaders, fetchJSON, buildDataTableParams, USER_COLUMNS, TX_COLUMNS } from './_platform.js';

export const config = { runtime: 'edge', maxDuration: 60 };

type Action = 'login' | 'list_users' | 'search_player' | 'player_transactions'
  | 'credit_bonus' | 'cancel_bonus' | 'list_transactions' | 'financeiro' | 'credit_batch' | 'list_partidas' | 'scrape_page';

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
  carteira?: string;
  path?: string;
}

interface FinanceRow {
  total_compra?: number;
  total_premio?: number;
  total_compra_bonus?: number;
  bonus_compra?: number;
  total_premio_bonus?: number;
  bonus_premio?: number;
}

interface FinanceTotals extends FinanceRow {
  total_deposito?: number;
  total_bonus?: number;
  total_saque?: number;
  total_compra_premio?: number;
  bonus_x_deposito?: number;
  rtp?: number;
  liquido?: number;
  margem?: number;
  saldo?: number;
  credito?: number;
  bonus?: number;
  saldo_bonus?: number;
  qtdDepositantes?: number;
  depositantes?: number;
  qtdSacantes?: number;
  sacantes?: number;
}

interface FinanceResponse {
  _raw?: string;
  _status?: number;
  code?: number;
  Msg?: string;
  totais?: FinanceTotals[] | FinanceTotals;
  totalKeno?: FinanceRow[];
  totalCassino?: FinanceRow[];
  keno?: FinanceRow[];
  cassino?: FinanceRow[];
  totalNewUsers?: Array<{ new_users?: number; novos?: number }> | { new_users?: number; novos?: number };
}

interface TransactionSummary {
  _raw?: string;
  _status?: number;
  valorDeposito?: number;
  valorSaque?: number;
  qtdeDeposito?: number;
  qtdDeposito?: number;
  qtdeSaque?: number;
  qtdSaque?: number;
  qtdDepositantes?: number;
  depositantes?: number;
  qtdeDepositantes?: number;
  qtdSacantes?: number;
  sacantes?: number;
  qtdeSacantes?: number;
  valorPrimeiroDeposito?: number;
  ftdValor?: number;
  qtdePrimeiroDeposito?: number;
  ftdQtd?: number;
  iTotalDisplayRecords?: number;
  iTotalRecords?: number;
}

// doLogin, buildHeaders, fetchJSON are now imported from ./_platform.js

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);

  const corsHeaders = getCorsHeaders(req);

  // Verify JWT authentication
  const authResult = await verifyAuth(req);
  if (!authResult) {
    return new Response(JSON.stringify({ success: false, error: 'Não autorizado — token ausente ou inválido' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const body: ProxyRequest = await req.json();

    // Auto-fill credentials from platform_config if not provided or placeholder
    const isAuto = !body.username || !body.password || body.username === 'auto' || body.password === 'auto';
    if (isAuto) {
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
      if (supabaseUrl && supabaseKey) {
        const sb = createClient(supabaseUrl, supabaseKey);
        const { data: config, error: cfgErr } = await sb.from('platform_config')
          .select('*').eq('active', true).order('created_at', { ascending: false }).limit(1).single();
        if (config) {
          body.username = config.username;
          body.password = config.password;
          body.site_url = config.site_url || body.site_url || 'https://pixbingobr.concurso.club';
          body.login_url = config.login_url || body.login_url;
        }
        if (cfgErr && !config) {
          return new Response(JSON.stringify({ success: false, error: 'Erro ao carregar configuração da plataforma' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else {
        return new Response(JSON.stringify({ success: false, error: 'Configuração do servidor incompleta' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (!body.site_url) body.site_url = 'https://pixbingobr.concurso.club';

    // SSRF protection: only allow whitelisted site URLs
    const ALLOWED_SITE_URLS = [
      'https://pixbingobr.concurso.club',
      'https://pixbingobr.com',
      'https://www.pixbingobr.com',
    ];
    const normalizedUrl = body.site_url.replace(/\/+$/, '');
    if (!ALLOWED_SITE_URLS.some(u => normalizedUrl === u || normalizedUrl.startsWith(u + '/'))) {
      return new Response(JSON.stringify({ success: false, error: 'URL não permitida' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Use login domain as base for API calls (same domain where session cookie is valid)
    const loginDomain = body.login_url ? body.login_url.replace(/\/+$/, '').replace(/\/login$/, '') : null;
    const baseUrl = loginDomain || normalizedUrl;

    const auth = await platformLogin(normalizedUrl, body.username, body.password, body.login_url);
    if (!auth.success) {
      return new Response(JSON.stringify({ success: false, error: 'Login falhou. Verifique credenciais e URL.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const headers = buildPlatformHeaders(auth.cookies, baseUrl);

    let result: Record<string, unknown> | null = null;

    switch (body.action) {
      case 'login':
        result = { logged: true };
        break;

      case 'list_users': {
        const extra: Record<string, string> = {};
        if (body.busca_username) extra.busca_username = body.busca_username;
        if (body.busca_cpf) extra.busca_cpf = body.busca_cpf;
        if (body.busca_celular) extra.busca_celular = body.busca_celular;
        if (body.busca_data_inicio) extra.busca_data_inicio = body.busca_data_inicio;
        if (body.busca_data_fim) extra.busca_data_fim = body.busca_data_fim;
        if (body.search && !body.busca_cpf && !body.busca_username) {
          extra.busca_cpf = body.search;
        }
        const params = buildDataTableParams({
          columns: USER_COLUMNS,
          draw: body.draw || 1,
          start: body.start || 0,
          length: body.length || 50,
          extraParams: extra,
        });
        result = await fetchJSON(`${baseUrl}/usuarios/listar?${params}`, headers);
        break;
      }

      case 'search_player': {
        const query = body.cpf || body.uuid || '';
        const extra: Record<string, string> = query.includes('-')
          ? { busca_uuid: query }
          : { busca_cpf: query };
        const params = buildDataTableParams({
          columns: USER_COLUMNS,
          length: 10,
          extraParams: extra,
        });
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
        const creditBody: Record<string, string> = {
          uuid: id,
          carteira: body.carteira || 'BONUS',
          valor: String(amount),
          senha: body.password,
        };
        result = await fetchJSON(`${baseUrl}/usuarios/creditos`, headers, 'POST', creditBody);
        break;
      }

      case 'list_transactions': {
        const extra: Record<string, string> = { exportar: '0' };
        if (body.busca_data_inicio) extra.busca_data_inicio = body.busca_data_inicio;
        if (body.busca_data_fim) extra.busca_data_fim = body.busca_data_fim;
        if (body.busca_tipo_transacao) extra.busca_tipo_transacao = body.busca_tipo_transacao;
        if (body.busca_email) extra.busca_email = body.busca_email;
        if (body.busca_cpf) extra.busca_cpf = body.busca_cpf;
        if (body.busca_agrupamento) extra.busca_agrupamento = body.busca_agrupamento || '';
        if (body.search && !body.busca_cpf) {
          extra.busca_cpf = body.search;
        }
        const params = buildDataTableParams({
          columns: TX_COLUMNS,
          draw: body.draw || 1,
          start: body.start || 0,
          length: body.length || 50,
          orderDir: 'desc',
          extraParams: extra,
        });
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

        const isFinanceError = (r: Record<string, unknown>) => {
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

        const sumRows = (rows: FinanceRow[]) => {
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

        const buildFromTotal = (t: FinanceRow) => {
          const apostas = Number(t?.total_compra || 0);
          const premios = Number(t?.total_premio || 0);
          const bonusTurnover = Number(t?.total_compra_bonus || t?.bonus_compra || 0);
          const bonusGgr = bonusTurnover - Number(t?.total_premio_bonus || t?.bonus_premio || 0);
          const ggr = apostas - premios;
          return { apostas, premios, turnover: apostas, ggr, bonusTurnover, bonusGgr, margin: apostas > 0 ? ((ggr / apostas) * 100) : 0 };
        };

        const parseFinanceResponse = (
          frData: FinanceResponse | null,
          txSummary: TransactionSummary | null,
          fgData: FinanceResponse | null,
          fonte: string
        ) => {
          const valorDeposito = Number(txSummary?.valorDeposito || 0);
          const valorSaque = Number(txSummary?.valorSaque || 0);
          const qtdDeposito = Number(txSummary?.qtdeDeposito || txSummary?.qtdDeposito || 0);
          const qtdSaque = Number(txSummary?.qtdeSaque || txSummary?.qtdSaque || 0);

          const totaisForUsers = Array.isArray(frData?.totais) ? frData.totais[0] : frData?.totais;
          const fgTotaisForUsers = Array.isArray(fgData?.totais) ? fgData.totais[0] : fgData?.totais;

          const qtdDepositantes = Number(
            txSummary?.qtdDepositantes || txSummary?.depositantes || txSummary?.qtdeDepositantes ||
            totaisForUsers?.qtdDepositantes || totaisForUsers?.depositantes ||
            fgTotaisForUsers?.qtdDepositantes || fgTotaisForUsers?.depositantes || 0
          );
          const qtdSacantes = Number(
            txSummary?.qtdSacantes || txSummary?.sacantes || txSummary?.qtdeSacantes ||
            totaisForUsers?.qtdSacantes || totaisForUsers?.sacantes ||
            fgTotaisForUsers?.qtdSacantes || fgTotaisForUsers?.sacantes || 0
          );

          const kenoRows = frData?.keno || [];
          const cassinoRows = frData?.cassino || [];
          const totalKeno: FinanceRow = frData?.totalKeno?.[0] || {};
          const totalCassino: FinanceRow = frData?.totalCassino?.[0] || {};

          const kenoTotals = kenoRows.length > 0 ? sumRows(kenoRows) : buildFromTotal(totalKeno);
          const cassinoTotals = cassinoRows.length > 0 ? sumRows(cassinoRows) : buildFromTotal(totalCassino);

          const totalApostas = kenoTotals.apostas + cassinoTotals.apostas;
          const totalPremios = kenoTotals.premios + cassinoTotals.premios;
          const totalGGR = totalApostas - totalPremios;
          const totalBonusTurnover = kenoTotals.bonusTurnover + cassinoTotals.bonusTurnover;
          const totalBonusGgr = kenoTotals.bonusGgr + cassinoTotals.bonusGgr;

          const ftdValor = Number(txSummary?.valorPrimeiroDeposito || txSummary?.ftdValor || 0);
          const ftdQtd = Number(txSummary?.qtdePrimeiroDeposito || txSummary?.ftdQtd || 0);
          const totalTransactions = Number(txSummary?.iTotalDisplayRecords || txSummary?.iTotalRecords || 0);

          const totaisArr = frData?.totais || [];
          const totais = Array.isArray(totaisArr) ? totaisArr[0] : totaisArr;
          const totalNewUsersArr = frData?.totalNewUsers || [];
          const totalNewUsersObj = Array.isArray(totalNewUsersArr) ? totalNewUsersArr[0] : totalNewUsersArr;
          const newUsers = Number(totalNewUsersObj?.new_users || totalNewUsersObj?.novos || 0);

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

          const fgTotais = fgData?.totais;
          const fgTotaisObj = Array.isArray(fgTotais) ? fgTotais[0] : fgTotais;
          const fgSaldo = fgTotaisObj ? Number(fgTotaisObj.saldo || fgTotaisObj.credito || 0) : null;
          const fgBonus = fgTotaisObj ? Number(fgTotaisObj.bonus || fgTotaisObj.saldo_bonus || 0) : null;

          const walletBonus = fgBonus !== null ? {
            valor: fgBonus, bonusXDeposito: totaisData?.bonusXDeposito || 0,
          } : (totaisData ? { valor: totaisData.totalBonus, bonusXDeposito: totaisData.bonusXDeposito } : null);

          const walletBalance = fgSaldo !== null ? {
            liquido: fgSaldo, rtp: totaisData?.rtp || 0, margem: totaisData?.margem || 0,
          } : (totaisData ? { liquido: totaisData.liquido, rtp: totaisData.rtp, margem: totaisData.margem } : null);

          return {
            depositos: valorDeposito, saques: valorSaque,
            qtdDeposito, qtdSaque, qtdDepositantes, qtdSacantes, totalTransactions,
            keno: kenoTotals, cassino: cassinoTotals,
            total: { apostas: totalApostas, premios: totalPremios, turnover: totalApostas, ggr: totalGGR, bonusTurnover: totalBonusTurnover, bonusGgr: totalBonusGgr, margin: totalApostas > 0 ? ((totalGGR / totalApostas) * 100) : 0 },
            ftd: { valor: ftdValor, qtd: ftdQtd },
            newUsers, walletBonus, walletBalance, adjustments: null,
            fonte,
          };
        };

        let primaryData: FinanceResponse | null = null;
        let lastError: Record<string, unknown> | null = null;
        for (const attempt of attempts) {
          const current = await fetchJSON(attempt.url, headers, attempt.method, attempt.body);
          if (!isFinanceError(current)) {
            primaryData = current as unknown as FinanceResponse;
            break;
          }
          lastError = current;
        }

        if (primaryData) {
          const txExtra: Record<string, string> = { exportar: '0' };
          if (body.busca_data_inicio) txExtra.busca_data_inicio = body.busca_data_inicio;
          if (body.busca_data_fim) txExtra.busca_data_fim = body.busca_data_fim;
          const txParams = buildDataTableParams({
            columns: TX_COLUMNS, length: 1, orderDir: 'desc', extraParams: txExtra,
          });

          const txSummaryRaw = await fetchJSON(`${baseUrl}/transferencias/listar?${txParams.toString()}`, headers, 'GET');
          const txSummary = txSummaryRaw as unknown as TransactionSummary;

          result = parseFinanceResponse(primaryData, txSummary, null, 'financeiro_listar');
        }

        if (!result) {
          const txExtra: Record<string, string> = { exportar: '0' };
          if (body.busca_data_inicio) txExtra.busca_data_inicio = body.busca_data_inicio;
          if (body.busca_data_fim) txExtra.busca_data_fim = body.busca_data_fim;
          const txParams = buildDataTableParams({
            columns: TX_COLUMNS, length: 1, orderDir: 'desc', extraParams: txExtra,
          });

          const frParams = new URLSearchParams();
          if (body.busca_data_inicio) frParams.set('busca_periodo_ini', body.busca_data_inicio);
          if (body.busca_data_fim) frParams.set('busca_periodo_fim', body.busca_data_fim);

          const fgExtra: Record<string, string> = {};
          if (body.busca_data_inicio) fgExtra.busca_data_inicio = body.busca_data_inicio;
          if (body.busca_data_fim) fgExtra.busca_data_fim = body.busca_data_fim;
          const fgDtParams = buildDataTableParams({
            columns: ['data', 'depositos', 'saques', 'bonus', 'saldo', 'ggr', 'comissao', 'lucro'],
            length: 100, orderDir: 'desc', extraParams: fgExtra,
          });

          const [txSummaryRaw, frDataRaw] = await Promise.all([
            fetchJSON(`${baseUrl}/transferencias/listar?${txParams.toString()}`, headers, 'GET'),
            fetchJSON(`${baseUrl}/financeiro-resumo/listar?${frParams.toString()}`, headers, 'GET'),
          ]);
          const txSummary = txSummaryRaw as unknown as TransactionSummary;
          const frData = frDataRaw as unknown as FinanceResponse;

          let fgData: FinanceResponse | null = null;
          const fgStrategies = [
            { label: 'GET dt+data', fn: () => fetchJSON(`${baseUrl}/financeiro-geral/listar?${fgDtParams.toString()}`, headers, 'GET') },
            { label: 'POST dt+data', fn: () => fetchJSON(`${baseUrl}/financeiro-geral/listar`, headers, 'POST', Object.fromEntries(fgDtParams)) },
            { label: 'GET no-date', fn: () => fetchJSON(`${baseUrl}/financeiro-geral/listar`, headers, 'GET') },
            { label: 'POST no-date', fn: () => fetchJSON(`${baseUrl}/financeiro-geral/listar`, headers, 'POST', {}) },
          ];
          for (const strat of fgStrategies) {
            try {
              const res = await strat.fn();
              if (res && !res._status && !res.code && !res.Msg) { fgData = res as unknown as FinanceResponse; break; }
            } catch { /* ignore */ }
          }

          result = parseFinanceResponse(frData, txSummary, fgData, fgData ? 'financeiro_geral' : 'totais_resumo');
        }
        break;
      }

      case 'credit_batch': {
        if (!body.batch_id) { result = { error: 'batch_id obrigatório' }; break; }

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
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
            let itemUuid = item.uuid || '';
            if (!itemUuid && item.cpf) {
              const searchParams = buildDataTableParams({
                columns: USER_COLUMNS,
                length: 1,
                extraParams: { busca_cpf: item.cpf },
              });
              const searchResult = await fetchJSON(`${baseUrl}/usuarios/listar?${searchParams}`, headers);
              const found = searchResult?.aaData?.[0];
              if (found?.uuid) {
                itemUuid = found.uuid;
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
              uuid: itemUuid, carteira: 'BONUS', valor: String(bonusValor), senha: body.password,
            };
            const creditResult = await fetchJSON(`${baseUrl}/usuarios/creditos`, headers, 'POST', creditBody);

            if (creditResult.status === true || (typeof creditResult.msg === 'string' && creditResult.msg.includes('sucesso'))) {
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
        const path = body.path || '/dashboard';
        const pageRes = await fetch(`${baseUrl}${path}`, {
          method: 'GET',
          headers: { ...headers, Accept: 'text/html,application/xhtml+xml,*/*' },
          signal: AbortSignal.timeout(12000),
        });
        const html = await pageRes.text();
        const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim().length > 10);
        const ajaxUrls = [...html.matchAll(/(?:url|href|src|action)\s*[:=]\s*['"`]([^'"`\s]+)['"`]/gi)].map(m => m[1]);
        const dataTableUrls = [...html.matchAll(/ajax\s*:\s*['"`]([^'"`]+)['"`]/gi)].map(m => m[1]);
        const walletMatches = [...html.matchAll(/(wallet|saldo|carteira|balance|credito)[^<]{0,200}/gi)].map(m => m[0].slice(0, 200));
        result = {
          status: pageRes.status, html_length: html.length,
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

      case 'list_partidas': {
        const params = buildDataTableParams({
          columns: ['id', 'nome', 'status', 'tipo', 'created_at'],
          length: 200,
          orderDir: 'desc',
        });

        const dtResult = await fetchJSON(`${baseUrl}/partidas/listar?${params}`, headers);
        if (dtResult?.aaData || dtResult?.data) {
          result = dtResult;
        } else {
          const pageRes = await fetch(`${baseUrl}/partidas`, {
            method: 'GET',
            headers: { ...headers, Accept: 'text/html,application/xhtml+xml,*/*' },
            signal: AbortSignal.timeout(12000),
          });
          const html = await pageRes.text();
          const nameMatches = [...html.matchAll(/<td[^>]*>([^<]+)<\/td>/gi)].map(m => m[1].trim()).filter(t => t.length > 1 && t.length < 100);
          const ajaxUrls = [...html.matchAll(/ajax\s*:\s*['"`]([^'"`]+)['"`]/gi)].map(m => m[1]);
          const selectOptions = [...html.matchAll(/<option[^>]*value=['"]([^'"]+)['"][^>]*>([^<]+)<\/option>/gi)].map(m => ({ value: m[1], label: m[2].trim() }));
          result = {
            html_length: html.length, table_cells: nameMatches.slice(0, 100),
            ajax_urls: ajaxUrls, select_options: selectOptions,
            title: html.match(/<title>(.*?)<\/title>/i)?.[1] || '',
          };
        }
        break;
      }
    }

    return new Response(
      JSON.stringify({ success: true, action: body.action, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[pixbingo-proxy]', (error as Error).message);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
