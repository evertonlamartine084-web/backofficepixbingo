import { useState, useEffect } from 'react';
import { Search, User, DollarSign, Gift, History, Loader2, CreditCard, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiCredentialsBar } from '@/components/ApiCredentialsBar';
import { useProxy } from '@/hooks/use-proxy';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

export default function PlayerLookup() {
  const [searchParams] = useSearchParams();
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const { callProxy, loading: _l } = useProxy();
  const [loading, setLoading] = useState(false);
  const [creditLoading, setCreditLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [bonusAmount, setBonusAmount] = useState('10');

  const [player, setPlayer] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [transactions, setTransactions] = useState<any>(null);
  const [bonusHistory, setBonusHistory] = useState<any>(null);

  // Auto-search when navigated with ?q=
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && creds.username) {
      setQuery(q);
      handleSearch(q);
    }
  }, [searchParams, creds.username]);

  const handleSearch = async (q?: string) => {
    const searchQuery = q || query;
    if (!searchQuery || !creds.username) {
      toast.error('Preencha CPF/UUID e conecte-se');
      return;
    }

    setLoading(true);
    setPlayer(null); setBalance(null); setTransactions(null); setBonusHistory(null);

    try {
      const params = { cpf: searchQuery, uuid: searchQuery, player_id: searchQuery };
      const [searchRes, balanceRes, txRes, bonusRes] = await Promise.allSettled([
        callProxy('search_player', creds, params),
        callProxy('player_balance', creds, params),
        callProxy('player_transactions', creds, params),
        callProxy('bonus_history', creds, params),
      ]);

      if (searchRes.status === 'fulfilled' && searchRes.value?.data) setPlayer(searchRes.value.data);
      if (balanceRes.status === 'fulfilled' && balanceRes.value?.data) setBalance(balanceRes.value.data);
      if (txRes.status === 'fulfilled' && txRes.value?.data) setTransactions(txRes.value.data);
      if (bonusRes.status === 'fulfilled' && bonusRes.value?.data) setBonusHistory(bonusRes.value.data);

      toast.success('Dados carregados!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao buscar jogador');
    } finally {
      setLoading(false);
    }
  };

  const handleCreditBonus = async () => {
    if (!creds.username || !query) return;
    setCreditLoading(true);
    try {
      const res = await callProxy('credit_bonus', creds, {
        cpf: query, uuid: query, player_id: query,
        bonus_amount: parseFloat(bonusAmount)
      });
      const msg = res?.data?.msg || res?.data?.Msg || '';
      if (msg && (msg.includes('não tem permissão') || msg.includes('erro') || msg.includes('inválid'))) {
        toast.error(msg);
      } else if (res?.data) {
        toast.success(msg || 'Bônus creditado com sucesso!');
        handleSearch();
      } else {
        toast.error('Falha ao creditar bônus');
      }
    } catch (err: any) { toast.error(err.message); }
    finally { setCreditLoading(false); }
  };

  const handleCancelBonus = async (bonusId?: string) => {
    if (!creds.username || !query) return;
    setCancelLoading(true);
    try {
      const res = await callProxy('cancel_bonus', creds, {
        cpf: query, uuid: query, player_id: query, bonus_id: bonusId || ''
      });
      if (res?.data) {
        toast.success('Bônus cancelado!');
        handleSearch();
      } else {
        toast.error('Falha ao cancelar bônus');
      }
    } catch (err: any) { toast.error(err.message); }
    finally { setCancelLoading(false); }
  };

  const renderData = (data: any) => {
    if (!data) return <p className="text-sm text-muted-foreground italic">Sem dados</p>;
    const items = Array.isArray(data) ? data : data.data ? (Array.isArray(data.data) ? data.data : [data.data]) : [data];
    if (items.length === 0) return <p className="text-sm text-muted-foreground italic">Nenhum registro</p>;
    const keys = Object.keys(items[0] || {}).filter(k => !k.startsWith('_'));

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {keys.slice(0, 8).map(k => (
                <th key={k} className="text-left p-2 text-muted-foreground font-semibold uppercase tracking-wider">{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 50).map((item: any, i: number) => (
              <tr key={i} className="border-b border-border/30 hover:bg-secondary/20">
                {keys.slice(0, 8).map(k => (
                  <td key={k} className="p-2 font-mono text-foreground max-w-[200px] truncate">
                    {typeof item[k] === 'object' ? JSON.stringify(item[k]) : String(item[k] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {items.length > 50 && <p className="text-xs text-muted-foreground p-2">Mostrando 50 de {items.length}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Consultar Jogador</h1>
        <p className="text-sm text-muted-foreground mt-1">Buscar dados, saldo, transações e histórico de bônus</p>
      </div>

      <ApiCredentialsBar onCredentials={setCreds} />

      {/* Search */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="CPF ou UUID do jogador..."
              className="pl-9 bg-secondary border-border font-mono"
            />
          </div>
          <Button onClick={() => handleSearch()} disabled={loading} className="gradient-primary border-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
            Buscar
          </Button>
        </div>
      </div>

      {/* Results */}
      {(player || balance || transactions || bonusHistory) && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground">Dados do Jogador</h3>
              </div>
              {renderData(player)}
            </div>
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-success" />
                <h3 className="font-semibold text-foreground">Saldo</h3>
              </div>
              {renderData(balance)}
            </div>
          </div>

          {/* Credit & Cancel Bonus */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-accent" />
                <h3 className="font-semibold text-foreground">Ações de Bônus</h3>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Valor (R$)</Label>
                  <Input type="number" value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} className="w-24 bg-secondary border-border font-mono" />
                </div>
                <Button onClick={handleCreditBonus} disabled={creditLoading} className="gradient-success border-0 text-success-foreground">
                  {creditLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
                  Creditar
                </Button>
                <Button onClick={() => handleCancelBonus()} disabled={cancelLoading} variant="destructive">
                  {cancelLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Cancelar Bônus
                </Button>
              </div>
            </div>
          </div>

          {/* Bonus History */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Gift className="w-4 h-4 text-warning" />
              <h3 className="font-semibold text-foreground">Histórico de Bônus</h3>
            </div>
            {renderData(bonusHistory)}
          </div>

          {/* Transactions */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-info" />
              <h3 className="font-semibold text-foreground">Transações</h3>
            </div>
            {renderData(transactions)}
          </div>
        </div>
      )}
    </div>
  );
}
