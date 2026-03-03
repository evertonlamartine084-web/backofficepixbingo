const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface FetchPlayersRequest {
  site_url: string;
  login_url?: string;
  username: string;
  password: string;
  username_field?: string;
  password_field?: string;
  batch_name: string;
  bonus_valor?: number;
  flow_id?: string;
  flow_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: FetchPlayersRequest = await req.json();

    if (!body.site_url || !body.username || !body.password || !body.batch_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'site_url, username, password e batch_name são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = body.site_url.replace(/\/+$/, '');
    
    // Try multiple login endpoints
    const loginUrls = [
      body.login_url,
      `${baseUrl}/api/auth/login`,
      `${baseUrl}/auth/login`,
      `${baseUrl}/login`,
    ].filter(Boolean) as string[];

    let sessionCookies = '';
    let bearerToken = '';
    let loginSuccess = false;

    const loginPayload: Record<string, string> = {};
    loginPayload[body.username_field || 'email'] = body.username;
    loginPayload[body.password_field || 'password'] = body.password;

    for (const loginUrl of loginUrls) {
      console.log(`[FetchPlayers] Trying login at: ${loginUrl}`);
      try {
        const loginRes = await fetch(loginUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loginPayload),
          redirect: 'manual',
        });

        const setCookies = loginRes.headers.getSetCookie?.() || [];
        const cookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');

        let responseBody = '';
        try { responseBody = await loginRes.text(); } catch {}
        console.log(`[FetchPlayers] Login ${loginUrl} status=${loginRes.status} body=${responseBody.slice(0, 500)}`);

        if (loginRes.ok || loginRes.status === 302) {
          if (cookies) sessionCookies = cookies;
          
          // Try to extract token
          try {
            const loginData = JSON.parse(responseBody);
            bearerToken = loginData.token || loginData.access_token || loginData.data?.token || loginData.jwt || '';
            if (loginData.logged === true || loginData.success === true || bearerToken) {
              loginSuccess = true;
            }
          } catch {}

          if (cookies || bearerToken) {
            loginSuccess = true;
            console.log(`[FetchPlayers] Login success at ${loginUrl}. Token: ${bearerToken ? 'yes' : 'no'}, Cookies: ${cookies ? 'yes' : 'no'}`);
            break;
          }
        }
      } catch (e) {
        console.log(`[FetchPlayers] Login ${loginUrl} error: ${(e as Error).message}`);
      }
    }

    // Build auth headers
    const authHeaders: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (bearerToken) authHeaders['Authorization'] = `Bearer ${bearerToken}`;
    if (sessionCookies) authHeaders['Cookie'] = sessionCookies;

    // Fetch players - try multiple endpoints with GET and POST
    const playerEndpoints = [
      `${baseUrl}/api/usuarios`,
      `${baseUrl}/api/usuarios/buscar`,
      `${baseUrl}/api/users`,
      `${baseUrl}/usuarios`,
      `${baseUrl}/usuarios/buscar`,
    ];

    let allPlayers: any[] = [];
    let usedEndpoint = '';
    const debugResponses: { url: string; status: number; body: string }[] = [];

    for (const endpoint of playerEndpoints) {
      for (const method of ['GET', 'POST']) {
        try {
          console.log(`[FetchPlayers] ${method} ${endpoint}`);
          const fetchOpts: RequestInit = {
            method,
            headers: authHeaders,
            signal: AbortSignal.timeout(15000),
          };
          if (method === 'POST') {
            fetchOpts.body = JSON.stringify({ page: 1, limit: 10000, per_page: 10000 });
          }

          const res = await fetch(endpoint, fetchOpts);
          const text = await res.text();
          
          debugResponses.push({ url: `${method} ${endpoint}`, status: res.status, body: text.slice(0, 300) });
          console.log(`[FetchPlayers] ${method} ${endpoint} → ${res.status}: ${text.slice(0, 300)}`);

          if (!res.ok) continue;

          let data: any;
          try { data = JSON.parse(text); } catch { continue; }

          // If response says not logged, skip
          if (data.logged === false) continue;

          // Extract players array from various response shapes
          let players: any[] = [];
          if (Array.isArray(data)) players = data;
          else if (data.data && Array.isArray(data.data)) players = data.data;
          else if (data.users && Array.isArray(data.users)) players = data.users;
          else if (data.usuarios && Array.isArray(data.usuarios)) players = data.usuarios;
          else if (data.results && Array.isArray(data.results)) players = data.results;
          else if (data.items && Array.isArray(data.items)) players = data.items;
          else if (data.rows && Array.isArray(data.rows)) players = data.rows;
          else if (data.list && Array.isArray(data.list)) players = data.list;

          if (players.length > 0) {
            allPlayers = players;
            usedEndpoint = `${method} ${endpoint}`;
            console.log(`[FetchPlayers] Found ${players.length} players!`);
            break;
          }
        } catch (e) {
          console.log(`[FetchPlayers] ${method} ${endpoint} error: ${(e as Error).message}`);
        }
      }
      if (allPlayers.length > 0) break;
    }

    if (allPlayers.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Nenhum jogador encontrado. Verifique as credenciais e a URL do site.',
          login_success: loginSuccess,
          has_cookies: !!sessionCookies,
          has_token: !!bearerToken,
          debug_responses: debugResponses,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract CPF and UUID from players
    const batchItems = allPlayers.map((player: any) => {
      const cpf = player.cpf || player.documento || player.document || player.tax_id || '';
      const uuid = player.uuid || player.id || player.user_id || '';
      const cleanCpf = cpf.toString().replace(/\D/g, '');
      const maskedCpf = cleanCpf.length === 11 
        ? `${cleanCpf.slice(0, 3)}.***.***-${cleanCpf.slice(-2)}`
        : cleanCpf;

      return { cpf: cleanCpf, cpf_masked: maskedCpf, uuid: uuid.toString() };
    }).filter((item: any) => item.cpf || item.uuid);

    // Create batch in Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: batch, error: batchError } = await supabase
      .from('batches')
      .insert({
        name: body.batch_name,
        bonus_valor: body.bonus_valor || 0,
        total_items: batchItems.length,
        flow_id: body.flow_id || null,
        flow_name: body.flow_name || null,
        status: 'PENDENTE',
      })
      .select()
      .single();

    if (batchError) {
      return new Response(
        JSON.stringify({ success: false, error: `Erro ao criar lote: ${batchError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert items in chunks
    let insertedCount = 0;
    for (let i = 0; i < batchItems.length; i += 500) {
      const chunk = batchItems.slice(i, i + 500).map((item: any) => ({
        batch_id: batch.id,
        cpf: item.cpf,
        cpf_masked: item.cpf_masked,
        uuid: item.uuid,
        status: 'PENDENTE',
      }));
      const { error } = await supabase.from('batch_items').insert(chunk);
      if (!error) insertedCount += chunk.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        batch_id: batch.id,
        batch_name: batch.name,
        total_players: allPlayers.length,
        inserted_items: insertedCount,
        source_endpoint: usedEndpoint,
        sample_player: allPlayers[0] ? JSON.stringify(allPlayers[0]).slice(0, 300) : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[FetchPlayers] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
