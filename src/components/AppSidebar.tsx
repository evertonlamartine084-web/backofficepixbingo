import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Code,
  LogOut, ChevronRight, ChevronDown, Zap, UserSearch,
  ArrowUpDown, ListFilter, ShieldCheck, Megaphone, Gamepad2,
  MessageSquare, Package, User, RotateCcw, ScrollText,
  Award, Target, Swords, RotateCw, Star, ShoppingBag,
  Bell, Inbox, Trophy,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/player', icon: UserSearch, label: 'Consultar Jogador' },
  { to: '/transactions', icon: ArrowUpDown, label: 'Transações' },
  { to: '/segments', icon: ListFilter, label: 'Segmentos' },
  { to: '/campaigns', icon: Megaphone, label: 'Campanhas' },
  { to: '/cashback', icon: RotateCcw, label: 'Cashback' },
  { to: '/partidas', icon: Gamepad2, label: 'Partidas' },
];

const assetsItems = [
  { to: '/assets/html', icon: Code, label: 'Assets HTML' },
  { to: '/assets/popups', icon: MessageSquare, label: 'Popups GTM' },
  { to: '/assets/levels', icon: Star, label: 'Níveis' },
  { to: '/assets/store', icon: ShoppingBag, label: 'Loja' },
  { to: '/assets/push', icon: Bell, label: 'Push Notifications' },
  { to: '/assets/inbox', icon: Inbox, label: 'Inbox' },
];

const gamificationItems = [
  { to: '/gamification/achievements', icon: Award, label: 'Conquistas' },
  { to: '/gamification/missions', icon: Target, label: 'Missões' },
  { to: '/gamification/tournaments', icon: Swords, label: 'Torneios' },
  { to: '/gamification/wheel', icon: RotateCw, label: 'Roleta Diária' },
];

const adminItems = [
  { to: '/admin/manage-users', icon: ShieldCheck, label: 'Gestão de Usuários' },
  { to: '/admin/audit', icon: ScrollText, label: 'Log de Auditoria' },
];

const profileQuickLinks = [
  { to: '/profile', icon: User, label: 'Meu Perfil' },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  const isAssetsRoute = location.pathname.startsWith('/assets');
  const isGamificationRoute = location.pathname.startsWith('/gamification');
  const [assetsOpen, setAssetsOpen] = useState(isAssetsRoute);
  const [gamificationOpen, setGamificationOpen] = useState(isGamificationRoute);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const userInitials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : 'U';

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

        {/* Gamification collapsible group */}
        <div className="pt-1">
          <button
            onClick={() => setGamificationOpen(o => !o)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full ${
              isGamificationRoute
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <Trophy className="w-4 h-4" />
            Gamificação
            {gamificationOpen ? (
              <ChevronDown className="w-3 h-3 ml-auto" />
            ) : (
              <ChevronRight className="w-3 h-3 ml-auto" />
            )}
          </button>
          {gamificationOpen && (
            <div className="ml-3 pl-3 border-l border-border space-y-0.5 mt-1">
              {gamificationItems.map((item) => (
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

      {/* Profile dropdown footer */}
      <div className="p-3 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm w-full hover:bg-secondary transition-colors">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user?.email?.split('@')[0] ?? 'Usuário'}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
              </div>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56 mb-1">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{user?.email?.split('@')[0]}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {profileQuickLinks.map((item) => (
              <DropdownMenuItem
                key={item.to}
                className="cursor-pointer gap-2"
                onClick={() => navigate(item.to)}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-destructive focus:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
