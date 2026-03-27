/* eslint-disable @typescript-eslint/no-explicit-any */
import { getCorsHeaders, optionsResponse, verifyAuth } from './_cors.js';

export const config = { runtime: 'edge', maxDuration: 300 };

// Process bonus for a single CPF: search UUID then credit
async function creditSingleCpf(
  baseUrl: string, headers: Record<string, string>,
  cpf: string, valor: number, senha: string
): Promise<{ cpf: string; success: boolean; error?: string }> {
  try {
    // 1. Search player UUID by CPF
    const userCols = ['username', 'celular', 'cpf', 'created_at', 'ultimo_login', 'situacao', 'uuid'];
    const params = new URLSearchParams({ draw: '1', start: '0', length: '1', busca_cpf: cpf });
    userCols.forEach((col, i) => {
      params.set(`columns[${i}][data]`, col); params.set(`columns[${i}][name]`, '');
      params.set(`columns[${i}][searchable]`, 'true'); params.set(`columns[${i}][orderable]`, 'true');
      params.set(`columns[${i}][search][value]`, ''); params.set(`columns[${i}][search][regex]`, 'false');
    });
    params.set('order[0][column]', '0'); params.set('order[0][dir]', 'asc');
    params.set('search[value]', ''); params.set('search[regex]', 'false');

    const searchRes = await fetch(`${baseUrl}/usuarios/listar?${params}`, {
      headers, signal: AbortSignal.timeout(10000),
    });
    const searchData = JSON.parse(await searchRes.text());
    const rows = searchData?.data || searchData?.aaData || [];
    const uuid = rows[0]?.uuid;

    if (!uuid) return { cpf, success: false, error: 'UUID não encontrado' };

    // 2. Credit bonus
    const creditRes = await fetch(`${baseUrl}/usuarios/creditos`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ uuid, carteira: 'BONUS', valor: String(valor), senha }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    const creditText = await creditRes.text();
    let creditData: any;
    try { creditData = JSON.parse(creditText); } catch { return { cpf, success: false, error: `Resposta inválida: ${creditText.slice(0, 100)}` }; }

    if (creditData.status === true || creditData.msg?.includes('sucesso')) {
      return { cpf, success: true };
    }
    return { cpf, success: false, error: creditData.msg || creditData.error || JSON.stringify(creditData).slice(0, 100) };
  } catch (e: any) {
    return { cpf, success: false, error: e.message };
  }
}

// Platform login
async function doLogin(siteUrl: string, loginUrl: string | undefined, username: string, password: string): Promise<{ cookies: string; success: boolean }> {
  const baseUrl = siteUrl.replace(/\/+$/, '');
  let loginTarget = `${baseUrl}/login`;
  if (loginUrl) {
    const clean = loginUrl.replace(/\/+$/, '');
    loginTarget = clean.endsWith('/login') ? clean : `${clean}/login`;
  }

  let initialCookies = '';
  try {
    const initRes = await fetch(baseUrl, { method: 'GET', headers: { Accept: 'text/html' }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const setCookies = initRes.headers.getSetCookie?.() || [];
    initialCookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
  } catch {}

  try {
    const hdrs: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/json,*/*',
      'Referer': `${baseUrl}/`, 'Origin': baseUrl,
    };
    if (initialCookies) hdrs['Cookie'] = initialCookies;

    const res = await fetch(loginTarget, {
      method: 'POST', headers: hdrs,
      body: new URLSearchParams({ usuario: username, senha: password }).toString(),
      redirect: 'manual', signal: AbortSignal.timeout(10000),
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

    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get('location') || '';
      if (!location.includes('/login') && !location.includes('error')) return { cookies, success: true };
    }
    if (res.ok) {
      const text = await res.text();
      try { const d = JSON.parse(text); if (d.status === true || d.logged === true) return { cookies, success: true }; } catch {}
    }
  } catch {}

  return { cookies: '', success: false };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const authOk = await verifyAuth(req);
  if (!authOk) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { cpfs, valor, site_url, login_url, username, password } = body;

    if (!cpfs || !Array.isArray(cpfs) || cpfs.length === 0) {
      return new Response(JSON.stringify({ error: 'cpfs (array) obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!valor || valor <= 0) {
      return new Response(JSON.stringify({ error: 'valor obrigatório e > 0' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const siteUrl = (site_url || 'https://pixbingobr.concurso.club').replace(/\/+$/, '');
    const login = await doLogin(siteUrl, login_url, username, password);

    if (!login.success) {
      return new Response(JSON.stringify({ error: 'Falha no login na plataforma' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json, text/javascript, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': login.cookies,
      'Referer': siteUrl,
    };

    // Process CPFs in batches of 5 concurrently
    const results: { cpf: string; success: boolean; error?: string }[] = [];
    const batchSize = 5;

    for (let i = 0; i < cpfs.length; i += batchSize) {
      const chunk = cpfs.slice(i, i + batchSize);
      const chunkResults = await Promise.all(
        chunk.map((cpf: string) => creditSingleCpf(siteUrl, headers, cpf.replace(/\D/g, ''), valor, password))
      );
      results.push(...chunkResults);
    }

    const credited = results.filter(r => r.success).length;
    const errors = results.filter(r => !r.success).length;

    return new Response(JSON.stringify({
      success: true,
      total: cpfs.length,
      credited,
      errors,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
