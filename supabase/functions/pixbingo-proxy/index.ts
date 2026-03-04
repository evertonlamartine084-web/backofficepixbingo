const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Action = 'login' | 'list_users' | 'search_player' | 'player_transactions'
  | 'credit_bonus' | 'list_transactions' | 'financeiro' | 'credit_batch';

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
        // Search in users list by CPF
        const params = new URLSearchParams({
          draw: '1', start: '0', length: '10',
          busca_cpf: query,
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
        const params = new URLSearchParams();
        params.set('draw', String(body.draw || 1));
        params.set('start', String(body.start || 0));
        params.set('length', String(body.length || 50));
        const finCols = ['data','depositos','saques','bonus','ggr','comissao','lucro'];
        finCols.forEach((col, i) => {
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
        if (body.busca_data_inicio) params.set('busca_periodo_ini', body.busca_data_inicio);
        if (body.busca_data_fim) params.set('busca_periodo_fim', body.busca_data_fim);
        if (body.busca_agrupamento) params.set('busca_agrupamento', body.busca_agrupamento);
        result = await fetchJSON(`${baseUrl}/financeiro/listar?${params}`, headers);
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
            const creditResult = await fetchJSON(`${baseUrl}/usuarios/creditos`, headers, 'POST', {
              uuid: item.uuid || '', valor: String(bonusValor),
            });

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
