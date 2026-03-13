import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// All available page keys (exported for ManageUsers)
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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Safety timeout - never stay loading forever
    const timeout = setTimeout(() => setLoading(false), 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
      clearTimeout(timeout);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      clearTimeout(timeout);
    }).catch(() => {
      setLoading(false);
      clearTimeout(timeout);
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
