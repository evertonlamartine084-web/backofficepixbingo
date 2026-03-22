import { describe, it, expect } from 'vitest';
import { getSavedCredentials, saveCredentials, clearCredentials } from './use-proxy';

describe('Credential Storage', () => {
  it('retorna credenciais auto quando nada salvo (centralizado no platform_config)', () => {
    const creds = getSavedCredentials();
    expect(creds).toEqual({ username: 'auto', password: 'auto' });
  });

  it('saveCredentials é no-op (credenciais centralizadas)', () => {
    saveCredentials('admin', 'senha123');
    const creds = getSavedCredentials();
    expect(creds).toEqual({ username: 'auto', password: 'auto' });
  });

  it('clearCredentials é no-op (credenciais centralizadas)', () => {
    saveCredentials('admin', 'senha123');
    clearCredentials();
    const creds = getSavedCredentials();
    expect(creds).toEqual({ username: 'auto', password: 'auto' });
  });
});
