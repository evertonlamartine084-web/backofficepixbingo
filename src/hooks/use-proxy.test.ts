import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSavedCredentials, saveCredentials, clearCredentials } from './use-proxy';

describe('Credential Storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('retorna credenciais vazias quando nada salvo', () => {
    const creds = getSavedCredentials();
    expect(creds).toEqual({ username: '', password: '' });
  });

  it('salva e recupera credenciais', () => {
    saveCredentials('admin', 'senha123');
    const creds = getSavedCredentials();
    expect(creds.username).toBe('admin');
    expect(creds.password).toBe('senha123');
  });

  it('não armazena em texto puro no sessionStorage', () => {
    saveCredentials('admin', 'senha123');
    const raw = sessionStorage.getItem('pixbingo_creds_enc');
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('admin');
    expect(raw).not.toContain('senha123');
  });

  it('limpa credenciais com clearCredentials', () => {
    saveCredentials('admin', 'senha123');
    clearCredentials();
    const creds = getSavedCredentials();
    expect(creds).toEqual({ username: '', password: '' });
  });

  it('remove chave antiga não criptografada', () => {
    sessionStorage.setItem('pixbingo_creds', JSON.stringify({ username: 'old', password: 'old' }));
    getSavedCredentials();
    expect(sessionStorage.getItem('pixbingo_creds')).toBeNull();
  });

  it('expira credenciais após TTL', () => {
    saveCredentials('admin', 'senha123');

    // Simula que passou 2 horas modificando o item salvo
    const raw = sessionStorage.getItem('pixbingo_creds_enc');
    expect(raw).not.toBeNull();

    // Salva com expiração no passado
    const key = 'fallback-key-pixbingo-2024';
    const payload = JSON.stringify({ u: 'admin', p: 'senha123', exp: Date.now() - 1000 });
    const encoded = Array.from(payload).map((char, i) =>
      String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
    ).join('');
    sessionStorage.setItem('pixbingo_creds_enc', btoa(encoded));

    const creds = getSavedCredentials();
    expect(creds).toEqual({ username: '', password: '' });
  });

  it('retorna vazio se dados corrompidos', () => {
    sessionStorage.setItem('pixbingo_creds_enc', 'dados-invalidos!!!');
    const creds = getSavedCredentials();
    expect(creds).toEqual({ username: '', password: '' });
  });

  it('funciona com chave derivada do Supabase token', () => {
    localStorage.setItem('sb-urxbuiuwasvxwxuythzc-auth-token', JSON.stringify({
      access_token: 'abcdefghijklmnopqrstuvwxyz123456789',
    }));

    saveCredentials('user1', 'pass1');
    const creds = getSavedCredentials();
    expect(creds.username).toBe('user1');
    expect(creds.password).toBe('pass1');
  });
});
