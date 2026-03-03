import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, AlertTriangle, Globe,
  Search, LogOut, ChevronRight, Zap, Radar, UserSearch
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/batches', icon: Package, label: 'Lotes' },
  { to: '/player', icon: UserSearch, label: 'Consultar Jogador' },
  { to: '/duplicates', icon: AlertTriangle, label: 'Duplicados' },
];

const adminItems = [
  { to: '/admin/endpoints', icon: Globe, label: 'Endpoints' },
  { to: '/admin/bonus-rules', icon: Search, label: 'Regras de Bônus' },
  { to: '/admin/discovery', icon: Radar, label: 'Auto-Discovery' },
];

export function AppSidebar() {
  const location = useLocation();

  const linkClass = (path: string) => {
    const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
    return `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
      active
        ? 'bg-primary/10 text-primary glow-border'
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
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors w-full">
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}
