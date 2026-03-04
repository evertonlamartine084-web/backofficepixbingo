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
  const [searchCpf, setSearchCpf] = useState('');
  const [searchUsername, setSearchUsername] = useState('');
  const [users, setUsers] = useState<any>(null);
  const [totals, setTotals] = useState<any>(null);
  const { callWithLoading, loading } = useProxy();
  const navigate = useNavigate();

  const handleFetch = async () => {
    if (!creds.username) { toast.error('Conecte-se primeiro'); return; }
    try {
      const res = await callWithLoading('list_users', creds, {
        busca_cpf: searchCpf,
        busca_username: searchUsername,
        draw: 1, start: 0, length: 100,
      });
      const data = res?.data;
      const rows = data?.data || data?.aaData || [];
      if (rows.length > 0) {
        setUsers(rows);
        setTotals(data.totais?.[0] || null);
        toast.success(`${data.iTotalRecords || data.recordsTotal || rows.length} usuários encontrados`);
      } else {
        setUsers([]);
        toast.warning('Nenhum dado retornado');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const items = Array.isArray(users) ? users : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usuários</h1>
        <p className="text-sm text-muted-foreground mt-1">Lista de todos os usuários do site</p>
      </div>

      <ApiCredentialsBar onCredentials={setCreds} />

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Novos Cadastros', value: totals.novos_cadastros },
            { label: 'Total Cadastros', value: totals.total_cadastros },
            { label: 'Ativos', value: totals.total_ativos },
            { label: 'Inativos', value: totals.total_inativos },
          ].map(s => (
            <div key={s.label} className="glass-card p-3 text-center">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold text-foreground">{s.value ?? '—'}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar CPF..."
            value={searchCpf}
            onChange={e => setSearchCpf(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFetch()}
            className="pl-9 bg-secondary border-border"
          />
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Input
            placeholder="Buscar username..."
            value={searchUsername}
            onChange={e => setSearchUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFetch()}
            className="bg-secondary border-border"
          />
        </div>
        <Button onClick={handleFetch} disabled={loading} className="gradient-primary border-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UsersIcon className="w-4 h-4 mr-2" />}
          Carregar
        </Button>
        <Button variant="outline" onClick={handleFetch} disabled={loading} className="border-border">
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
                    <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Username</th>
                    <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Telefone</th>
                    <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">CPF</th>
                    <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Criação</th>
                    <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ult Login</th>
                    <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Situação</th>
                    <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((user: any, i: number) => (
                    <tr key={user.uuid || i} className="border-b border-border/20 hover:bg-secondary/20 transition-colors">
                      <td className="p-3 font-mono text-xs text-foreground">{user.username || '—'}</td>
                      <td className="p-3 font-mono text-xs text-foreground">{user.celular || '—'}</td>
                      <td className="p-3 font-mono text-xs text-foreground">{user.cpf || '—'}</td>
                      <td className="p-3 text-xs text-foreground">{user.created_at || '—'}</td>
                      <td className="p-3 text-xs text-foreground">{user.ultimo_login || '—'}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.situacao === 'Ativo' || user.ativo === 1
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {user.situacao || (user.ativo === 1 ? 'Ativo' : 'Inativo')}
                        </span>
                      </td>
                      <td className="p-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-primary"
                          onClick={() => navigate(`/player?q=${user.uuid || user.cpf || ''}`)}
                        >
                          <UserSearch className="w-3 h-3 mr-1" /> Detalhar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
