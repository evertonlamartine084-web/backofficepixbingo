import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// All available page keys
export const ALL_PAGES = [
  { key: 'dashboard', label: 'Dashboard', path: '/' },
  { key: 'player', label: 'Consultar Jogador', path: '/player' },
  { key: 'transactions', label: 'Transações', path: '/transactions' },
  { key: 'segments', label: 'Segmentos', path: '/segments' },
  { key: 'campaigns', label: 'Campanhas', path: '/campaigns' },
  { key: 'partidas', label: 'Partidas', path: '/partidas' },
  { key: 'popups', label: 'Popups GTM', path: '/assets/popups' },
  { key: 'endpoints', label: 'Endpoints', path: '/admin/endpoints' },
  { key: 'discovery', label: 'Auto-Discovery', path: '/admin/discovery' },
  { key: 'manage_users', label: 'Gestão de Usuários', path: '/admin/manage-users' },
] as const;

export type PageKey = typeof ALL_PAGES[number]['key'];

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: string | null;
  allowedPages: PageKey[] | null; // null = all pages allowed
  hasAccess: (pageKey: PageKey) => boolean;
  hasAccessToPath: (path: string) => boolean;
  signOut: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  role: null,
  allowedPages: null,
  hasAccess: () => false,
  hasAccessToPath: () => false,
  signOut: async () => {},
  refreshPermissions: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [allowedPages, setAllowedPages] = useState<PageKey[] | null>(null);

  const fetchPermissions = useCallback(async () => {
    try {
      const { data, error } = await (supabase.rpc as any)('get_my_permissions');
      if (error) {
        console.error('Error fetching permissions:', error.message);
        return;
      }
      const result = data as any;
      setRole(result?.role || 'sem_role');
      setAllowedPages(result?.allowed_pages || null);
    } catch (e) {
      console.error('Error fetching permissions:', e);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchPermissions();
      } else {
        setRole(null);
        setAllowedPages(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchPermissions();
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchPermissions]);

  const hasAccess = useCallback((pageKey: PageKey): boolean => {
    // Admin role always has full access
    if (role === 'admin') return true;
    // null = all pages (backward compatible)
    if (allowedPages === null) return true;
    return allowedPages.includes(pageKey);
  }, [role, allowedPages]);

  const hasAccessToPath = useCallback((path: string): boolean => {
    if (role === 'admin') return true;
    if (allowedPages === null) return true;
    const page = ALL_PAGES.find(p => {
      if (p.path === '/') return path === '/';
      return path === p.path || path.startsWith(p.path + '/');
    });
    if (!page) return true; // Unknown route, let it through
    return allowedPages.includes(page.key);
  }, [role, allowedPages]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      role,
      allowedPages,
      hasAccess,
      hasAccessToPath,
      signOut,
      refreshPermissions: fetchPermissions,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
