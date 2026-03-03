import { useState } from 'react';
import { Search, Users as UsersIcon, Loader2, UserSearch, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiCredentialsBar } from '@/components/ApiCredentialsBar';
import { useProxy } from '@/hooks/use-proxy';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function Users() {
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<any>(null);
  const { callWithLoading, loading } = useProxy();
  const navigate = useNavigate();

  const handleFetch = async (search = '') => {
    if (!creds.username) { toast.error('Conecte-se primeiro'); return; }
    try {
      const res = await callWithLoading('list_users', creds, { search, page: 1, limit: 100 });
      setUsers(res?.data);
      toast.success('Usuários carregados!');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const items = !users ? [] : Array.isArray(users) ? users : users.data ? (Array.isArray(users.data) ? users.data : [users.data]) : [users];
  const keys = items.length > 0 ? Object.keys(items[0]).filter(k => !k.startsWith('_')).slice(0, 10) : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usuários</h1>
        <p className="text-sm text-muted-foreground mt-1">Lista de todos os usuários do site</p>
      </div>

      <ApiCredentialsBar onCredentials={setCreds} />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF, email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFetch(searchTerm)}
            className="pl-9 bg-secondary border-border"
          />
        </div>
        <Button onClick={() => handleFetch(searchTerm)} disabled={loading} className="gradient-primary border-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UsersIcon className="w-4 h-4 mr-2" />}
          Carregar
        </Button>
        <Button variant="outline" onClick={() => handleFetch(searchTerm)} disabled={loading} className="border-border">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {users !== null && (
        <div className="glass-card overflow-hidden">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum usuário encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    {keys.map(k => (
                      <th key={k} className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{k}</th>
                    ))}
                    <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 100).map((item: any, i: number) => (
                    <tr key={i} className="border-b border-border/20 hover:bg-secondary/20 transition-colors">
                      {keys.map(k => (
                        <td key={k} className="p-3 font-mono text-xs text-foreground max-w-[200px] truncate">
                          {typeof item[k] === 'object' ? JSON.stringify(item[k]) : String(item[k] ?? '—')}
                        </td>
                      ))}
                      <td className="p-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-primary"
                          onClick={() => {
                            const cpf = item.cpf || item.documento || item.CPF || '';
                            const uuid = item.uuid || item.id || item.ID || '';
                            navigate(`/player?q=${cpf || uuid}`);
                          }}
                        >
                          <UserSearch className="w-3 h-3 mr-1" /> Detalhar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length > 100 && <p className="text-xs text-muted-foreground p-3">Mostrando 100 de {items.length}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
