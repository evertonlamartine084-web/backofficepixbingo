import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock useAuth before importing ProtectedRoute
const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import { ProtectedRoute } from './ProtectedRoute';

describe('ProtectedRoute', () => {
  it('mostra loading spinner quando carregando', () => {
    mockUseAuth.mockReturnValue({ session: null, loading: true });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    // Loader2 renders as SVG, check for the spinner container
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renderiza children quando autenticado', () => {
    mockUseAuth.mockReturnValue({
      session: { user: { id: '1', email: 'test@test.com' } },
      loading: false,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redireciona para /login quando não autenticado', () => {
    mockUseAuth.mockReturnValue({ session: null, loading: false });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
