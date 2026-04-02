// All available page keys for role-based access
export const ALL_PAGES = [
  { key: 'dashboard', label: 'Dashboard', path: '/' },
  { key: 'player', label: 'Consultar Jogador', path: '/player' },
  { key: 'transactions', label: 'Transações', path: '/transactions' },
  { key: 'segments', label: 'Segmentos', path: '/segments' },
  { key: 'campaigns', label: 'Campanhas', path: '/campaigns' },
  { key: 'partidas', label: 'Partidas', path: '/partidas' },
  { key: 'popups', label: 'Popups GTM', path: '/assets/popups' },
  { key: 'manage_users', label: 'Gestão de Usuários', path: '/admin/manage-users' },
] as const;

export type PageKey = typeof ALL_PAGES[number]['key'];
