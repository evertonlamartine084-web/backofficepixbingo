/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

// Use vi.hoisted so these are available inside vi.mock factory (which is hoisted)
const { mockUnsubscribe, mockGetSession, mockSignOut, getAuthStateCallback, setAuthStateCallback } = vi.hoisted(() => {
  let _authStateCallback: ((event: string, session: any) => void) | null = null;
  return {
    mockUnsubscribe: vi.fn(),
    mockGetSession: vi.fn(),
    mockSignOut: vi.fn().mockResolvedValue({ error: null }),
    getAuthStateCallback: () => _authStateCallback,
    setAuthStateCallback: (cb: any) => { _authStateCallback = cb; },
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((callback: any) => {
        setAuthStateCallback(callback);
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      }),
      getSession: () => mockGetSession(),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      signOut: mockSignOut,
    },
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

vi.mock('@/hooks/use-proxy', () => ({
  clearCredentials: vi.fn(),
}));

vi.mock('@/hooks/use-audit', () => ({
  logAudit: vi.fn(),
}));

import { AuthProvider, useAuth } from './AuthContext';

// Helper component to consume and display auth context values
function AuthConsumer() {
  const { session, user, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="session">{session ? 'has-session' : 'no-session'}</span>
      <span data-testid="user">{user?.email || 'no-user'}</span>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthStateCallback(null);
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });
  });

  it('renderiza children corretamente', async () => {
    render(
      <AuthProvider>
        <div>Child Content</div>
      </AuthProvider>,
    );

    expect(screen.getByText('Child Content')).toBeInTheDocument();
  });

  it('inicia com loading=true e depois muda para false', async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    // After getSession resolves, loading should become false
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
  });

  it('define session quando getSession retorna sessão válida', async () => {
    const mockSession = {
      user: { id: 'user-1', email: 'test@example.com' },
      access_token: 'token',
    };
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('session').textContent).toBe('has-session');
      expect(screen.getByTestId('user').textContent).toBe('test@example.com');
    });
  });

  it('mostra no-session quando não há sessão', async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('session').textContent).toBe('no-session');
      expect(screen.getByTestId('user').textContent).toBe('no-user');
    });
  });

  it('atualiza session quando onAuthStateChange dispara', async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // Simulate auth state change
    const newSession = {
      user: { id: 'user-2', email: 'new@example.com' },
      access_token: 'new-token',
    };
    act(() => {
      const cb = getAuthStateCallback();
      cb?.('SIGNED_IN', newSession);
    });

    expect(screen.getByTestId('session').textContent).toBe('has-session');
    expect(screen.getByTestId('user').textContent).toBe('new@example.com');
  });

  it('define loading=false mesmo quando getSession falha', async () => {
    mockGetSession.mockRejectedValue(new Error('Network error'));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
  });

  it('useAuth sem provider retorna valores default', () => {
    // Rendering AuthConsumer without AuthProvider uses context defaults
    render(<AuthConsumer />);

    expect(screen.getByTestId('loading').textContent).toBe('true');
    expect(screen.getByTestId('session').textContent).toBe('no-session');
  });
});
