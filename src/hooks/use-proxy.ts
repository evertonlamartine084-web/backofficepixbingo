import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const DEFAULT_SITE = 'https://pixbingobr.concurso.club';
const DEFAULT_LOGIN = 'https://pixbingobr.concurso.club/login';

// Persist credentials in sessionStorage so user doesn't retype every page
const CRED_KEY = 'pixbingo_creds';

export function getSavedCredentials() {
  try {
    const raw = sessionStorage.getItem(CRED_KEY);
    if (raw) return JSON.parse(raw) as { username: string; password: string };
  } catch {}
  return { username: '', password: '' };
}

export function saveCredentials(username: string, password: string) {
  sessionStorage.setItem(CRED_KEY, JSON.stringify({ username, password }));
}

export function useProxy() {
  const [loading, setLoading] = useState(false);

  const callProxy = useCallback(async (
    action: string,
    credentials: { username: string; password: string },
    extra: Record<string, any> = {}
  ) => {
    const { data, error } = await supabase.functions.invoke('pixbingo-proxy', {
      body: {
        action,
        site_url: DEFAULT_SITE,
        login_url: DEFAULT_LOGIN,
        username: credentials.username,
        password: credentials.password,
        ...extra,
      },
    });
    if (error) throw error;
    if (data && !data.success) throw new Error(data.error || 'Erro na requisição');
    return data;
  }, []);

  const callWithLoading = useCallback(async (
    action: string,
    credentials: { username: string; password: string },
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
