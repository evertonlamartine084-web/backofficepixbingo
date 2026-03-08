import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Globe,
  LogOut, ChevronRight, ChevronDown, Zap, Radar, UserSearch,
  ArrowUpDown, ListFilter, ShieldCheck, Megaphone, Gamepad2,
  MessageSquare, Mail, Bell, Trophy, ShoppingBag, Package
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/player', icon: UserSearch, label: 'Consultar Jogador' },
  { to: '/transactions', icon: ArrowUpDown, label: 'Transações' },
  { to: '/segments', icon: ListFilter, label: 'Segmentos' },
  { to: '/campaigns', icon: Megaphone, label: 'Campanhas' },
  { to: '/partidas', icon: Gamepad2, label: 'Partidas' },
];

const assetsItems = [
  { to: '/assets/popups', icon: MessageSquare, label: 'Popups GTM' },
  { to: '/assets/inbox', icon: Mail, label: 'Inbox' },
  { to: '/assets/push', icon: Bell, label: 'Push' },
  { to: '/assets/levels', icon: Trophy, label: 'Níveis' },
  { to: '/assets/store', icon: ShoppingBag, label: 'Loja' },
];

const adminItems = [
  { to: '/admin/endpoints', icon: Globe, label: 'Endpoints' },
  { to: '/admin/discovery', icon: Radar, label: 'Auto-Discovery' },
  { to: '/admin/manage-users', icon: ShieldCheck, label: 'Gestão de Usuários' },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  const isAssetsRoute = location.pathname.startsWith('/assets');
  const [assetsOpen, setAssetsOpen] = useState(isAssetsRoute);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const linkClass = (path: string) => {
    const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
    return `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
      active
        ? 'bg-primary/10 text-primary glow-border'
        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
    }`;
  };

  const subLinkClass = (path: string) => {
    const active = location.pathname === path;
    return `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 group ${
      active
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
    }`;
  };

  return (
    <aside className="w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col fixed left-0 top-0 z-30">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground tracking-tight">PixBingoBR</h1>
            <p className="text-[11px] text-muted-foreground">Bonus Manager</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Operações
        </p>
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass(item.to)}>
            <item.icon className="w-4 h-4" />
            {item.label}
            <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </NavLink>
        ))}

        {/* Assets collapsible group */}
        <div className="pt-1">
          <button
            onClick={() => setAssetsOpen(o => !o)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full ${
              isAssetsRoute
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <Package className="w-4 h-4" />
            Assets
            {assetsOpen ? (
              <ChevronDown className="w-3 h-3 ml-auto" />
            ) : (
              <ChevronRight className="w-3 h-3 ml-auto" />
            )}
          </button>
          {assetsOpen && (
            <div className="ml-3 pl-3 border-l border-border space-y-0.5 mt-1">
              {assetsItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={subLinkClass(item.to)}>
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        <div className="pt-4">
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Administração
          </p>
          {adminItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass(item.to)}>
              <item.icon className="w-4 h-4" />
              {item.label}
              <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        {user && (
          <p className="px-3 pb-2 text-[10px] text-muted-foreground truncate">{user.email}</p>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}
