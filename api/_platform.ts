/**
 * Shared platform login and API utilities for Vercel Edge API routes.
 * Extracted from duplicated logic across pixbingo-proxy, sync-player-xp, and gamification-widget.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// --- Types ---

export interface PlatformLoginResult {
  cookies: string;
  success: boolean;
}

export interface DebugEntry {
  strategy: Record<string, string> | string;
  found?: number;
  error?: string;
  status?: number;
  snippet?: string;
}

export interface SearchPlayerResult {
  uuid: string | null;
  debug: DebugEntry[];
}

// --- Platform login ---

/**
 * Login to the platform and return session cookies.
 * Handles initial cookie fetch, POST login, redirect-based and JSON-based success detection.
 */
export async function platformLogin(
  siteUrl: string,
  username: string,
  password: string,
  loginUrl?: string | null,
): Promise<PlatformLoginResult> {
  const baseUrl = siteUrl.replace(/\/+$/, '');
  let loginTarget = `${baseUrl}/login`;
  if (loginUrl) {
    const cleanLogin = loginUrl.replace(/\/+$/, '');
    loginTarget = cleanLogin.endsWith('/login') ? cleanLogin : `${cleanLogin}/login`;
  }

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
  } catch { /* ignore */ }

  try {
    const hdrs: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/json,*/*',
      'Referer': `${baseUrl}/`,
      'Origin': baseUrl,
    };
    if (initialCookies) hdrs['Cookie'] = initialCookies;

    const res = await fetch(loginTarget, {
      method: 'POST',
      headers: hdrs,
      body: new URLSearchParams({ usuario: username, senha: password }).toString(),
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

    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get('location') || '';
      if (!location.includes('/login') && !location.includes('error')) {
        return { cookies, success: true };
      }
    }

    if (res.ok) {
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data.status === true || data.logged === true) {
          return { cookies, success: true };
        }
      } catch { /* ignore */ }
      // If we got cookies back and the response isn't a login page, consider it success
      if (setCookies.length > 0 && !text.includes('name="usuario"') && !text.includes('name="senha"')) {
        return { cookies, success: true };
      }
    }
  } catch { /* ignore */ }

  return { cookies: '', success: false };
}

// --- Common headers ---

/**
 * Build standard headers for platform AJAX/API calls after login.
 */
export function buildPlatformHeaders(cookies: string, baseUrl: string): Record<string, string> {
  const h: Record<string, string> = {
    'Accept': 'application/json, text/javascript, */*',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (cookies) h['Cookie'] = cookies;
  if (baseUrl) h['Referer'] = baseUrl;
  return h;
}

// --- Fetch JSON helper ---

/**
 * Fetch a URL and parse the response as JSON. Falls back to { _raw, _status } on parse failure.
 */
export async function fetchJSON(
  url: string,
  headers: Record<string, string>,
  method: 'GET' | 'POST' = 'GET',
  body?: string | Record<string, string>,
): Promise<Record<string, unknown>> {
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

  const res = await fetch(url, opts);
  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 500), _status: res.status };
  }
}

// --- DataTable params builder ---

/**
 * Build URLSearchParams for the platform's DataTables server-side API.
 * This pattern is repeated across list_users, search_player, list_transactions, etc.
 */
export function buildDataTableParams(options: {
  columns: string[];
  draw?: number;
  start?: number;
  length?: number;
  orderColumn?: number;
  orderDir?: 'asc' | 'desc';
  extraParams?: Record<string, string>;
}): URLSearchParams {
  const { columns, draw = 1, start = 0, length = 50, orderColumn = 0, orderDir = 'asc', extraParams } = options;
  const params = new URLSearchParams();
  params.set('draw', String(draw));
  params.set('start', String(start));
  params.set('length', String(length));

  columns.forEach((col, i) => {
    params.set(`columns[${i}][data]`, col);
    params.set(`columns[${i}][name]`, '');
    params.set(`columns[${i}][searchable]`, 'true');
    params.set(`columns[${i}][orderable]`, 'true');
    params.set(`columns[${i}][search][value]`, '');
    params.set(`columns[${i}][search][regex]`, 'false');
  });

  params.set('order[0][column]', String(orderColumn));
  params.set('order[0][dir]', orderDir);
  params.set('search[value]', '');
  params.set('search[regex]', 'false');

  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      params.set(k, v);
    }
  }

  return params;
}

// --- Common column sets ---

export const USER_COLUMNS = ['username', 'celular', 'cpf', 'created_at', 'ultimo_login', 'situacao', 'uuid'];
export const TX_COLUMNS = ['id', 'tipo', 'valor', 'saldo_anterior', 'saldo_posterior', 'cpf', 'username', 'created_at', 'descricao', 'status'];

// --- Search player by CPF ---

/**
 * Search for a player by CPF on the platform. Tries multiple strategies.
 * Returns uuid and debug info for troubleshooting.
 */
