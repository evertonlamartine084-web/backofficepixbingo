import { useState } from 'react';
import { Search, User, DollarSign, Gift, History, Loader2, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const DEFAULT_SITE = 'https://pixbingobr.com';
const DEFAULT_LOGIN = 'https://pixbingobr.com/api/auth/login';

export default function PlayerLookup() {
  const [query, setQuery] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [creditLoading, setCreditLoading] = useState(false);
  const [bonusAmount, setBonusAmount] = useState('10');

  const [player, setPlayer] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [transactions, setTransactions] = useState<any>(null);
  const [bonusHistory, setBonusHistory] = useState<any>(null);

  const callProxy = async (action: string, extra: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke('pixbingo-proxy', {
      body: {
        action,
        site_url: DEFAULT_SITE,
        login_url: DEFAULT_LOGIN,
        username,
        password,
        ...extra,
      },
    });
    if (error) throw error;
    return data;
  };

  const handleSearch = async () => {
    if (!query || !username || !password) {
      toast.error('Preencha CPF/UUID, usuário e senha');
      return;
    }

    setLoading(true);
    setPlayer(null);
    setBalance(null);
    setTransactions(null);
    setBonusHistory(null);

    try {
      const [searchRes, balanceRes, txRes, bonusRes] = await Promise.allSettled([
        callProxy('search_player', { cpf: query, uuid: query }),
        callProxy('player_balance', { cpf: query, uuid: query, player_id: query }),
        callProxy('player_transactions', { cpf: query, uuid: query, player_id: query }),
        callProxy('bonus_history', { cpf: query, uuid: query, player_id: query }),
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
    if (!username || !password || !query) return;
    setCreditLoading(true);
    try {
      const res = await callProxy('credit_bonus', { 
        cpf: query, uuid: query, player_id: query, 
        bonus_amount: parseFloat(bonusAmount) 
      });
      if (res?.data) {
        toast.success('Bônus creditado com sucesso!');
        console.log('Credit result:', res.data);
      } else {
        toast.error('Falha ao creditar bônus');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreditLoading(false);
    }
  };

  const renderData = (data: any, label: string) => {
    if (!data) return <p className="text-sm text-muted-foreground italic">Sem dados</p>;

    // If it's an array, render as table
    const items = Array.isArray(data) ? data : data.data ? (Array.isArray(data.data) ? data.data : [data.data]) : [data];

    if (items.length === 0) return <p className="text-sm text-muted-foreground italic">Nenhum registro encontrado</p>;

    // Extract keys from first item
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
        {items.length > 50 && <p className="text-xs text-muted-foreground p-2">Mostrando 50 de {items.length} registros</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Consultar Jogador</h1>
        <p className="text-sm text-muted-foreground mt-1">Buscar dados, saldo, transações e histórico de bônus</p>
      </div>

      {/* Auth + Search */}
      <div className="glass-card p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Usuário Admin</Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" className="mt-1 bg-secondary border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Senha</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••" className="mt-1 bg-secondary border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">CPF ou UUID</Label>
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="12345678901 ou uuid..." className="mt-1 bg-secondary border-border font-mono" />
          </div>
          <div className="flex items-end">
            <Button onClick={handleSearch} disabled={loading} className="w-full gradient-primary border-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              Buscar
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      {(player || balance || transactions || bonusHistory) && (
        <div className="space-y-4">
          {/* Player Info + Balance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground">Dados do Jogador</h3>
              </div>
              {renderData(player, 'jogador')}
            </div>
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-success" />
                <h3 className="font-semibold text-foreground">Saldo</h3>
              </div>
              {renderData(balance, 'saldo')}
            </div>
          </div>

          {/* Credit Bonus */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-accent" />
                <h3 className="font-semibold text-foreground">Creditar Bônus</h3>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Valor (R$)</Label>
                  <Input type="number" value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} className="w-24 bg-secondary border-border font-mono" />
                </div>
                <Button onClick={handleCreditBonus} disabled={creditLoading} className="gradient-success border-0 text-success-foreground">
                  {creditLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
                  Creditar
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
            {renderData(bonusHistory, 'bonus')}
          </div>

          {/* Transactions */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-info" />
              <h3 className="font-semibold text-foreground">Transações</h3>
            </div>
            {renderData(transactions, 'transações')}
          </div>
        </div>
      )}
    </div>
  );
}
