import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://backofficepixbingo.vercel.app',
  'https://pixbingobr.com',
  'https://www.pixbingobr.com',
  'https://pixbingobr.concurso.club',
  'http://localhost:8080',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsOrigin(req: Request): string {
  const origin = req.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function getCorsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  };
}

interface DiscoverRequest {
  site_url: string;
  login_url?: string;
  username: string;
  password: string;
  login_method: 'form' | 'api';
  username_field?: string;
  password_field?: string;
  probe_paths?: string[];
}

interface DiscoveredEndpoint {
  method: string;
  url: string;
  description: string;
  status: number | null;
  content_type: string | null;
  auth_type: string;
  sample_response?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth verification
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Não autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  );
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) {
    return new Response(JSON.stringify({ success: false, error: 'Token inválido' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: DiscoverRequest = await req.json();

    if (!body.site_url || !body.username || !body.password) {
      return new Response(
        JSON.stringify({ success: false, error: 'site_url, username e password são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = body.site_url.replace(/\/+$/, '');
    const results: DiscoveredEndpoint[] = [];
    let sessionCookies = '';
    let bearerToken = '';

    // Step 1: Try to login and get session
    const loginUrl = body.login_url || `${baseUrl}/api/auth/login`;

    console.log(`[Discovery] Attempting login at: ${loginUrl}`);

    try {
      // Try API-based login first
      const loginPayload: Record<string, string> = {};
      loginPayload[body.username_field || 'email'] = body.username;
      loginPayload[body.password_field || 'password'] = body.password;

      const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginPayload),
        redirect: 'manual',
      });

      // Capture cookies from Set-Cookie headers
      const setCookies = loginRes.headers.getSetCookie?.() || [];
      sessionCookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');

      // Try to extract token from response
      if (loginRes.ok) {
        try {
          const loginData = await loginRes.json();
          bearerToken = loginData.token || loginData.access_token || loginData.data?.token || '';
          console.log(`[Discovery] Login successful. Token: ${bearerToken ? 'yes' : 'no'}, Cookies: ${sessionCookies ? 'yes' : 'no'}`);
        } catch {
          console.log('[Discovery] Login response is not JSON');
        }
      } else {
        console.log(`[Discovery] Login returned status ${loginRes.status}`);
      }

      results.push({
        method: 'POST',
        url: loginUrl,
        description: 'Login / Autenticação',
        status: loginRes.status,
        content_type: loginRes.headers.get('content-type'),
        auth_type: 'none',
      });
    } catch (e) {
      console.log(`[Discovery] Login failed: ${(e as Error).message}`);
    }

    // Step 2: Build auth headers
    const authHeaders: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    let detectedAuth = 'none';

    if (bearerToken) {
      authHeaders['Authorization'] = `Bearer ${bearerToken}`;
      detectedAuth = 'bearer';
    }
    if (sessionCookies) {
      authHeaders['Cookie'] = sessionCookies;
      if (!bearerToken) detectedAuth = 'cookie';
    }

    // Step 3: Probe common API paths
    const defaultPaths = [
      '/api/usuarios/transacoes',
      '/api/usuarios/buscar',
      '/api/usuarios/saldo',
      '/api/bonus/creditar',
      '/api/bonus/historico',
      '/api/bonus/cancelar',
      '/api/transacoes',
      '/api/usuarios',
      '/api/bonus',
      '/api/saldo',
      '/api/dashboard',
      '/api/relatorios',
      '/api/config',
      '/api/health',
      '/api/status',
      // PixBingoBR specific
      '/usuarios/transacoes',
      '/usuarios/buscar',
      '/usuarios/saldo',
      '/bonus/creditar',
      '/bonus/historico',
      '/bonus/cancelar',
    ];

    const pathsToProbe = body.probe_paths?.length ? body.probe_paths : defaultPaths;

    console.log(`[Discovery] Probing ${pathsToProbe.length} paths...`);

    const probePromises = pathsToProbe.map(async (path) => {
      const url = `${baseUrl}${path}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: authHeaders,
          signal: AbortSignal.timeout(8000),
        });

        const contentType = res.headers.get('content-type') || '';
        let sampleResponse: string | undefined;

        if (contentType.includes('json') && res.ok) {
          try {
            await res.text();
            sampleResponse = '[dados disponíveis]';
          } catch { /* ignore */ }
        }

        // Only consider it a valid endpoint if it's not a 404 HTML page
        const isValid = res.status !== 404 && (
          contentType.includes('json') ||
          res.status === 200 ||
          res.status === 401 ||
          res.status === 403 ||
          res.status === 405
        );

        if (isValid) {
          return {
            method: res.status === 405 ? 'POST' : 'GET',
            url,
            description: `Descoberto em ${path}`,
            status: res.status,
            content_type: contentType,
            auth_type: detectedAuth,
            sample_response: sampleResponse,
          } as DiscoveredEndpoint;
        }
        return null;
      } catch {
        return null;
      }
    });

    const probeResults = await Promise.all(probePromises);
    results.push(...probeResults.filter(Boolean) as DiscoveredEndpoint[]);

    // Step 4: Also try POST on some endpoints
    const postPaths = ['/bonus/creditar', '/api/bonus/creditar', '/api/auth/login'];
    for (const path of postPaths) {
      if (pathsToProbe.includes(path)) continue;
      const url = `${baseUrl}${path}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: authHeaders,
          body: '{}',
          signal: AbortSignal.timeout(5000),
        });

        const contentType = res.headers.get('content-type') || '';
        if (res.status !== 404) {
          results.push({
            method: 'POST',
            url,
            description: `POST descoberto em ${path}`,
            status: res.status,
            content_type: contentType,
            auth_type: detectedAuth,
          });
        }
      } catch { /* ignore */ }
    }

    console.log(`[Discovery] Found ${results.length} endpoints`);

    return new Response(
      JSON.stringify({
        success: true,
        base_url: baseUrl,
        auth_type: detectedAuth,
        session_cookies: sessionCookies ? true : false,
        bearer_token: bearerToken ? true : false,
        endpoints: results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Discovery] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
