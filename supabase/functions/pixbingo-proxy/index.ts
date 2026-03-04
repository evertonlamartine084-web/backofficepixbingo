const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Action = 'login' | 'search_player' | 'player_balance' | 'player_transactions' 
  | 'bonus_history' | 'credit_bonus' | 'cancel_bonus' | 'dashboard' | 'reports'
  | 'list_users' | 'list_transactions' | 'site_status' | 'site_config' | 'credit_batch';

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
  bonus_id?: string;
  batch_id?: string;
  page?: number;
  limit?: number;
  search?: string;
}

async function doLogin(body: ProxyRequest): Promise<{ cookies: string; token: string; success: boolean }> {
  const baseUrl = body.site_url.replace(/\/+$/, '');
  const loginUrl = body.login_url || `${baseUrl}/login`;
  
  // Step 1: GET the site to obtain session cookies
  let initialCookies = '';
  try {
    console.log(`[doLogin] Step 1: GET ${baseUrl}`);
    const initRes = await fetch(baseUrl, {
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    const initSetCookies = initRes.headers.getSetCookie?.() || [];
    initialCookies = initSetCookies.map((c: string) => c.split(';')[0]).join('; ');
    console.log(`[doLogin] Step 1 done: cookies=${initialCookies.length > 0 ? 'yes' : 'no'}`);
  } catch (e) {
    console.log(`[doLogin] Step 1 failed: ${(e as Error).message}`);
  }

  // Step 2: POST login - fields are "usuario" and "senha" (form-encoded)
  const loginPayloads = [
    // Primary: form-encoded with usuario/senha
    { body: new URLSearchParams({ usuario: body.username, senha: body.password }).toString(), ct: 'application/x-www-form-urlencoded' },
    // Fallback: JSON with usuario/senha
    { body: JSON.stringify({ usuario: body.username, senha: body.password }), ct: 'application/json' },
    // Fallback: JSON with username/password
    { body: JSON.stringify({ username: body.username, password: body.password }), ct: 'application/json' },
  ];

  for (const { body: payloadBody, ct } of loginPayloads) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': ct,
        'Accept': 'text/html,application/json,*/*',
        'Referer': `${baseUrl}/`,
        'Origin': baseUrl,
      };
      if (initialCookies) headers['Cookie'] = initialCookies;

      console.log(`[doLogin] POST ${loginUrl} [${ct}]`);
      const res = await fetch(loginUrl, {
        method: 'POST',
        headers,
        body: payloadBody,
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
      
      const text = await res.text();
      console.log(`[doLogin] Body (200): ${text.slice(0, 300)}`);

      // Success indicators: redirect (302/301) or JSON with success/logged/token
      if (res.status === 302 || res.status === 301) {
        const location = res.headers.get('location') || '';
        console.log(`[doLogin] Redirect to: ${location}`);
        // Redirect to non-login page means success
        if (!location.includes('/login') && !location.includes('error')) {
          return { cookies, token: '', success: true };
        }
      }

      if (res.ok) {
        try {
          const data = JSON.parse(text);
          const token = data.token || data.access_token || data.data?.token || data.jwt || '';
          if (data.logged === true || data.success === true || data.status === true || token) {
            return { cookies, token, success: true };
          }
        } catch {}
        
        // If we got cookies and it's not a JSON error, test session
        if (cookies && !text.includes('"logged":false') && !text.includes('"status":false')) {
          // HTML redirect or dashboard page = success
          if (text.includes('dashboard') || text.includes('Dashboard') || text.includes('logout')) {
            return { cookies, token: '', success: true };
          }
        }
      }

      // Test session validity by hitting a protected page
      if (cookies) {
        try {
          const testHeaders: Record<string, string> = { 'Accept': 'application/json', 'Cookie': cookies };
          const xsrf = cookies.match(/XSRF-TOKEN=([^;]+)/);
          if (xsrf) testHeaders['X-XSRF-TOKEN'] = decodeURIComponent(xsrf[1]);
          
          const testRes = await fetch(`${baseUrl}/api/dashboard`, {
            headers: testHeaders,
            signal: AbortSignal.timeout(5000),
          });
          const testText = await testRes.text();
          console.log(`[doLogin] Session test: status=${testRes.status}, body=${testText.slice(0, 200)}`);
          
          if (testRes.ok && !testText.includes('"logged":false')) {
            try {
              JSON.parse(testText); // valid JSON = we're in
              return { cookies, token: '', success: true };
            } catch {}
          }
        } catch {}
      }
    } catch (e) {
      console.log(`[doLogin] Failed: ${(e as Error).message}`);
    }
  }

  return { cookies: '', token: '', success: false };
}

function buildHeaders(cookies: string, token: string, baseUrl: string): Record<string, string> {
  const h: Record<string, string> = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (cookies) {
    h['Cookie'] = cookies;
    const xsrfMatch = cookies.match(/XSRF-TOKEN=([^;]+)/);
    if (xsrfMatch) h['X-XSRF-TOKEN'] = decodeURIComponent(xsrfMatch[1]);
  }
  if (baseUrl) h['Referer'] = baseUrl;
  return h;
}

async function tryFetch(url: string, headers: Record<string, string>, method = 'GET', body?: any): Promise<any> {
  const opts: RequestInit = { method, headers, signal: AbortSignal.timeout(15000) };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  
  console.log(`[tryFetch] ${method} ${url}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`[tryFetch] Status: ${res.status}, Body: ${text.slice(0, 300)}`);
  
  if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) {
    return { _raw: text.slice(0, 200), _status: res.status, _isHtml: true };
  }
  
  try {
    const data = JSON.parse(text);
    if (data.logged === false && Object.keys(data).length <= 2) {
      return { _notLogged: true, _raw: text.slice(0, 500) };
    }
    data._httpStatus = res.status;
    return data;
  } catch {
    return { _raw: text.slice(0, 500), _status: res.status };
  }
}

async function tryMultiple(baseUrl: string, paths: string[], headers: Record<string, string>, method = 'GET', body?: any) {
  for (const path of paths) {
    try {
      const data = await tryFetch(`${baseUrl}${path}`, headers, method, body);
      if (!data._notLogged && !data._raw && !data._isHtml) {
        const clean = { ...data };
        delete clean._httpStatus;
        return { data: clean, path };
      }
    } catch (e) {
      console.log(`[tryMultiple] ${path} error: ${(e as Error).message}`);
    }
  }
  return null;
}

// --- Action handlers ---

async function handleSearchPlayer(baseUrl: string, headers: Record<string, string>, body: ProxyRequest) {
  const query = body.cpf || body.uuid || '';
  const paths = [
    `/api/usuarios/buscar?cpf=${query}`,
    `/api/usuarios/buscar?q=${query}`,
    `/api/usuarios/buscar?documento=${query}`,
    `/api/usuarios?cpf=${query}`,
    `/api/usuarios?search=${query}`,
  ];
  const found = await tryMultiple(baseUrl, paths, headers);
  if (found) return found.data;
  
  for (const path of ['/api/usuarios/buscar', '/api/usuarios']) {
    try {
      const data = await tryFetch(`${baseUrl}${path}`, headers, 'POST', { cpf: query, documento: query, search: query, q: query });
      if (!data._notLogged && !data._raw) return data;
    } catch {}
  }
  return null;
}

async function handleCreditBatch(baseUrl: string, headers: Record<string, string>, body: ProxyRequest) {
  if (!body.batch_id) return { error: 'batch_id obrigatório' };
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: items, error: itemsErr } = await supabase
    .from('batch_items')
    .select('*')
    .eq('batch_id', body.batch_id)
    .in('status', ['PENDENTE', 'SEM_BONUS']);

  if (itemsErr || !items) return { error: itemsErr?.message || 'Erro ao buscar itens' };

  const { data: batch } = await supabase
    .from('batches')
    .select('bonus_valor')
    .eq('id', body.batch_id)
    .single();

  const bonusValor = batch?.bonus_valor || body.bonus_amount || 0;
  let credited = 0, errors = 0;

  for (const item of items) {
    try {
      let creditResult: any = null;
      for (const path of ['/api/bonus/creditar', '/bonus/creditar']) {
        try {
          const data = await tryFetch(`${baseUrl}${path}`, headers, 'POST', {
            uuid: item.uuid, cpf: item.cpf, valor: bonusValor, amount: bonusValor
          });
          if (!data._notLogged) { creditResult = data; break; }
        } catch {}
      }

      if (creditResult && !creditResult.error && !creditResult._raw) {
        await supabase.from('batch_items').update({ 
          status: 'BONUS_1X', qtd_bonus: 1, 
          log: [JSON.stringify(creditResult).slice(0, 200)] 
        }).eq('id', item.id);
        credited++;
      } else {
        await supabase.from('batch_items').update({ 
          status: 'ERRO', tentativas: item.tentativas + 1,
          log: [JSON.stringify(creditResult || 'Sem resposta').slice(0, 200)] 
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

  return { credited, errors, total: items.length };
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
    const headers = buildHeaders(auth.cookies, auth.token, baseUrl);

    let result: any = null;

    switch (body.action) {
      case 'login':
        result = { logged: true, has_cookies: !!auth.cookies, has_token: !!auth.token };
        break;

      case 'search_player':
        result = await handleSearchPlayer(baseUrl, headers, body);
        break;

      case 'player_balance': {
        const id = body.player_id || body.uuid || body.cpf || '';
        const found = await tryMultiple(baseUrl, [
          `/api/usuarios/saldo?uuid=${id}`, `/api/usuarios/saldo?cpf=${id}`,
          `/api/saldo?uuid=${id}`, `/api/usuarios/${id}/saldo`,
        ], headers);
        result = found?.data || null;
        break;
      }

      case 'player_transactions': {
        const id = body.player_id || body.uuid || body.cpf || '';
        const found = await tryMultiple(baseUrl, [
          `/api/usuarios/transacoes?uuid=${id}`, `/api/usuarios/transacoes?cpf=${id}`,
          `/api/transacoes?uuid=${id}`, `/api/usuarios/${id}/transacoes`,
        ], headers);
        result = found?.data || null;
        break;
      }

      case 'bonus_history': {
        const id = body.player_id || body.uuid || body.cpf || '';
        const found = await tryMultiple(baseUrl, [
          `/api/bonus/historico?uuid=${id}`, `/api/bonus/historico?cpf=${id}`,
          `/api/bonus?uuid=${id}`, `/api/usuarios/${id}/bonus`,
        ], headers);
        result = found?.data || null;
        break;
      }

      case 'credit_bonus': {
        const id = body.player_id || body.uuid || body.cpf || '';
        const amount = body.bonus_amount || 0;
        for (const path of ['/api/bonus/creditar', '/bonus/creditar']) {
          try {
            const data = await tryFetch(`${baseUrl}${path}`, headers, 'POST', {
              uuid: body.uuid, cpf: body.cpf, valor: amount, amount, player_id: id
            });
            if (!data._notLogged) { result = data; break; }
          } catch {}
        }
        break;
      }

      case 'cancel_bonus': {
        const id = body.player_id || body.uuid || body.cpf || '';
        for (const path of ['/api/bonus/cancelar', '/bonus/cancelar']) {
          try {
            const data = await tryFetch(`${baseUrl}${path}`, headers, 'POST', {
              uuid: body.uuid, cpf: body.cpf, player_id: id, bonus_id: body.bonus_id
            });
            if (!data._notLogged) { result = data; break; }
          } catch {}
        }
        break;
      }

      case 'list_users': {
        const search = body.search || '';
        const page = body.page || 1;
        const limit = body.limit || 50;
        const found = await tryMultiple(baseUrl, [
          `/api/usuarios?page=${page}&limit=${limit}${search ? `&search=${search}` : ''}`,
          `/api/usuarios?pagina=${page}&limite=${limit}${search ? `&busca=${search}` : ''}`,
        ], headers);
        result = found?.data || null;
        break;
      }

      case 'list_transactions': {
        const page = body.page || 1;
        const limit = body.limit || 50;
        const search = body.search || '';
        const found = await tryMultiple(baseUrl, [
          `/api/transacoes?page=${page}&limit=${limit}${search ? `&search=${search}` : ''}`,
          `/api/transacoes?pagina=${page}&limite=${limit}${search ? `&busca=${search}` : ''}`,
        ], headers);
        result = found?.data || null;
        break;
      }

      case 'dashboard': {
        const found = await tryMultiple(baseUrl, ['/api/dashboard', '/api/status', '/api/relatorios'], headers);
        result = found?.data || null;
        break;
      }

      case 'reports': {
        const found = await tryMultiple(baseUrl, ['/api/relatorios', '/api/dashboard', '/api/bonus'], headers);
        result = found?.data || null;
        break;
      }

      case 'site_status': {
        const found = await tryMultiple(baseUrl, ['/api/status', '/api/health'], headers);
        result = found?.data || null;
        break;
      }

      case 'site_config': {
        const found = await tryMultiple(baseUrl, ['/api/config'], headers);
        result = found?.data || null;
        break;
      }

      case 'credit_batch':
        result = await handleCreditBatch(baseUrl, headers, body);
        break;
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
