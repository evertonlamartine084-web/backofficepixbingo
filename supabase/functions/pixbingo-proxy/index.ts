const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ProxyRequest {
  action: 'login' | 'search_player' | 'player_balance' | 'player_transactions' | 'bonus_history' | 'credit_bonus' | 'cancel_bonus' | 'dashboard' | 'credit_batch';
  site_url: string;
  login_url?: string;
  username: string;
  password: string;
  username_field?: string;
  password_field?: string;
  // Action-specific params
  cpf?: string;
  uuid?: string;
  player_id?: string;
  bonus_amount?: number;
  batch_id?: string;
}

async function doLogin(body: ProxyRequest): Promise<{ cookies: string; token: string; success: boolean }> {
  const baseUrl = body.site_url.replace(/\/+$/, '');
  const loginUrls = [
    body.login_url,
    `${baseUrl}/api/auth/login`,
    `${baseUrl}/auth/login`,
  ].filter(Boolean) as string[];

  const loginPayload: Record<string, string> = {};
  loginPayload[body.username_field || 'email'] = body.username;
  loginPayload[body.password_field || 'password'] = body.password;

  for (const loginUrl of loginUrls) {
    try {
      const res = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginPayload),
        redirect: 'manual',
      });

      const setCookies = res.headers.getSetCookie?.() || [];
      const cookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
      let token = '';

      if (res.ok || res.status === 302) {
        try {
          const data = await res.json();
          token = data.token || data.access_token || data.data?.token || data.jwt || '';
          if (data.logged === true || data.success === true || token || cookies) {
            return { cookies, token, success: true };
          }
        } catch {}
        if (cookies) return { cookies, token, success: true };
      }
    } catch {}
  }
  return { cookies: '', token: '', success: false };
}

function buildHeaders(cookies: string, token: string): Record<string, string> {
  const h: Record<string, string> = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (cookies) h['Cookie'] = cookies;
  return h;
}

async function tryFetch(url: string, headers: Record<string, string>, method = 'GET', body?: any): Promise<any> {
  const opts: RequestInit = { method, headers, signal: AbortSignal.timeout(15000) };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  
  const res = await fetch(url, opts);
  const text = await res.text();
  
  try {
    const data = JSON.parse(text);
    if (data.logged === false) return { _notLogged: true, _raw: text.slice(0, 500) };
    return data;
  } catch {
    return { _raw: text.slice(0, 500), _status: res.status };
  }
}

async function tryMultiple(baseUrl: string, paths: string[], headers: Record<string, string>, method = 'GET', body?: any) {
  for (const path of paths) {
    try {
      const data = await tryFetch(`${baseUrl}${path}`, headers, method, body);
      if (!data._notLogged && !data._raw) return { data, path };
    } catch {}
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body: ProxyRequest = await req.json();
    const baseUrl = body.site_url.replace(/\/+$/, '');

    // Login
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
          // Try POST
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

      case 'dashboard': {
        const paths = ['/api/dashboard', '/api/status', '/api/relatorios', '/api/config'];
        const found = await tryMultiple(baseUrl, paths, headers);
        result = found?.data || null;
        break;
      }

      case 'credit_batch': {
        if (!body.batch_id) { result = { error: 'batch_id obrigatório' }; break; }
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get eligible items (PENDENTE or SEM_BONUS)
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

        // Update batch stats
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
