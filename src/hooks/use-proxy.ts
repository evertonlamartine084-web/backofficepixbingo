import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_SITE = 'https://pixbingobr.concurso.club';
const DEFAULT_LOGIN = 'https://pixbingobr.concurso.club/login';

/** Get current Supabase session token for API auth */
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

// Legacy credential functions kept for backward compatibility
// but no longer needed — proxy reads from platform_config automatically
export function getSavedCredentials(): { username: string; password: string } {
  return { username: 'auto', password: 'auto' };
}

export function saveCredentials(_username: string, _password: string) {
  // No-op: credentials are now centralized in platform_config
}

export function clearCredentials() {
  // No-op
}

export function useProxy() {
  const [loading, setLoading] = useState(false);

  const callProxy = useCallback(async (
    action: string,
    credentials?: { username: string; password: string } | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extra: Record<string, any> = {}
  ) => {
    const token = await getAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch('/api/pixbingo-proxy', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action,
          site_url: DEFAULT_SITE,
          login_url: DEFAULT_LOGIN,
          username: credentials?.username || '',
          password: credentials?.password || '',
          ...extra,
        }),
        signal: controller.signal,
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(res.status === 504 ? 'Timeout — a plataforma demorou para responder' : `Erro ${res.status}: resposta inválida do servidor`); }
      if (!res.ok) throw new Error(data.error || 'Erro na requisição');
      if (data && !data.success) throw new Error(data.error || 'Erro na requisição');
      return data;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Timeout na requisição (60s)');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const callWithLoading = useCallback(async (
    action: string,
    credentials?: { username: string; password: string } | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extra: Record<string, any> = {}
  ) => {
    setLoading(true);
    try {
      const result = await callProxy(action, credentials, extra);
      return result;
    } finally {
      setLoading(false);
    }
  }, [callProxy]);

  return { callProxy, callWithLoading, loading };
}