export async function searchPlayerByCpf(
  baseUrl: string,
  headers: Record<string, string>,
  cpf: string,
): Promise<SearchPlayerResult> {
  const debugInfo: DebugEntry[] = [];

  const strategies = [
    { busca_cpf: cpf },
    { busca_username: cpf },
    { 'search[value]': cpf },
    { 'columns[2][search][value]': cpf },
  ];

  for (const extra of strategies) {
    try {
      const params = buildDataTableParams({
        columns: USER_COLUMNS,
        length: 5,
        extraParams: extra,
      });

      const res = await fetch(`${baseUrl}/usuarios/listar?${params.toString()}`, {
        method: 'GET', headers, signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      const data = JSON.parse(text);
      const rows = data?.data || data?.aaData || [];
      debugInfo.push({ strategy: extra, found: rows.length });
      if (rows.length > 0) return { uuid: rows[0].uuid || null, debug: debugInfo };
    } catch (e: unknown) {
      debugInfo.push({ strategy: extra, error: e instanceof Error ? e.message : 'Erro' });
    }
  }

  // Fallback: Try /usuarios/buscar endpoint directly
  try {
    const res = await fetch(`${baseUrl}/usuarios/buscar?q=${encodeURIComponent(cpf)}`, {
      method: 'GET', headers, signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    debugInfo.push({ strategy: 'buscar', status: res.status, snippet: text.slice(0, 300) });
    const data = JSON.parse(text);
    if (Array.isArray(data) && data.length > 0) return { uuid: data[0].uuid || data[0].id || null, debug: debugInfo };
    if (data?.data?.length > 0) return { uuid: data.data[0].uuid || null, debug: debugInfo };
  } catch (e: unknown) {
    debugInfo.push({ strategy: 'buscar', error: e instanceof Error ? e.message : 'Erro' });
  }

  // Fallback: Try /api/usuarios or /api/users
  for (const path of ['/api/usuarios', '/api/users']) {
    try {
      const res = await fetch(`${baseUrl}${path}?cpf=${encodeURIComponent(cpf)}`, {
        method: 'GET', headers, signal: AbortSignal.timeout(10000),
      });
      const text = await res.text();
      debugInfo.push({ strategy: path, status: res.status, snippet: text.slice(0, 300) });
      const data = JSON.parse(text);
      if (Array.isArray(data) && data.length > 0) return { uuid: data[0].uuid || data[0].id || null, debug: debugInfo };
      if (data?.data?.length > 0) return { uuid: data.data[0].uuid || null, debug: debugInfo };
    } catch (e: unknown) {
      debugInfo.push({ strategy: path, error: e instanceof Error ? e.message : 'Erro' });
    }
  }

  return { uuid: null, debug: debugInfo };
}

// --- Cached platform login ---

const COOKIE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Login with cookie caching. Checks platform_config.cached_cookies first.
 * Falls back to full login and saves cookies for next call.
 */
export async function cachedPlatformLogin(
  supabase: SupabaseClient,
  config: { id?: string; site_url: string; username: string; password: string; login_url?: string | null; cached_cookies?: string | null; cookies_expires_at?: string | null },
): Promise<PlatformLoginResult> {
  const baseUrl = (config.site_url || '').replace(/\/+$/, '');

  // Check cached cookies
  if (config.cached_cookies && config.cookies_expires_at) {
    const expiresAt = new Date(config.cookies_expires_at).getTime();
    if (expiresAt > Date.now()) {
      // Validate cached cookies with a lightweight request
      try {
        const testRes = await fetch(`${baseUrl}/usuarios/listar?draw=1&start=0&length=1`, {
          headers: { 'Cookie': config.cached_cookies, 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          signal: AbortSignal.timeout(5000),
        });
        if (testRes.ok) {
          const text = await testRes.text();
          if (!text.includes('name="usuario"') && !text.includes('name="senha"') && !text.includes('<form')) {
            return { cookies: config.cached_cookies, success: true };
          }
        }
      } catch { /* cache invalid, do full login */ }
    }
  }

  // Full login
  const result = await platformLogin(baseUrl, config.username, config.password, config.login_url);

  // Save cookies to cache
  if (result.success && config.id) {
    const expiresAt = new Date(Date.now() + COOKIE_TTL_MS).toISOString();
    await supabase.from('platform_config').update({
      cached_cookies: result.cookies,
      cookies_expires_at: expiresAt,
    } as Record<string, unknown>).eq('id', config.id);
  }

  return result;
}

// --- Cached player UUID lookup ---

/**
 * Get player UUID, checking player_wallets.platform_uuid cache first.
 * Falls back to platform search and saves UUID for next call.
 */
export async function cachedSearchPlayerByCpf(
  supabase: SupabaseClient,
  baseUrl: string,
  headers: Record<string, string>,
  cpf: string,
): Promise<string | null> {
  // Check cached UUID in player_wallets
  const { data: wallet } = await supabase.from('player_wallets')
    .select('platform_uuid').eq('cpf', cpf).maybeSingle();
  if (wallet?.platform_uuid) return wallet.platform_uuid;

  // Full search
  const result = await searchPlayerByCpf(baseUrl, headers, cpf);
  if (!result.uuid) return null;

  // Cache UUID
  await supabase.from('player_wallets')
    .update({ platform_uuid: result.uuid } as Record<string, unknown>)
    .eq('cpf', cpf);

  return result.uuid;
}
