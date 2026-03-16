import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_SITE = 'https://pixbingobr.concurso.club';
const DEFAULT_LOGIN = 'https://pixbingobr.concurso.club/login';

const CRED_KEY = 'pixbingo_creds_enc';
const CRED_TTL = 1000 * 60 * 60; // 1 hour expiry

// Simple XOR-based obfuscation using session token as key
// Not cryptographically strong, but prevents plain-text exposure in DevTools
function deriveKey(): string {
  try {
    const raw = localStorage.getItem('sb-urxbuiuwasvxwxuythzc-auth-token');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.access_token?.slice(0, 32) || 'fallback-key-pixbingo-2024';
    }
  } catch {}
  return 'fallback-key-pixbingo-2024';
}

function xorEncode(text: string, key: string): string {
  const encoded = Array.from(text).map((char, i) =>
    String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).join('');
  return btoa(encoded);
}

function xorDecode(encoded: string, key: string): string {
  const decoded = atob(encoded);
  return Array.from(decoded).map((char, i) =>
    String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).join('');
}

export function getSavedCredentials(): { username: string; password: string } {
  try {
    // Clean up old unencrypted key if it exists
    sessionStorage.removeItem('pixbingo_creds');

    const raw = sessionStorage.getItem(CRED_KEY);
    if (!raw) return { username: '', password: '' };

    const key = deriveKey();
    const decrypted = JSON.parse(xorDecode(raw, key));

    // Check expiry
    if (decrypted.exp && Date.now() > decrypted.exp) {
      sessionStorage.removeItem(CRED_KEY);
      return { username: '', password: '' };
    }

    return { username: decrypted.u || '', password: decrypted.p || '' };
  } catch {
    sessionStorage.removeItem(CRED_KEY);
    return { username: '', password: '' };
  }
}

export function saveCredentials(username: string, password: string) {
  const key = deriveKey();
  const payload = JSON.stringify({ u: username, p: password, exp: Date.now() + CRED_TTL });
  sessionStorage.setItem(CRED_KEY, xorEncode(payload, key));
}

export function clearCredentials() {
  sessionStorage.removeItem(CRED_KEY);
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
