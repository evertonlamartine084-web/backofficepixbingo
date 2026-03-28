/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse, verifyAuth } from './_cors.js';

export const config = { runtime: 'edge', maxDuration: 300 };

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Search player UUID by CPF
async function findUuid(baseUrl: string, headers: Record<string, string>, cpf: string): Promise<string | null> {
  const userCols = ['username', 'celular', 'cpf', 'created_at', 'ultimo_login', 'situacao', 'uuid'];
  const params = new URLSearchParams({ draw: '1', start: '0', length: '1', busca_cpf: cpf });
  userCols.forEach((col, i) => {
    params.set(`columns[${i}][data]`, col); params.set(`columns[${i}][name]`, '');
    params.set(`columns[${i}][searchable]`, 'true'); params.set(`columns[${i}][orderable]`, 'true');
    params.set(`columns[${i}][search][value]`, ''); params.set(`columns[${i}][search][regex]`, 'false');
  });
  params.set('order[0][column]', '0'); params.set('order[0][dir]', 'asc');
  params.set('search[value]', ''); params.set('search[regex]', 'false');
  const res = await fetch(`${baseUrl}/usuarios/listar?${params}`, { headers, signal: AbortSignal.timeout(10000) });
  const data = JSON.parse(await res.text());
  const rows = data?.data || data?.aaData || [];
  return rows[0]?.uuid || null;
}

// Check bonus history for a player via /usuarios/transacoes
async function countBonusCredits(
  baseUrl: string, headers: Record<string, string>, uuid: string, valor: number, sinceDate: string
): Promise<number> {
  try {
    const res = await fetch(`${baseUrl}/usuarios/transacoes?id=${uuid}`, { headers, signal: AbortSignal.timeout(10000) });
    const data = JSON.parse(await res.text());
    const movs: any[] = data?.movimentacoes || [];
    let count = 0;
    for (const m of movs) {
      const tipo = (m.tipo || '').toUpperCase();
      if (tipo !== 'BONUS') continue;
      const v = typeof m.valor === 'number' ? m.valor : parseFloat(String(m.valor || '0').replace(/\./g, '').replace(',', '.'));
      if (Math.abs(v - valor) > 0.01) continue;
      // Check date
      const d = m.data_registro || '';
      if (d >= sinceDate) count++;
    }
    return count;
  } catch { return 0; }
}

// Credit bonus to a single player
async function creditBonus(
  baseUrl: string, headers: Record<string, string>, uuid: string, valor: number, senha: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${baseUrl}/usuarios/creditos`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ uuid, carteira: 'BONUS', valor: String(valor), senha }).toString(),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { return { success: false, error: `Resposta inválida: ${text.slice(0, 100)}` }; }
  if (data.status === true || data.msg?.includes('sucesso')) return { success: true };
  return { success: false, error: data.msg || data.error || JSON.stringify(data).slice(0, 100) };
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
    for (const c of initialCookies.split('; ').filter(Boolean)) { const [k, ...v] = c.split('='); cookieMap.set(k, v.join('=')); }
    for (const sc of setCookies) { const [kv] = sc.split(';'); const [k, ...v] = kv.split('='); cookieMap.set(k.trim(), v.join('=')); }
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
    let { cpfs, valor, site_url, login_url, username, password } = body;
    const mode = body.mode || 'credit'; // 'credit' | 'check'

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

    // Fetch credentials from platform_config if not provided
    const supabase = getSupabase();
    if (!username || !password) {
      const { data: pCfg } = await supabase.from('platform_config')
        .select('*').eq('active', true).order('created_at', { ascending: false }).limit(1).single();
      if (pCfg) {
        username = username || pCfg.username;
        password = password || pCfg.password;
        site_url = site_url || pCfg.site_url;
        login_url = login_url || pCfg.login_url;
      }
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

    // Today's date for duplicate check (BR timezone approximation)
    const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

    const results: any[] = [];
    const batchSize = 5;

    for (let i = 0; i < cpfs.length; i += batchSize) {
      const chunk = cpfs.slice(i, i + batchSize);
      const chunkResults = await Promise.all(chunk.map(async (rawCpf: string) => {
        const cpf = rawCpf.replace(/\D/g, '');
        try {
          const uuid = await findUuid(siteUrl, headers, cpf);
          if (!uuid) return { cpf, status: 'not_found', bonus_count: 0 };

          // Check how many times this bonus was already credited today
          const bonusCount = await countBonusCredits(siteUrl, headers, uuid, valor, today);

          if (mode === 'check') {
            return { cpf, status: bonusCount > 0 ? 'already_credited' : 'pending', bonus_count: bonusCount };
          }

          // Credit mode — skip if already credited today
          if (bonusCount > 0) {
            return { cpf, status: 'skipped_duplicate', bonus_count: bonusCount };
          }

          const result = await creditBonus(siteUrl, headers, uuid, valor, password);
          if (result.success) {
            // Log to Supabase
            try {
              await supabase.from('bonus_credits_log').insert({ cpf, valor, source: 'bulk-bonus', uuid } as any);
            } catch {} // table may not exist yet, that's ok
            return { cpf, status: 'credited', bonus_count: 1 };
          }
          return { cpf, status: 'error', bonus_count: bonusCount, error: result.error };
        } catch (e: any) {
          return { cpf, status: 'error', bonus_count: 0, error: e.message };
        }
      }));
      results.push(...chunkResults);
    }

    const summary = {
      credited: results.filter(r => r.status === 'credited').length,
      skipped_duplicate: results.filter(r => r.status === 'skipped_duplicate').length,
      not_found: results.filter(r => r.status === 'not_found').length,
      already_credited: results.filter(r => r.status === 'already_credited').length,
      errors: results.filter(r => r.status === 'error').length,
    };

    return new Response(JSON.stringify({ success: true, mode, total: cpfs.length, summary, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
