const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  username_field?: string;
  password_field?: string;
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
  
  // Step 1: GET the site first to obtain initial CSRF/XSRF cookies (Laravel pattern)
  let initialCookies = '';
  let xsrfToken = '';
  try {
    console.log(`[doLogin] Step 1: GET ${baseUrl} for CSRF cookies`);
    const initRes = await fetch(baseUrl, {
      method: 'GET',
      headers: { 'Accept': 'text/html,application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    const initSetCookies = initRes.headers.getSetCookie?.() || [];
    initialCookies = initSetCookies.map((c: string) => c.split(';')[0]).join('; ');
    
    // Extract XSRF-TOKEN
    const xsrfMatch = initialCookies.match(/XSRF-TOKEN=([^;]+)/);
    if (xsrfMatch) {
      xsrfToken = decodeURIComponent(xsrfMatch[1]);
    }
    console.log(`[doLogin] Step 1 done: cookies=${initialCookies.length > 0 ? 'yes' : 'no'}, xsrf=${xsrfToken.length > 0 ? 'yes' : 'no'}`);
  } catch (e) {
    console.log(`[doLogin] Step 1 failed: ${(e as Error).message}`);
  }
  
  // Step 2: POST login with CSRF cookies - focused approach
  const loginUrls = [
    body.login_url,
    `${baseUrl}/login`,
    `${baseUrl}/api/auth/login`,
  ].filter(Boolean) as string[];

  // Focused payloads - prioritize common Laravel patterns
  type LoginAttempt = { payload: Record<string, string>; contentType: string };
  const attempts: LoginAttempt[] = [
    // Form-encoded with _token (most common Laravel pattern)
    { payload: { email: body.username, password: body.password, _token: xsrfToken }, contentType: 'application/x-www-form-urlencoded' },
    { payload: { username: body.username, password: body.password, _token: xsrfToken }, contentType: 'application/x-www-form-urlencoded' },
    // JSON with XSRF header
    { payload: { email: body.username, password: body.password }, contentType: 'application/json' },
    { payload: { username: body.username, password: body.password }, contentType: 'application/json' },
  ];

  for (const loginUrl of loginUrls) {
    for (const { payload: loginPayload, contentType } of attempts) {
      try {
        const loginHeaders: Record<string, string> = {
          'Content-Type': contentType,
          'Accept': 'application/json',
          'Referer': `${baseUrl}/login`,
          'Origin': baseUrl,
        };
        if (initialCookies) loginHeaders['Cookie'] = initialCookies;
        if (xsrfToken) loginHeaders['X-XSRF-TOKEN'] = xsrfToken;
        
        let bodyStr: string;
        if (contentType === 'application/json') {
          bodyStr = JSON.stringify(loginPayload);
        } else {
          bodyStr = new URLSearchParams(loginPayload).toString();
        }
        
        console.log(`[doLogin] POST ${loginUrl} [${contentType.split('/')[1]}] fields: ${Object.keys(loginPayload).filter(k => k !== '_token').join(',')}`);
        const res = await fetch(loginUrl, {
          method: 'POST',
          headers: loginHeaders,
          body: bodyStr,
          redirect: 'manual',
          signal: AbortSignal.timeout(10000),
        });
        
        // Merge initial cookies with response cookies
        const setCookies = res.headers.getSetCookie?.() || [];
        const newCookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
        
        // Merge: response cookies override initial ones
        const cookieMap = new Map<string, string>();
        for (const c of initialCookies.split('; ').filter(Boolean)) {
          const [k, ...v] = c.split('=');
          cookieMap.set(k, v.join('='));
        }
        for (const c of newCookies.split('; ').filter(Boolean)) {
          const [k, ...v] = c.split('=');
          cookieMap.set(k, v.join('='));
        }
        const cookies = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
        
        console.log(`[doLogin] Step 2: Status=${res.status}, merged cookies count=${cookieMap.size}`);

        let token = '';
        const text = await res.text();
        console.log(`[doLogin] Step 2 body: ${text.slice(0, 300)}`);

        if (res.ok || res.status === 302 || res.status === 301) {
          try {
            const data = JSON.parse(text);
            token = data.token || data.access_token || data.data?.token || data.jwt || '';
            
            // Check if login was successful
            if (data.logged === true || data.success === true || token) {
              console.log(`[doLogin] Confirmed login success from response body`);
              return { cookies, token, success: true };
            }
          } catch {}
          
          // Even if body says logged:false, if we got session cookies, try using them
          if (cookies) {
            console.log(`[doLogin] Got cookies, testing if session is valid...`);
            // Quick test: try fetching a protected endpoint
            const testHeaders: Record<string, string> = {
              'Accept': 'application/json',
              'Cookie': cookies,
            };
            const testXsrf = cookies.match(/XSRF-TOKEN=([^;]+)/);
            if (testXsrf) testHeaders['X-XSRF-TOKEN'] = decodeURIComponent(testXsrf[1]);
            
            try {
              const testRes = await fetch(`${baseUrl}/api/dashboard`, {
                method: 'GET',
                headers: testHeaders,
                signal: AbortSignal.timeout(5000),
              });
              const testText = await testRes.text();
              console.log(`[doLogin] Session test: status=${testRes.status}, body=${testText.slice(0, 200)}`);
              
              try {
                const testData = JSON.parse(testText);
                if (testData.logged !== false && !testText.includes('"logged":false')) {
                  console.log(`[doLogin] Session IS valid! Dashboard returned data`);
                  return { cookies, token, success: true };
                }
              } catch {}
            } catch (e) {
              console.log(`[doLogin] Session test failed: ${(e as Error).message}`);
            }
          }
        }
      } catch (e) {
        console.log(`[doLogin] POST ${loginUrl} failed: ${(e as Error).message}`);
      }
    }
  }
  return { cookies: '', token: '', success: false };
}

function buildHeaders(cookies: string, token: string): Record<string, string> {
  const h: Record<string, string> = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (cookies) {
    h['Cookie'] = cookies;
    // Laravel XSRF: extract XSRF-TOKEN from cookies and send as X-XSRF-TOKEN header (URL-decoded)
    const xsrfMatch = cookies.match(/XSRF-TOKEN=([^;]+)/);
    if (xsrfMatch) {
      h['X-XSRF-TOKEN'] = decodeURIComponent(xsrfMatch[1]);
      console.log(`[buildHeaders] X-XSRF-TOKEN set (length: ${h['X-XSRF-TOKEN'].length})`);
    }
  }
  return h;
}

async function tryFetch(url: string, headers: Record<string, string>, method = 'GET', body?: any): Promise<any> {
  const opts: RequestInit = { method, headers, signal: AbortSignal.timeout(15000) };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  
  console.log(`[tryFetch] ${method} ${url}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`[tryFetch] Status: ${res.status}, Body (first 300): ${text.slice(0, 300)}`);
  
  // If it's HTML (not JSON), mark as raw
  if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) {
    return { _raw: text.slice(0, 200), _status: res.status, _isHtml: true };
  }
  
  try {
    const data = JSON.parse(text);
    // Only skip if explicitly logged:false AND no useful data
    if (data.logged === false && Object.keys(data).length <= 2) {
      return { _notLogged: true, _raw: text.slice(0, 500) };
    }
    // Tag with status for caller reference
    data._httpStatus = res.status;
    return data;
  } catch {
    // Non-JSON, non-HTML response
    return { _raw: text.slice(0, 500), _status: res.status };
  }
}

async function tryMultiple(baseUrl: string, paths: string[], headers: Record<string, string>, method = 'GET', body?: any) {
  for (const path of paths) {
    try {
      const data = await tryFetch(`${baseUrl}${path}`, headers, method, body);
      console.log(`[tryMultiple] ${path} → _notLogged=${data._notLogged}, _raw=${!!data._raw}, _isHtml=${data._isHtml}, keys=${Object.keys(data).join(',')}`);
      // Accept any JSON response that isn't a login redirect or HTML page
      if (!data._notLogged && !data._raw && !data._isHtml) {
        // Clean internal tags before returning
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body: ProxyRequest = await req.json();
    const baseUrl = body.site_url.replace(/\/+$/, '');

    const auth = await doLogin(body);
    if (!auth.success) {
      return new Response(JSON.stringify({ success: false, error: 'Login falhou' }), 
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const headers = buildHeaders(auth.cookies, auth.token);

    let result: any = null;

    switch (body.action) {
      case 'login':
        result = { logged: true, has_cookies: !!auth.cookies, has_token: !!auth.token };
        break;

      case 'search_player': {
        const query = body.cpf || body.uuid || '';
        const paths = [
          `/api/usuarios/buscar?cpf=${query}`,
          `/api/usuarios/buscar?q=${query}`,
          `/api/usuarios/buscar?documento=${query}`,
          `/api/usuarios?cpf=${query}`,
          `/api/usuarios?search=${query}`,
        ];
        const found = await tryMultiple(baseUrl, paths, headers);
        if (found) {
          result = found.data;
        } else {
          for (const path of ['/api/usuarios/buscar', '/api/usuarios']) {
            try {
              const data = await tryFetch(`${baseUrl}${path}`, headers, 'POST', { cpf: query, documento: query, search: query, q: query });
              if (!data._notLogged && !data._raw) { result = data; break; }
            } catch {}
          }
        }
        break;
      }

      case 'player_balance': {
        const id = body.player_id || body.uuid || body.cpf || '';
        const paths = [
          `/api/usuarios/saldo?uuid=${id}`,
          `/api/usuarios/saldo?cpf=${id}`,
          `/api/saldo?uuid=${id}`,
          `/api/usuarios/${id}/saldo`,
        ];
        const found = await tryMultiple(baseUrl, paths, headers);
        result = found?.data || null;
        break;
      }

      case 'player_transactions': {
        const id = body.player_id || body.uuid || body.cpf || '';
        const paths = [
          `/api/usuarios/transacoes?uuid=${id}`,
          `/api/usuarios/transacoes?cpf=${id}`,
          `/api/transacoes?uuid=${id}`,
          `/api/usuarios/${id}/transacoes`,
        ];
        const found = await tryMultiple(baseUrl, paths, headers);
        result = found?.data || null;
        break;
      }

      case 'bonus_history': {
        const id = body.player_id || body.uuid || body.cpf || '';
        const paths = [
          `/api/bonus/historico?uuid=${id}`,
          `/api/bonus/historico?cpf=${id}`,
          `/api/bonus?uuid=${id}`,
          `/api/usuarios/${id}/bonus`,
        ];
        const found = await tryMultiple(baseUrl, paths, headers);
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
        const bonusId = body.bonus_id || '';
        for (const path of ['/api/bonus/cancelar', '/bonus/cancelar']) {
          try {
            const data = await tryFetch(`${baseUrl}${path}`, headers, 'POST', {
              uuid: body.uuid, cpf: body.cpf, player_id: id, bonus_id: bonusId
            });
            if (!data._notLogged) { result = data; break; }
          } catch {}
        }
        if (!result) {
          // Try GET with query params
          const paths = [
            `/api/bonus/cancelar?uuid=${id}&bonus_id=${bonusId}`,
            `/api/bonus/cancelar?cpf=${body.cpf}&bonus_id=${bonusId}`,
          ];
          const found = await tryMultiple(baseUrl, paths, headers);
          result = found?.data || null;
        }
        break;
      }

      case 'list_users': {
        const search = body.search || '';
        const page = body.page || 1;
        const limit = body.limit || 50;
        const paths = [
          `/api/usuarios?page=${page}&limit=${limit}${search ? `&search=${search}` : ''}`,
          `/api/usuarios?pagina=${page}&limite=${limit}${search ? `&busca=${search}` : ''}`,
        ];
        const found = await tryMultiple(baseUrl, paths, headers);
        result = found?.data || null;
        break;
      }

      case 'list_transactions': {
        const page = body.page || 1;
        const limit = body.limit || 50;
        const search = body.search || '';
        const paths = [
          `/api/transacoes?page=${page}&limit=${limit}${search ? `&search=${search}` : ''}`,
          `/api/transacoes?pagina=${page}&limite=${limit}${search ? `&busca=${search}` : ''}`,
          `/api/usuarios/transacoes?page=${page}&limit=${limit}`,
        ];
        const found = await tryMultiple(baseUrl, paths, headers);
        result = found?.data || null;
        break;
      }

      case 'dashboard': {
        const paths = ['/api/dashboard', '/api/status', '/api/relatorios'];
        const found = await tryMultiple(baseUrl, paths, headers);
        result = found?.data || null;
        break;
      }

      case 'reports': {
        const paths = ['/api/relatorios', '/api/dashboard', '/api/bonus'];
        const found = await tryMultiple(baseUrl, paths, headers);
        result = found?.data || null;
        break;
      }

      case 'site_status': {
        const paths = ['/api/status', '/api/health'];
        const found = await tryMultiple(baseUrl, paths, headers);
        result = found?.data || null;
        break;
      }

      case 'site_config': {
        const paths = ['/api/config'];
        const found = await tryMultiple(baseUrl, paths, headers);
        result = found?.data || null;
        break;
      }

      case 'credit_batch': {
        if (!body.batch_id) { result = { error: 'batch_id obrigatório' }; break; }
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: items, error: itemsErr } = await supabase
          .from('batch_items')
          .select('*')
          .eq('batch_id', body.batch_id)
          .in('status', ['PENDENTE', 'SEM_BONUS']);

        if (itemsErr || !items) { result = { error: itemsErr?.message || 'Erro ao buscar itens' }; break; }

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
                status: 'BONUS_1X', 
                qtd_bonus: 1, 
                log: [JSON.stringify(creditResult).slice(0, 200)] 
              }).eq('id', item.id);
              credited++;
            } else {
              await supabase.from('batch_items').update({ 
                status: 'ERRO', 
                tentativas: item.tentativas + 1,
                log: [JSON.stringify(creditResult || 'Sem resposta').slice(0, 200)] 
              }).eq('id', item.id);
              errors++;
            }
          } catch (e) {
            await supabase.from('batch_items').update({ 
              status: 'ERRO', 
              tentativas: item.tentativas + 1,
              log: [(e as Error).message] 
            }).eq('id', item.id);
            errors++;
          }
        }

        const { data: updatedItems } = await supabase
          .from('batch_items')
          .select('status')
          .eq('batch_id', body.batch_id);

        const newStats = {
          pendente: 0, processando: 0, sem_bonus: 0, bonus_1x: 0, bonus_2x_plus: 0, erro: 0
        };
        for (const i of updatedItems || []) {
          if (i.status === 'PENDENTE') newStats.pendente++;
          else if (i.status === 'SEM_BONUS') newStats.sem_bonus++;
          else if (i.status === 'BONUS_1X') newStats.bonus_1x++;
          else if (i.status === 'BONUS_2X+') newStats.bonus_2x_plus++;
          else if (i.status === 'ERRO') newStats.erro++;
        }

        const processed = (updatedItems || []).filter(i => i.status !== 'PENDENTE').length;
        await supabase.from('batches').update({ 
          stats: newStats, 
          processed,
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
