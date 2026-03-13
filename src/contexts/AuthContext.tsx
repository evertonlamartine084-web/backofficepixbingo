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
  hasAccess: () => true, // Default to true while loading
  hasAccessToPath: () => true,
  signOut: async () => {},
  refreshPermissions: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [allowedPages, setAllowedPages] = useState<PageKey[] | null>(null);

  const fetchPermissions = useCallback(async (userId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('user_roles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) {
        console.error('Error fetching permissions:', error?.message);
        setRole('sem_role');
        return;
      }
      setRole(data.role || 'sem_role');
      // allowed_pages may not exist if migration hasn't run
      setAllowedPages((data.allowed_pages as PageKey[] | null) ?? null);
    } catch (e) {
      console.error('Error fetching permissions:', e);
      setRole('sem_role');
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
      if (session?.user?.id) {
        // Fire and forget - don't block rendering
        fetchPermissions(session.user.id);
      } else {
        setRole(null);
        setAllowedPages(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user?.id) {
        fetchPermissions(session.user.id);
      }
    }).catch(() => {
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchPermissions]);

  const hasAccess = useCallback((pageKey: PageKey): boolean => {
    if (role === 'admin') return true;
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
    if (!page) return true;
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
      refreshPermissions: () => session?.user?.id ? fetchPermissions(session.user.id) : Promise.resolve(),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
