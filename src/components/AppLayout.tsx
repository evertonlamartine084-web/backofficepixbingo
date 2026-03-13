import { Outlet, useLocation } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldX } from 'lucide-react';

export function AppLayout() {
  const { hasAccessToPath } = useAuth();
  const location = useLocation();
  const allowed = hasAccessToPath(location.pathname);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 ml-64 p-6 overflow-auto">
        {allowed ? (
          <Outlet />
        ) : (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-4">
              <ShieldX className="w-16 h-16 mx-auto text-destructive/60" />
              <h1 className="text-2xl font-bold text-foreground">Acesso Negado</h1>
              <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
              <p className="text-sm text-muted-foreground">Solicite ao administrador que libere seu acesso.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
