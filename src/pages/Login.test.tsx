import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock dependencies
const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import Login from './Login';
import { toast } from 'sonner';

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza campos de email e senha', () => {
    mockUseAuth.mockReturnValue({ session: null, loading: false });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByText('Entrar')).toBeInTheDocument();
  });

  it('renderiza título PixBingoBR', () => {
    mockUseAuth.mockReturnValue({ session: null, loading: false });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByText('PixBingoBR')).toBeInTheDocument();
    expect(screen.getByText('Bonus Manager')).toBeInTheDocument();
  });

  it('retorna null enquanto loading', () => {
    mockUseAuth.mockReturnValue({ session: null, loading: true });

    const { container } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(container.innerHTML).toBe('');
  });

  it('mostra erro quando campos vazios', async () => {
    mockUseAuth.mockReturnValue({ session: null, loading: false });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.submit(screen.getByText('Entrar').closest('form')!);

    expect(toast.error).toHaveBeenCalledWith('Preencha email e senha');
  });

  it('redireciona quando já autenticado', () => {
    mockUseAuth.mockReturnValue({
      session: { user: { id: '1' } },
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Login />
      </MemoryRouter>
    );

    // Should not render the form
    expect(screen.queryByText('Entrar')).not.toBeInTheDocument();
  });
});
