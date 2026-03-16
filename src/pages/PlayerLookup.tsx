import { useState, useEffect } from 'react';
import { Search, User, DollarSign, Gift, History, Loader2, CreditCard, XCircle, Wallet, Calendar, Phone, Mail, Shield, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiCredentialsBar } from '@/components/ApiCredentialsBar';
import { useProxy } from '@/hooks/use-proxy';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PaginatedTable } from '@/components/PaginatedTable';
import { formatBRL, parseBRL, formatDateTime, formatCPF } from '@/lib/formatters';

const fmtBRL = (v: any) => {
  const n = parseBRL(v);
  if (n === 0 && v !== 0 && v !== '0') return v ?? '—';
  return formatBRL(n);
};

// Player info field config
const playerFields = [
  { key: 'username', label: 'Usuário', icon: User },
  { key: 'cpf', label: 'CPF', icon: Hash, format: formatCPF },
  { key: 'celular', label: 'Celular', icon: Phone },
  { key: 'email', label: 'E-mail', icon: Mail },
  { key: 'created_at', label: 'Cadastro', icon: Calendar, format: formatDateTime },
  { key: 'ultimo_login', label: 'Último Login', icon: Calendar, format: formatDateTime },
  { key: 'situacao', label: 'Situação', icon: Shield },
  { key: 'uuid', label: 'UUID', icon: Hash },
];

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
      const searchRes = await callProxy('search_player', creds, { cpf: searchQuery, uuid: searchQuery });
      const playerData = searchRes?.data;

      // Check if no results or CPF doesn't match the searched value
      const aaData = playerData?.aaData || playerData?.data || [];
      const foundPlayer = Array.isArray(aaData) && aaData.length > 0 ? aaData[0] : null;

      if (!foundPlayer || (Array.isArray(aaData) && aaData.length === 0)) {
        toast.warning('CPF/UUID não encontrado na base');
        setLoading(false);
        return;
      }

      // Verify the returned player actually matches the query (prevent random results)
      const queryCleaned = searchQuery.replace(/\D/g, '');
      const foundCpf = String(foundPlayer.cpf || '').replace(/\D/g, '');
      const foundUuid = String(foundPlayer.uuid || '');
      const isMatch = (queryCleaned && foundCpf && foundCpf.includes(queryCleaned)) ||
                      (queryCleaned && foundCpf && queryCleaned.includes(foundCpf)) ||
                      searchQuery.includes('-') && foundUuid === searchQuery;

      if (!isMatch && queryCleaned.length >= 5) {
        toast.warning('CPF/UUID não encontrado na base. O resultado retornado não corresponde à busca.');
        setLoading(false);
        return;
      }

      if (playerData) setPlayer(playerData);
      const realUuid = foundPlayer?.uuid || searchQuery;

      const detailParams = { uuid: realUuid, player_id: realUuid, cpf: searchQuery };
      const txRes = await callProxy('player_transactions', creds, detailParams);
      const txData = txRes?.data;

      if (txData) {
        if (txData.movimentacoes) setBonusHistory(txData.movimentacoes);
        if (txData.historico) setTransactions(txData.historico);
        if (txData.carteiras) {
          console.log('[DEBUG] carteiras raw:', JSON.stringify(txData.carteiras));
          setBalance(txData.carteiras);
        }
      }

      toast.success('Dados carregados!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao buscar jogador');
    } finally {
      setLoading(false);
    }
  };

  const handleCreditBonus = async () => {
    if (!creds.username || !query) return;
    const playerData = player?.aaData?.[0] || player;
    const playerUuid = playerData?.uuid || query;
    setCreditLoading(true);
    try {
      const res = await callProxy('credit_bonus', creds, {
        uuid: playerUuid, player_id: playerUuid,
        bonus_amount: parseFloat(bonusAmount),
        carteira: 'BONUS',
      });
      const msg = res?.data?.msg || res?.data?.Msg || '';
      const isError = msg && (
        msg.toLowerCase().includes('não tem permissão') ||
        msg.toLowerCase().includes('erro') ||
        msg.toLowerCase().includes('inválid') ||
        msg.toLowerCase().includes('falha')
      );
      if (isError) {
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
      const msg = res?.data?.msg || res?.data?.Msg || '';
      if (msg) {
        toast.warning(msg);
      } else {
        toast.error('Falha ao cancelar bônus');
      }
    } catch (err: any) { toast.error(err.message); }
    finally { setCancelLoading(false); }
  };

  // Extract player object from search results
  const playerInfo = player?.aaData?.[0] || player?.data?.[0] || null;

  // Normalize balance into array of { name, value }
  const balanceItems: { name: string; value: number }[] = (() => {
    if (!balance) return [];
    
    // If it's a string (HTML or raw text), can't parse
    if (typeof balance === 'string') return [];

    // If it's an array of objects like [{carteira: 'BONUS', saldo: 10}, ...]
    if (Array.isArray(balance)) {
      return balance
        .filter((b: any) => b && typeof b === 'object')
        .map((b: any) => {
          const name = b.nome || b.name || b.tipo || b.carteira || b.descricao || '—';
          let val = b.saldo ?? b.valor ?? b.value ?? b.balance ?? 0;
          return { name: String(name), value: parseBRL(val) || 0 };
        });
    }
    
    // If it's an object, filter out internal keys
    if (typeof balance === 'object' && balance !== null) {
      return Object.entries(balance)
        .filter(([k]) => !k.startsWith('_') && k !== 'DT_RowId')
        .map(([k, v]: [string, any]) => {
          if (v === null || v === undefined) return { name: k, value: 0 };
          if (typeof v === 'number') return { name: k, value: v };
          if (typeof v === 'string') {
            return { name: k, value: parseBRL(v) || 0 };
          }
          if (typeof v === 'object') {
            let val = v.saldo ?? v.valor ?? v.value ?? v.balance ?? 0;
            return { name: v.nome || v.name || v.carteira || k, value: parseBRL(val) || 0 };
          }
          return { name: k, value: 0 };
        });
    }
    
    return [];
  })();
  
  // Raw balance fallback for debugging
  const balanceRaw = balance && balanceItems.length === 0 ? JSON.stringify(balance, null, 2) : null;

  // Normalize history arrays
  const normalizeList = (data: any): any[] => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.aaData && Array.isArray(data.aaData)) return data.aaData;
    return [data];
  };

  const bonusList = normalizeList(bonusHistory);
  const txList = normalizeList(transactions);

  // Detect column keys from first item
  const getColumns = (list: any[]) => {
    if (list.length === 0) return [];
    return Object.keys(list[0]).filter(k => !k.startsWith('_') && k !== 'DT_RowId');
  };

  // Smart formatting for known column patterns
  const fmtCell = (key: string, val: any) => {
    if (val === null || val === undefined) return '—';
    const kl = key.toLowerCase();
    if (kl.includes('valor') || kl.includes('saldo') || kl.includes('amount') || kl.includes('deposito') || kl.includes('saque') || kl.includes('bonus') || kl.includes('comissao') || kl.includes('lucro') || kl.includes('ggr') || kl.includes('premio')) {
      const n = parseBRL(val);
      if (!isNaN(n)) return fmtBRL(n);
    }
    if (kl.includes('data') || kl.includes('date') || kl.includes('created') || kl.includes('updated') || kl === 'ultimo_login') {
      return formatDateTime(val);
    }
    if (kl === 'cpf') return formatCPF(val);
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  // Friendly column labels
  const friendlyLabel = (key: string) => {
    const map: Record<string, string> = {
      username: 'Usuário', cpf: 'CPF', celular: 'Celular', email: 'E-mail',
      created_at: 'Data Criação', ultimo_login: 'Último Login', situacao: 'Situação',
      uuid: 'UUID', tipo: 'Tipo', valor: 'Valor', saldo_anterior: 'Saldo Anterior',
      saldo_posterior: 'Saldo Posterior', descricao: 'Descrição', status: 'Status',
      id: 'ID', data: 'Data', nome: 'Nome', carteira: 'Carteira', saldo: 'Saldo',
    };
    return map[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const situacaoColor = (s: any) => {
    const v = String(s).toLowerCase();
    if (v === 'ativo' || v === 'active') return 'bg-success/20 text-success';
    if (v === 'inativo' || v === 'inactive' || v === 'bloqueado') return 'bg-destructive/20 text-destructive';
    return 'bg-muted text-muted-foreground';
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
          {/* Player Info Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground text-lg">Dados do Jogador</h3>
                {playerInfo?.situacao && (
                  <Badge className={`ml-auto ${situacaoColor(playerInfo.situacao)}`}>
                    {String(playerInfo.situacao).toUpperCase()}
                  </Badge>
                )}
              </div>
              {playerInfo ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {playerFields.map(({ key, label, icon: Icon, format }) => {
                    const val = playerInfo[key];
                    if (val === undefined || val === null) return null;
                    return (
                      <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/40">
                        <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="text-sm font-medium text-foreground truncate font-mono">
                            {format ? format(val) : String(val)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Sem dados do jogador</p>
              )}
            </div>

            {/* Balance Card */}
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-success" />
                </div>
                <h3 className="font-semibold text-foreground text-lg">Saldo</h3>
              </div>
              {balanceItems.length > 0 ? (
                <div className="space-y-3">
                  {balanceItems.map((b, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40">
                      <span className="text-sm text-muted-foreground capitalize">{b.name.toLowerCase()}</span>
                      <span className={`text-lg font-bold font-mono ${b.value > 0 ? 'text-success' : 'text-foreground'}`}>
                        {fmtBRL(b.value)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : balanceRaw ? (
                <pre className="text-xs text-muted-foreground bg-secondary/40 p-3 rounded-lg overflow-auto max-h-40 font-mono whitespace-pre-wrap">{balanceRaw}</pre>
              ) : (
                <p className="text-sm text-muted-foreground italic">Sem dados de saldo</p>
              )}
            </div>
          </div>

          {/* Bonus Actions */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                  <Gift className="w-4 h-4 text-accent" />
                </div>
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
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center">
                <Gift className="w-4 h-4 text-warning" />
              </div>
              <h3 className="font-semibold text-foreground text-lg">Histórico de Bônus</h3>
              {bonusList.length > 0 && (
                <Badge variant="secondary" className="ml-2">{bonusList.length} registros</Badge>
              )}
            </div>
            {bonusList.length > 0 ? (
              <PaginatedTable
                data={bonusList}
                columns={getColumns(bonusList)}
                formatCell={fmtCell}
                formatLabel={friendlyLabel}
              />
            ) : (
              <p className="text-sm text-muted-foreground italic">Nenhum registro de bônus</p>
            )}
          </div>

          {/* Transactions */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <History className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-lg">Transações</h3>
              {txList.length > 0 && (
                <Badge variant="secondary" className="ml-2">{txList.length} registros</Badge>
              )}
            </div>
            {txList.length > 0 ? (
              <PaginatedTable
                data={txList}
                columns={getColumns(txList)}
                formatCell={fmtCell}
                formatLabel={friendlyLabel}
              />
            ) : (
              <p className="text-sm text-muted-foreground italic">Nenhuma transação encontrada</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
