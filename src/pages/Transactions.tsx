import { useState } from 'react';
import { Search, ArrowUpDown, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiCredentialsBar } from '@/components/ApiCredentialsBar';
import { useProxy } from '@/hooks/use-proxy';
import { toast } from 'sonner';

export default function Transactions() {
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [txData, setTxData] = useState<any>(null);
  const { callWithLoading, loading } = useProxy();

  const handleFetch = async (search = '') => {
    if (!creds.username) { toast.error('Conecte-se primeiro'); return; }
    try {
      const res = await callWithLoading('list_transactions', creds, { search, page: 1, limit: 100 });
      setTxData(res?.data);
      toast.success('Transações carregadas!');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const items = !txData ? [] : Array.isArray(txData) ? txData : txData.data ? (Array.isArray(txData.data) ? txData.data : [txData.data]) : [txData];
  const keys = items.length > 0 ? Object.keys(items[0]).filter(k => !k.startsWith('_')).slice(0, 10) : [];

  // Try to detect value column for coloring
  const valueKey = keys.find(k => ['valor', 'value', 'amount', 'saldo'].includes(k.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Transações</h1>
        <p className="text-sm text-muted-foreground mt-1">Histórico global de transações do site</p>
      </div>

      <ApiCredentialsBar onCredentials={setCreds} />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por CPF, UUID, ID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFetch(searchTerm)}
            className="pl-9 bg-secondary border-border"
          />
        </div>
        <Button onClick={() => handleFetch(searchTerm)} disabled={loading} className="gradient-primary border-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowUpDown className="w-4 h-4 mr-2" />}
          Carregar
        </Button>
        <Button variant="outline" onClick={() => handleFetch(searchTerm)} disabled={loading} className="border-border">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {txData !== null && (
        <div className="glass-card overflow-hidden">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma transação encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    {keys.map(k => (
                      <th key={k} className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 200).map((item: any, i: number) => (
                    <tr key={i} className="border-b border-border/20 hover:bg-secondary/20 transition-colors">
                      {keys.map(k => {
                        const val = item[k];
                        let className = "p-3 font-mono text-xs text-foreground max-w-[200px] truncate";
                        if (valueKey && k === valueKey && typeof val === 'number') {
                          className += val >= 0 ? ' text-success' : ' text-destructive';
                        }
                        return (
                          <td key={k} className={className}>
                            {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length > 200 && <p className="text-xs text-muted-foreground p-3">Mostrando 200 de {items.length}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
