import { useState, useEffect } from 'react';
import { Search, User, DollarSign, Gift, History, Loader2, CreditCard, XCircle, Wallet, Calendar, Phone, Mail, Shield, Hash, Activity, Target, Trophy, Swords, Star, Coins, Diamond, ArrowUp, type LucideIcon } from 'lucide-react';
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
import { logAudit } from '@/hooks/use-audit';
import { supabase } from '@/integrations/supabase/client';

interface GamificationEvent {
  type: string;
  icon: string;
  label: string;
  date: string | null;
  details: string;
  color: string;
}

interface BalanceItem {
  nome?: string;
  name?: string;
  tipo?: string;
  carteira?: string;
  descricao?: string;
  saldo?: string | number;
  valor?: string | number;
  value?: string | number;
  balance?: string | number;
}

interface BalanceObject {
  nome?: string;
  name?: string;
  carteira?: string;
  saldo?: string | number;
  valor?: string | number;
  value?: string | number;
  balance?: string | number;
}

const fmtBRL = (v: string | number | null | undefined) => {
  const n = parseBRL(v as string | number);
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
  const [creds, setCreds] = useState({ username: 'auto', password: 'auto' });
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const { callProxy, loading: _l } = useProxy();
  const [loading, setLoading] = useState(false);
  const [creditLoading, setCreditLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [bonusAmount, setBonusAmount] = useState('10');

  const [player, setPlayer] = useState<Record<string, unknown> | null>(null);
  const [balance, setBalance] = useState<unknown>(null);
  const [transactions, setTransactions] = useState<unknown>(null);
  const [bonusHistory, setBonusHistory] = useState<unknown>(null);
  const [events, setEvents] = useState<GamificationEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q && creds.username) {
      setQuery(q);
      handleSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, creds.username]);

  const handleSearch = async (q?: string) => {
    const searchQuery = q || query;
    if (!searchQuery || !creds.username) {
      toast.error('Preencha CPF/UUID e conecte-se');
      return;
    }

    setLoading(true);
    setPlayer(null); setBalance(null); setTransactions(null); setBonusHistory(null); setEvents([]);

    try {
      const searchRes = await callProxy('search_player', creds, { cpf: searchQuery, uuid: searchQuery });
      const playerData = searchRes?.data as Record<string, unknown> | undefined;

      // Check if no results or CPF doesn't match the searched value
      const aaData = (playerData?.aaData || playerData?.data || []) as Record<string, unknown>[];
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
      const isUuidSearch = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchQuery);
      const isMatch = (queryCleaned && foundCpf && foundCpf.includes(queryCleaned)) ||
                      (queryCleaned && foundCpf && queryCleaned.includes(foundCpf)) ||
                      (isUuidSearch && foundUuid === searchQuery);

      if (!isMatch && queryCleaned.length >= 5) {
        toast.warning('CPF/UUID não encontrado na base. O resultado retornado não corresponde à busca.');
        setLoading(false);
        return;
      }

      if (playerData) setPlayer(playerData);
      const realUuid = foundPlayer?.uuid || searchQuery;

      const detailParams = { uuid: String(realUuid), player_id: String(realUuid), cpf: searchQuery };
      const txRes = await callProxy('player_transactions', creds, detailParams);
      const txData = txRes?.data as Record<string, unknown> | undefined;

      if (txData) {
        if (txData.movimentacoes) setBonusHistory(txData.movimentacoes);
        if (txData.historico) setTransactions(txData.historico);
        if (txData.carteiras) {
          // carteiras data loaded
          setBalance(txData.carteiras);
        }
      }

      toast.success('Dados carregados!');

      // Fetch gamification events from Supabase
      const cpfClean = (String(foundPlayer?.cpf || '') || searchQuery).replace(/\D/g, '');
      if (cpfClean) fetchEvents(cpfClean);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao buscar jogador');
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async (cpf: string) => {
    setEventsLoading(true);
    try {
      const [walletRes, activityRes, missionsRes, achievementsRes, tournamentsRes, spinsRes, xpHistRes, levelUpsRes, rewardsRes] = await Promise.all([
        (supabase as Record<string, unknown> as { from: (table: string) => Record<string, unknown> }).from('player_wallets').select('*').eq('cpf', cpf).maybeSingle(),
        (supabase as Record<string, unknown> as { from: (table: string) => Record<string, unknown> }).from('player_activity_log').select('*').eq('cpf', cpf).order('created_at', { ascending: false }).limit(100),
        (supabase as Record<string, unknown> as { from: (table: string) => Record<string, unknown> }).from('player_mission_progress').select('*, missions(name, condition_type, reward_type, reward_value)').eq('cpf', cpf),
        (supabase as Record<string, unknown> as { from: (table: string) => Record<string, unknown> }).from('player_achievements').select('*, achievements(name, category, reward_type, reward_value)').eq('cpf', cpf),
        (supabase as Record<string, unknown> as { from: (table: string) => Record<string, unknown> }).from('player_tournament_entries').select('*, tournaments(name, metric, status)').eq('cpf', cpf),
        (supabase as Record<string, unknown> as { from: (table: string) => Record<string, unknown> }).from('player_spins').select('*').eq('cpf', cpf).maybeSingle(),
        (supabase as Record<string, unknown> as { from: (table: string) => Record<string, unknown> }).from('xp_history').select('*').eq('cpf', cpf).order('created_at', { ascending: false }).limit(50),
        (supabase as Record<string, unknown> as { from: (table: string) => Record<string, unknown> }).from('level_rewards_log').select('*').eq('cpf', cpf).order('created_at', { ascending: false }),
        (supabase as Record<string, unknown> as { from: (table: string) => Record<string, unknown> }).from('player_rewards_pending').select('*').eq('cpf', cpf).order('created_at', { ascending: false }),
      ]);

      const allEvents: GamificationEvent[] = [];

      // Wallet info
      if (walletRes.data) {
        const w = walletRes.data as Record<string, unknown>;
        allEvents.push({ type: 'wallet', icon: 'coins', label: 'Carteira Gamificação', date: (w.updated_at || w.created_at) as string | null, details: `Moedas: ${w.coins || 0} · XP: ${w.xp || 0} · Diamantes: ${w.diamonds || 0} · Nível: ${w.level || 1}`, color: 'text-yellow-500' });
      }

      // Activity log
      for (const a of ((activityRes.data || []) as Record<string, unknown>[])) {
        allEvents.push({ type: 'activity', icon: (a.type as string) || 'activity', label: (a.description as string) || (a.source as string) || 'Atividade', date: a.created_at as string | null, details: `${a.source || ''} · Qtd: ${a.amount ?? 0}`, color: ((a.amount as number) || 0) >= 0 ? 'text-green-500' : 'text-red-500' });
      }

      // Mission progress
      for (const m of ((missionsRes.data || []) as Record<string, unknown>[])) {
        const missions = m.missions as Record<string, unknown> | null;
        const missionName = missions?.name || `Missão #${m.mission_id}`;
        const status = m.completed ? 'Concluída' : m.opted_in ? 'Participando' : 'Não inscrito';
        allEvents.push({ type: 'mission', icon: 'target', label: `Missão: ${missionName}`, date: (m.completed_at || m.updated_at || m.created_at) as string | null, details: `Status: ${status} · Progresso: ${m.progress || 0}/${m.target || '?'}`, color: m.completed ? 'text-green-500' : 'text-blue-500' });
      }

      // Achievements
      for (const a of ((achievementsRes.data || []) as Record<string, unknown>[])) {
        const achievements = a.achievements as Record<string, unknown> | null;
        const achName = achievements?.name || `Conquista #${a.achievement_id}`;
        allEvents.push({ type: 'achievement', icon: 'trophy', label: `Conquista: ${achName}`, date: (a.earned_at || a.created_at) as string | null, details: `Categoria: ${achievements?.category || '—'}`, color: 'text-amber-500' });
      }

      // Tournaments
      for (const t of ((tournamentsRes.data || []) as Record<string, unknown>[])) {
        const tournaments = t.tournaments as Record<string, unknown> | null;
        const tName = tournaments?.name || `Torneio #${t.tournament_id}`;
        allEvents.push({ type: 'tournament', icon: 'swords', label: `Torneio: ${tName}`, date: (t.updated_at || t.created_at) as string | null, details: `Score: ${t.score || 0} · Rank: #${t.rank || '—'}`, color: 'text-purple-500' });
      }

      // XP history
      for (const x of ((xpHistRes.data || []) as Record<string, unknown>[])) {
        allEvents.push({ type: 'xp', icon: 'star', label: `XP: ${x.action || 'ganho'}`, date: x.created_at as string | null, details: `+${x.xp_earned || 0} XP · ${x.description || ''}`, color: 'text-cyan-500' });
      }

      // Level ups
      for (const l of ((levelUpsRes.data || []) as Record<string, unknown>[])) {
        allEvents.push({ type: 'level_up', icon: 'arrow-up', label: `Level Up: ${l.from_level} → ${l.to_level}`, date: l.created_at as string | null, details: `Recompensa: ${l.reward_coins || 0} moedas, ${l.reward_diamonds || 0} diamantes`, color: 'text-emerald-500' });
      }

      // Spins
      if (spinsRes.data) {
        const s = spinsRes.data as Record<string, unknown>;
        allEvents.push({ type: 'spins', icon: 'wheel', label: 'Roleta Diária', date: (s.last_spin_date || s.updated_at) as string | null, details: `Giros hoje: ${s.spins_used_today || 0} · Total: ${s.total_spins || 0}`, color: 'text-pink-500' });
      }

      // Pending rewards
      for (const r of ((rewardsRes.data || []) as Record<string, unknown>[])) {
        allEvents.push({ type: 'reward', icon: 'gift', label: `Recompensa: ${r.reward_type || '—'}`, date: r.created_at as string | null, details: `Valor: ${r.reward_value || 0} · Fonte: ${r.source || '—'} · ${r.claimed_at ? 'Resgatado' : 'Pendente'}`, color: r.claimed_at ? 'text-green-500' : 'text-orange-500' });
      }

      // Sort all by date descending
      allEvents.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      setEvents(allEvents);
    } catch (e) {
      console.error('Erro ao buscar eventos:', e);
    } finally {
      setEventsLoading(false);
    }
  };

  const handleCreditBonus = async () => {
    if (!creds.username || !query) return;
    const playerData = (player as Record<string, unknown>)?.aaData as Record<string, unknown>[] | undefined;
    const playerObj = playerData?.[0] || player;
    const playerUuid = (playerObj as Record<string, unknown>)?.uuid || query;
    setCreditLoading(true);
    try {
      const res = await callProxy('credit_bonus', creds, {
        uuid: String(playerUuid), player_id: String(playerUuid),
        bonus_amount: parseFloat(bonusAmount),
        carteira: 'BONUS',
      });
      const resData = res?.data as Record<string, unknown> | undefined;
      const msg = String(resData?.msg || resData?.Msg || '');
      const isError = msg && (
        msg.toLowerCase().includes('não tem permissão') ||
        msg.toLowerCase().includes('erro') ||
        msg.toLowerCase().includes('inválid') ||
        msg.toLowerCase().includes('falha')
      );
      if (isError) {
        toast.error(msg);
      } else if (resData) {
        toast.success(msg || 'Bônus creditado com sucesso!');
        logAudit({ action: 'CREDITAR', resource_type: 'bonus_manual', resource_name: query, details: { cpf: query, uuid: String(playerUuid), valor: parseFloat(bonusAmount), carteira: 'BONUS' } });
        handleSearch();
      } else {
        toast.error('Falha ao creditar bônus');
      }
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Erro'); }
    finally { setCreditLoading(false); }
  };

  const handleCancelBonus = async (bonusId?: string) => {
    if (!creds.username || !query) return;
    setCancelLoading(true);
    try {
      const res = await callProxy('cancel_bonus', creds, {
        cpf: query, uuid: query, player_id: query, bonus_id: bonusId || ''
      });
      const resData = res?.data as Record<string, unknown> | undefined;
      const msg = String(resData?.msg || resData?.Msg || '');
      if (msg) {
        toast.warning(msg);
      } else {
        toast.error('Falha ao cancelar bônus');
      }
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Erro'); }
    finally { setCancelLoading(false); }
  };

  // Extract player object from search results
  const playerAaData = (player as Record<string, unknown> | null)?.aaData as Record<string, unknown>[] | undefined;
  const playerDataArr = (player as Record<string, unknown> | null)?.data as Record<string, unknown>[] | undefined;
  const playerInfo = playerAaData?.[0] || playerDataArr?.[0] || null;

  // Normalize balance into array of { name, value }
  const balanceItems: { name: string; value: number }[] = (() => {
    if (!balance) return [];

    // If it's a string (HTML or raw text), can't parse
    if (typeof balance === 'string') return [];

    // If it's an array of objects like [{carteira: 'BONUS', saldo: 10}, ...]
    if (Array.isArray(balance)) {
      return balance
        .filter((b: unknown) => b && typeof b === 'object')
        .map((b: unknown) => {
          const item = b as BalanceItem;
          const name = item.nome || item.name || item.tipo || item.carteira || item.descricao || '—';
          const val = item.saldo ?? item.valor ?? item.value ?? item.balance ?? 0;
          return { name: String(name), value: parseBRL(val as string | number) || 0 };
        });
    }

    // If it's an object, filter out internal keys
    if (typeof balance === 'object' && balance !== null) {
      return Object.entries(balance as Record<string, unknown>)
        .filter(([k]) => !k.startsWith('_') && k !== 'DT_RowId')
        .map(([k, v]: [string, unknown]) => {
          if (v === null || v === undefined) return { name: k, value: 0 };
          if (typeof v === 'number') return { name: k, value: v };
          if (typeof v === 'string') {
            return { name: k, value: parseBRL(v) || 0 };
          }
          if (typeof v === 'object') {
            const obj = v as BalanceObject;
            const val = obj.saldo ?? obj.valor ?? obj.value ?? obj.balance ?? 0;
            return { name: String(obj.nome || obj.name || obj.carteira || k), value: parseBRL(val as string | number) || 0 };
          }
          return { name: k, value: 0 };
        });
    }

    return [];
  })();

  // Raw balance fallback for debugging
  const balanceRaw = balance && balanceItems.length === 0 ? JSON.stringify(balance, null, 2) : null;

  // Normalize history arrays
  const normalizeList = (data: unknown): Record<string, unknown>[] => {
    if (!data) return [];
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    const obj = data as Record<string, unknown>;
    if (obj.data && Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];
    if (obj.aaData && Array.isArray(obj.aaData)) return obj.aaData as Record<string, unknown>[];
    return [obj];
  };

  const bonusList = normalizeList(bonusHistory);
  const txList = normalizeList(transactions);

  // Detect column keys from first item
  const getColumns = (list: Record<string, unknown>[]) => {
    if (list.length === 0) return [];
    return Object.keys(list[0]).filter(k => !k.startsWith('_') && k !== 'DT_RowId');
  };

  // Smart formatting for known column patterns
  const fmtCell = (key: string, val: unknown) => {
    if (val === null || val === undefined) return '—';
    const kl = key.toLowerCase();
    if (kl.includes('valor') || kl.includes('saldo') || kl.includes('amount') || kl.includes('deposito') || kl.includes('saque') || kl.includes('bonus') || kl.includes('comissao') || kl.includes('lucro') || kl.includes('ggr') || kl.includes('premio')) {
      const n = parseBRL(val as string | number);
      if (!isNaN(n)) return fmtBRL(n);
    }
    if (kl.includes('data') || kl.includes('date') || kl.includes('created') || kl.includes('updated') || kl === 'ultimo_login') {
      return formatDateTime(val as string);
    }
    if (kl === 'cpf') return formatCPF(val as string);
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

  const situacaoColor = (s: string | number | boolean | null | undefined) => {
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

      <div className="hidden"><ApiCredentialsBar onCredentials={setCreds} /></div>

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
                  <Badge className={`ml-auto ${situacaoColor(playerInfo.situacao as string)}`}>
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
                            {format ? format(val as string) : String(val)}
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

          {/* Events (Gamification) */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
                <Activity className="w-4 h-4 text-violet-500" />
              </div>
              <h3 className="font-semibold text-foreground text-lg">Eventos de Gamificação</h3>
              {events.length > 0 && (
                <Badge variant="secondary" className="ml-2">{events.length} eventos</Badge>
              )}
            </div>
            {eventsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : events.length > 0 ? (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {events.map((ev, i) => {
                  const iconMap: Record<string, LucideIcon> = {
                    target: Target, trophy: Trophy, swords: Swords, star: Star,
                    coins: Coins, 'arrow-up': ArrowUp, gift: Gift, wheel: Star,
                    activity: Activity,
                  };
                  const IconComp = iconMap[ev.icon] || Activity;
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/40 hover:bg-secondary/60 transition-colors">
                      <div className={`mt-0.5 shrink-0 ${ev.color || 'text-muted-foreground'}`}>
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{ev.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{ev.details}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {ev.date ? formatDateTime(ev.date) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Nenhum evento de gamificação encontrado</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
