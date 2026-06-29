import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, API_URL } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Copy, Loader2, Trophy, Swords, Play, Square, Clock, Users, UserCheck, CheckCircle2, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatDateTime, formatBRL, formatCPF } from '@/lib/formatters';
import { logAudit } from '@/hooks/use-audit';

const METRICS = [
  { value: 'total_bet', label: 'Total Apostado' },
  { value: 'total_won', label: 'Total Ganho' },
  { value: 'total_deposit', label: 'Total Depositado' },
  { value: 'ggr', label: 'GGR' },
];

const GAMES = [
  { value: 'all', label: 'Todos' },
  { value: 'keno', label: 'Keno' },
  { value: 'cassino', label: 'Cassino' },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-secondary text-muted-foreground' },
  ATIVO: { label: 'Ativo', color: 'bg-emerald-500/15 text-emerald-400' },
  AGUARDANDO_PAGAMENTO: { label: 'Aguardando pagamento', color: 'bg-amber-500/15 text-amber-400' },
  ENCERRADO: { label: 'Encerrado', color: 'bg-red-500/15 text-red-400' },
};

const PRIZE_TYPES = [
  { value: 'bonus', label: 'Bônus (R$)' },
  { value: 'free_bet', label: 'Free Bet (R$)' },
  { value: 'coins', label: 'Moedas' },
  { value: 'xp', label: 'XP' },
];

const POINTS_PER_OPTIONS = [
  { value: '1_centavo', label: '1 ponto a cada R$ 0,01', multiplier: 100 },
  { value: '10_centavos', label: '1 ponto a cada R$ 0,10', multiplier: 10 },
  { value: '1_real', label: '1 ponto a cada R$ 1,00', multiplier: 1 },
];

interface Segment {
  id: string;
  name: string;
}

interface Tournament {
  id: string;
  name: string;
  internal_name: string | null;
  description: string | null;
  rules_html: string | null;
  prize_pool_short: string | null;
  image_url: string | null;
  image_lobby_url: string | null;
  image_lobby_mobile_url: string | null;
  ribbon: string | null;
  start_date: string;
  end_date: string;
  metric: string;
  game_filter: string;
  min_bet: number;
  min_players: number | null;
  max_players: number | null;
  status: string;
  prizes: Prize[];
  segment_id: string | null;
  require_optin: boolean;
  points_per: string;
  payout_mode?: string;
  created_at: string;
}

// Prêmio por faixa de posições: rankFrom..rankTo ganham o mesmo prêmio.
// Posição única = rankFrom igual a rankTo. (chaves casam com o JSONB lido pelo backend)
interface Prize { rankFrom: number; rankTo: number; value: number; description: string; type?: string; rank?: number }

interface PayoutItem {
  reward_id: string;
  cpf: string;
  reward_type: string;
  value: number;
  description: string;
  rank: number | null;
  score: number;
  total_bet: number;
  total_won: number;
}

interface PayoutParticipant {
  cpf: string;
  rank: number | null;
  score: number;
  total_bet: number;
  total_won: number;
  ggr: number;
}

interface PayoutMetrics {
  turnover: number;
  ggr: number;
  prize_cost: number;
  roi: number | null;
  participants: number;
}

interface PayoutData {
  tournament: { id: string; name: string; status: string; payout_mode: string };
  items: PayoutItem[];
  participants: PayoutParticipant[];
  metrics: PayoutMetrics;
}

interface AnalyzeParticipant {
  cpf: string;
  username: string | null;
  representante: string | null;
  rank: number | null;
  score: number;
  total_bet: number;
  total_won: number;
  ggr: number;
}

interface AnalyzeData {
  tournament: { id: string; name: string; status: string; payout_mode: string; start_date: string; end_date: string };
  participants: AnalyzeParticipant[];
  representantes: string[];
  metrics: { turnover: number; total_won: number; ggr: number; rtp: number | null; participants: number };
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  return headers;
}

const emptyForm = {
  name: '', internal_name: '', description: '', rules_html: '', prize_pool_short: '',
  image_url: '', image_lobby_url: '', image_lobby_mobile_url: '', ribbon: '',
  start_date: '', end_date: '',
  metric: 'total_bet', game_filter: 'all', min_bet: '0', min_players: '', max_players: '', status: 'RASCUNHO',
  prizes: [
    { rankFrom: 1, rankTo: 1, value: 500, description: '1º lugar', type: 'bonus' },
    { rankFrom: 2, rankTo: 2, value: 200, description: '2º lugar', type: 'bonus' },
    { rankFrom: 3, rankTo: 3, value: 100, description: '3º lugar', type: 'bonus' },
  ] as Prize[],
  segment_id: '',
  require_optin: false,
  points_per: '1_real',
  payout_mode: 'AUTO',
};

export default function Tournaments() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [payoutTournament, setPayoutTournament] = useState<Tournament | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const { data: segments = [] } = useQuery({
    queryKey: ['segments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('segments').select('id, name').order('name');
      if (error) throw error;
      return data as unknown as Segment[];
    },
  });

  const { data: tournaments = [], isLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as Tournament[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error('Preencha o nome');
      if (!form.start_date || !form.end_date) throw new Error('Preencha as datas');
      const validPrizes = form.prizes.filter(p => p.value > 0);
      if (validPrizes.length === 0) throw new Error('Adicione pelo menos 1 prêmio');
      const payload = {
        name: form.name,
        internal_name: form.internal_name || null,
        description: form.description || null,
        rules_html: form.rules_html || null,
        prize_pool_short: form.prize_pool_short || null,
        image_url: form.image_url || null,
        image_lobby_url: form.image_lobby_url || null,
        image_lobby_mobile_url: form.image_lobby_mobile_url || null,
        ribbon: form.ribbon || null,
        start_date: new Date(form.start_date).toISOString(),
        end_date: new Date(form.end_date).toISOString(),
        metric: form.metric,
        game_filter: form.game_filter,
        min_bet: parseFloat(form.min_bet) || 0,
        min_players: form.min_players ? parseInt(form.min_players, 10) : null,
        max_players: form.max_players ? parseInt(form.max_players, 10) : null,
        status: form.status,
        prizes: validPrizes,
        segment_id: form.segment_id || null,
        require_optin: form.require_optin,
        points_per: form.points_per,
        payout_mode: form.payout_mode,
      };
      if (editId) {
        const { error } = await supabase.from('tournaments').update(payload as Record<string, unknown>).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tournaments').insert(payload as Record<string, unknown>);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournaments'] });
      toast.success(editId ? 'Torneio atualizado' : 'Torneio criado');
      logAudit({ action: editId ? 'EDITAR' : 'CRIAR', resource_type: 'torneio', resource_name: form.name });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tournaments').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['tournaments'] });
      const t = tournaments.find(x => x.id === id);
      toast.success('Torneio excluído');
      logAudit({ action: 'EXCLUIR', resource_type: 'torneio', resource_id: id, resource_name: t?.name });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('tournaments').update({ status } as Record<string, unknown>).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tournaments'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const isPayoutReview = payoutTournament?.status === 'AGUARDANDO_PAGAMENTO';

  const { data: payoutData, isLoading: payoutLoading } = useQuery({
    queryKey: ['tournament-payout', payoutTournament?.id],
    enabled: !!payoutTournament,
    // Torneio ATIVO: atualiza o ranking ao vivo a cada 30s enquanto o dialog está aberto.
    refetchInterval: payoutTournament?.status === 'ATIVO' ? 30000 : false,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/functions/tournament-payout`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'list', tournament_id: payoutTournament!.id }),
      });
      if (!res.ok) throw new Error('Erro ao carregar dados do torneio');
      const data = await res.json() as PayoutData;
      setCheckedIds(new Set((data.items || []).map(i => i.reward_id)));
      return data;
    },
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!payoutTournament) throw new Error('Torneio inválido');
      const allIds = (payoutData?.items || []).map(i => i.reward_id);
      const approved_ids = allIds.filter(id => checkedIds.has(id));
      const rejected_ids = allIds.filter(id => !checkedIds.has(id));
      const res = await fetch(`${API_URL}/functions/tournament-payout`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'pay', tournament_id: payoutTournament.id, approved_ids, rejected_ids }),
      });
      const data = await res.json() as { success: boolean; paid: number; rejected: number; closed: boolean };
      if (!res.ok || !data.success) throw new Error('Erro ao processar pagamento');
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tournaments'] });
      toast.success(`${data.paid} pagos, ${data.rejected} rejeitados`);
      logAudit({ action: 'PAGAR', resource_type: 'torneio', resource_id: payoutTournament?.id, resource_name: payoutTournament?.name });
      setPayoutTournament(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleChecked = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirmPay = () => {
    const approvedCount = (payoutData?.items || []).filter(i => checkedIds.has(i.reward_id)).length;
    if (window.confirm(`Confirmar pagamento de ${approvedCount} prêmios?`)) {
      payMutation.mutate();
    }
  };

  const closeDialog = () => { setOpen(false); setEditId(null); setForm(emptyForm); };

  const openEdit = (t: Tournament) => {
    const prizes: Prize[] = (t.prizes || []).map((p: Prize) => ({
      // compat: prêmios antigos só tinham `rank`; vira faixa de posição única.
      rankFrom: p.rankFrom ?? p.rank ?? 1,
      rankTo: p.rankTo ?? p.rankFrom ?? p.rank ?? 1,
      value: p.value, description: p.description, type: p.type || 'bonus',
    }));
    setEditId(t.id);
    setForm({
      name: t.name, internal_name: t.internal_name || '', description: t.description || '',
      rules_html: t.rules_html || '', prize_pool_short: t.prize_pool_short || '',
      image_url: t.image_url || '', image_lobby_url: t.image_lobby_url || '',
      image_lobby_mobile_url: t.image_lobby_mobile_url || '', ribbon: t.ribbon || '',
      start_date: t.start_date?.slice(0, 16) || '', end_date: t.end_date?.slice(0, 16) || '',
      metric: t.metric, game_filter: t.game_filter, min_bet: String(t.min_bet || 0),
      min_players: t.min_players != null ? String(t.min_players) : '',
      max_players: t.max_players != null ? String(t.max_players) : '',
      status: t.status, prizes: prizes.length > 0 ? prizes : emptyForm.prizes, segment_id: t.segment_id || '',
      require_optin: t.require_optin || false, points_per: t.points_per || '1_real',
      payout_mode: t.payout_mode || 'AUTO',
    });
    setOpen(true);
  };

  // Clona um torneio: abre o formulário de criação (editId null = INSERT) já preenchido
  // com os dados do torneio de origem, como RASCUNHO e nome com "(cópia)".
  const openClone = (t: Tournament) => {
    const prizes: Prize[] = (t.prizes || []).map((p: Prize) => ({
      rankFrom: p.rankFrom ?? p.rank ?? 1,
      rankTo: p.rankTo ?? p.rankFrom ?? p.rank ?? 1,
      value: p.value, description: p.description, type: p.type || 'bonus',
    }));
    setEditId(null);
    setForm({
      name: `${t.name} (cópia)`,
      internal_name: t.internal_name ? `${t.internal_name} (cópia)` : '',
      description: t.description || '',
      rules_html: t.rules_html || '', prize_pool_short: t.prize_pool_short || '',
      image_url: t.image_url || '', image_lobby_url: t.image_lobby_url || '',
      image_lobby_mobile_url: t.image_lobby_mobile_url || '', ribbon: t.ribbon || '',
      start_date: t.start_date?.slice(0, 16) || '', end_date: t.end_date?.slice(0, 16) || '',
      metric: t.metric, game_filter: t.game_filter, min_bet: String(t.min_bet || 0),
      min_players: t.min_players != null ? String(t.min_players) : '',
      max_players: t.max_players != null ? String(t.max_players) : '',
      status: 'RASCUNHO', prizes: prizes.length > 0 ? prizes : emptyForm.prizes, segment_id: t.segment_id || '',
      require_optin: t.require_optin || false, points_per: t.points_per || '1_real',
      payout_mode: t.payout_mode || 'AUTO',
    });
    setOpen(true);
    toast.info('Torneio clonado — ajuste o que precisar e clique em Criar');
  };

  const updatePrize = (index: number, field: keyof Prize, value: string | number) => {
    setForm(f => {
      const prizes = [...f.prizes];
      const numeric = field === 'rankFrom' || field === 'rankTo' || field === 'value';
      prizes[index] = { ...prizes[index], [field]: numeric ? Number(value) : value };
      return { ...f, prizes };
    });
  };

  const addPrize = () => {
    setForm(f => {
      const nextPos = f.prizes.reduce((max, p) => Math.max(max, p.rankTo || 0), 0) + 1;
      return { ...f, prizes: [...f.prizes, { rankFrom: nextPos, rankTo: nextPos, value: 0, description: '', type: 'bonus' }] };
    });
  };

  const removePrize = (index: number) => {
    setForm(f => ({ ...f, prizes: f.prizes.filter((_, i) => i !== index) }));
  };

  const metricLabel = (m: string) => METRICS.find(x => x.value === m)?.label || m;
  const gameLabel = (g: string) => GAMES.find(x => x.value === g)?.label || g;

  // Cada faixa paga `value` para cada posição que ela cobre (rankFrom..rankTo).
  const totalPrizePool = (prizes: Prize[]) => (prizes || []).reduce((s: number, p: Prize) => {
    const from = p.rankFrom ?? p.rank ?? 1;
    const to = p.rankTo ?? from;
    const positions = Math.max(1, to - from + 1);
    return s + Number(p.value || 0) * positions;
  }, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Swords className="w-6 h-6 text-cyan-400" /> Torneios
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Crie competições com rankings e prêmios</p>
        </div>
        <Button className="gradient-primary border-0" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Novo Torneio
        </Button>
      </div>

      <Tabs defaultValue="torneios" className="space-y-6">
        <TabsList>
          <TabsTrigger value="torneios">Torneios</TabsTrigger>
          <TabsTrigger value="analise">Análise</TabsTrigger>
        </TabsList>

        <TabsContent value="torneios" className="space-y-6 mt-0">
      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : tournaments.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Nenhum torneio criado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tournaments.map((t: Tournament) => {
            const st = STATUS_MAP[t.status] || STATUS_MAP.RASCUNHO;
            const prizes: Prize[] = t.prizes || [];
            return (
              <Card key={t.id} className="glass-card border-border hover:border-primary/30 transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground truncate">{t.name}</h3>
                      <p className="text-[10px] font-mono text-muted-foreground/60 truncate">{t.id}</p>
                      {t.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>}
                    </div>
                    <Badge className={`${st.color} text-[10px] ml-2 shrink-0`}>{st.label}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-secondary/50 rounded-lg p-2">
                      <p className="text-muted-foreground">Métrica</p>
                      <p className="font-semibold text-foreground">{metricLabel(t.metric)}</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg p-2">
                      <p className="text-muted-foreground">Jogo</p>
                      <p className="font-semibold text-foreground">{gameLabel(t.game_filter)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {t.require_optin && (
                      <Badge className="bg-amber-500/15 text-amber-400 text-[10px]">
                        <UserCheck className="w-3 h-3 mr-1" /> Opt-in obrigatório
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {POINTS_PER_OPTIONS.find(o => o.value === t.points_per)?.label || '1 pt/R$ 1'}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{formatDateTime(t.start_date)} — {formatDateTime(t.end_date)}</span>
                  </div>

                  {prizes.length > 0 && (
                    <div className="space-y-1">
                      {prizes.slice(0, 3).map((p: Prize, i: number) => {
                        const typeLabels: Record<string, string> = { bonus: 'R$', free_bet: 'Free Bet R$', coins: 'moedas', xp: 'XP' };
                        const prefix = typeLabels[p.type || 'bonus'] || 'R$';
                        const formatted = p.type === 'coins' || p.type === 'xp' ? `${p.value} ${prefix}` : `${prefix} ${Number(p.value).toLocaleString('pt-BR')}`;
                        return (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{p.description || ((p.rankFrom ?? p.rank) === (p.rankTo ?? p.rankFrom ?? p.rank) ? `${p.rankFrom ?? p.rank}º lugar` : `${p.rankFrom}º–${p.rankTo}º lugar`)}</span>
                          <span className="font-mono font-semibold text-emerald-400">{formatted}</span>
                        </div>
                        );
                      })}
                      {prizes.length > 3 && <p className="text-[10px] text-muted-foreground">+{prizes.length - 3} prêmios</p>}
                      <div className="flex justify-between text-xs border-t border-border pt-1 mt-1">
                        <span className="text-muted-foreground font-semibold">Prize Pool</span>
                        <span className="font-mono font-bold text-foreground">R$ {totalPrizePool(prizes).toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1 pt-1">
                    {t.status === 'RASCUNHO' && (
                      <Button size="sm" className="flex-1 gradient-success border-0 text-success-foreground" onClick={() => statusMutation.mutate({ id: t.id, status: 'ATIVO' })}>
                        <Play className="w-3 h-3 mr-1" /> Ativar
                      </Button>
                    )}
                    {t.status === 'ATIVO' && (
                      <>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setPayoutTournament(t)}>
                          <BarChart3 className="w-3 h-3 mr-1" /> Ranking ao vivo
                        </Button>
                        <Button size="sm" variant="destructive" className="flex-1" onClick={() => statusMutation.mutate({ id: t.id, status: 'ENCERRADO' })}>
                          <Square className="w-3 h-3 mr-1" /> Encerrar
                        </Button>
                      </>
                    )}
                    {t.status === 'AGUARDANDO_PAGAMENTO' && (
                      <Button size="sm" className="flex-1 gradient-success border-0 text-success-foreground" onClick={() => setPayoutTournament(t)}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Revisar e aprovar
                      </Button>
                    )}
                    {t.status === 'ENCERRADO' && (
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setPayoutTournament(t)}>
                        <BarChart3 className="w-3 h-3 mr-1" /> Métricas
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} title="Editar">
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openClone(t)} title="Clonar">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(t.id)} title="Excluir">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
        </TabsContent>

        <TabsContent value="analise" className="mt-0">
          <TournamentAnalysis tournaments={tournaments} />
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Torneio' : 'Novo Torneio'}</DialogTitle>
            {editId && <p className="text-[10px] font-mono text-muted-foreground/60 select-all">{editId}</p>}
          </DialogHeader>
          <Tabs defaultValue="geral" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="geral">Em geral</TabsTrigger>
              <TabsTrigger value="ui">UI</TabsTrigger>
              <TabsTrigger value="premios">Prêmios</TabsTrigger>
            </TabsList>

            {/* ─── EM GERAL ─── */}
            <TabsContent value="geral" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome interno</Label>
                  <Input value={form.internal_name} onChange={e => setForm(f => ({ ...f, internal_name: e.target.value }))} placeholder="Ex: [PONTUAL] Torneio dos Campeões" className="bg-secondary border-border mt-1" />
                  <p className="text-[10px] text-muted-foreground mt-1">Só para organização interna; não aparece para o jogador</p>
                </div>
                <div>
                  <Label>Nome (público)</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Torneio dos Campeões" className="bg-secondary border-border mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RASCUNHO">Rascunho</SelectItem>
                      <SelectItem value="ATIVO">Ativo</SelectItem>
                      <SelectItem value="PAUSADO">Pausado</SelectItem>
                      <SelectItem value="ENCERRADO">Encerrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Pagamento do prêmio</Label>
                  <Select value={form.payout_mode} onValueChange={v => setForm(f => ({ ...f, payout_mode: v }))}>
                    <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTO">Automático ao encerrar</SelectItem>
                      <SelectItem value="MANUAL">Manual (revisar e aprovar)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Quem pode se inscrever (segmento)</Label>
                <Select value={form.segment_id || '_all'} onValueChange={v => setForm(f => ({ ...f, segment_id: v === '_all' ? '' : v }))}>
                  <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todos os jogadores</SelectItem>
                    {segments.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Início</Label>
                  <Input type="datetime-local" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="bg-secondary border-border mt-1" />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input type="datetime-local" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="bg-secondary border-border mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-muted-foreground" /> Mín. jogadores</Label>
                  <Input type="number" value={form.min_players} onChange={e => setForm(f => ({ ...f, min_players: e.target.value }))} placeholder="0 = sem mínimo" className="bg-secondary border-border font-mono mt-1" />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-muted-foreground" /> Máx. jogadores</Label>
                  <Input type="number" value={form.max_players} onChange={e => setForm(f => ({ ...f, max_players: e.target.value }))} placeholder="vazio = sem limite" className="bg-secondary border-border font-mono mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Métrica</Label>
                  <Select value={form.metric} onValueChange={v => setForm(f => ({ ...f, metric: v }))}>
                    <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METRICS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Jogo</Label>
                  <Select value={form.game_filter} onValueChange={v => setForm(f => ({ ...f, game_filter: v }))}>
                    <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GAMES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Aposta Mín. (R$)</Label>
                  <Input type="number" value={form.min_bet} onChange={e => setForm(f => ({ ...f, min_bet: e.target.value }))} className="bg-secondary border-border font-mono mt-1" />
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-2"><UserCheck className="w-4 h-4 text-primary" /> Exigir Opt-in</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Jogador precisa se inscrever no torneio antes de participar</p>
                  </div>
                  <Switch checked={form.require_optin} onCheckedChange={v => setForm(f => ({ ...f, require_optin: v }))} />
                </div>
                <div>
                  <Label>Pontuação (1 ponto a cada...)</Label>
                  <Select value={form.points_per} onValueChange={v => setForm(f => ({ ...f, points_per: v }))}>
                    <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {POINTS_PER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Exemplo: se o jogador apostar R$ 100,00 → {
                      form.points_per === '1_centavo' ? '10.000 pontos' :
                      form.points_per === '10_centavos' ? '1.000 pontos' : '100 pontos'
                    }
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* ─── UI ─── */}
            <TabsContent value="ui" className="space-y-4 mt-4">
              <div>
                <Label>Descrição</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Aposte no Keno e concorra a prêmios..." className="bg-secondary border-border mt-1" rows={2} />
              </div>
              <div>
                <Label>Regras (HTML)</Label>
                <Textarea value={form.rules_html} onChange={e => setForm(f => ({ ...f, rules_html: e.target.value }))} placeholder={'<div style="...">Regras do torneio...</div>'} className="bg-secondary border-border font-mono text-xs mt-1" rows={5} />
                <p className="text-[10px] text-muted-foreground mt-1">Aceita HTML; exibido na tela de detalhes do torneio</p>
              </div>
              <div>
                <Label>Resumo do prêmio</Label>
                <Input value={form.prize_pool_short} onChange={e => setForm(f => ({ ...f, prize_pool_short: e.target.value }))} placeholder="Ex: R$ 5.000" className="bg-secondary border-border mt-1" />
                <p className="text-[10px] text-muted-foreground mt-1">Texto curto exibido no card do torneio</p>
              </div>
              <div className="border-t border-border pt-4 space-y-4">
                <div>
                  <Label>Imagem — lista de torneios</Label>
                  <Input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://... (544x216)" className="bg-secondary border-border mt-1" />
                </div>
                <div>
                  <Label>Imagem — lobby</Label>
                  <Input value={form.image_lobby_url} onChange={e => setForm(f => ({ ...f, image_lobby_url: e.target.value }))} placeholder="https://... (920x200)" className="bg-secondary border-border mt-1" />
                </div>
                <div>
                  <Label>Imagem — lobby (mobile)</Label>
                  <Input value={form.image_lobby_mobile_url} onChange={e => setForm(f => ({ ...f, image_lobby_mobile_url: e.target.value }))} placeholder="https://... (720x400)" className="bg-secondary border-border mt-1" />
                </div>
                <div>
                  <Label>Ribbon (selo)</Label>
                  <Input value={form.ribbon} onChange={e => setForm(f => ({ ...f, ribbon: e.target.value }))} placeholder="Ex: NOVO, EXCLUSIVO" className="bg-secondary border-border mt-1" />
                </div>
              </div>
            </TabsContent>

            {/* ─── PRÊMIOS ─── */}
            <TabsContent value="premios" className="space-y-2 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Prêmios por faixa de posição</Label>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Ex: da 5ª à 10ª posição, cada um ganha R$ 100</p>
                </div>
                <Button variant="ghost" size="sm" onClick={addPrize} className="text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Adicionar
                </Button>
              </div>
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center text-[10px] text-muted-foreground px-0.5">
                <span className="w-[5.5rem]">Posição (de–até)</span>
                <span>Descrição</span>
                <span className="w-32">Tipo</span>
                <span className="w-24">Valor</span>
                <span className="w-8"></span>
              </div>
              {form.prizes.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input type="number" min={1} value={p.rankFrom} onChange={e => updatePrize(i, 'rankFrom', e.target.value)} className="bg-secondary border-border font-mono w-12 px-1.5 text-center" placeholder="de" />
                  <span className="text-muted-foreground text-xs">–</span>
                  <Input type="number" min={1} value={p.rankTo} onChange={e => updatePrize(i, 'rankTo', e.target.value)} className="bg-secondary border-border font-mono w-12 px-1.5 text-center" placeholder="até" />
                  <Input value={p.description} onChange={e => updatePrize(i, 'description', e.target.value)} className="bg-secondary border-border flex-1" placeholder="Ex: 1º lugar" />
                  <Select value={p.type || 'bonus'} onValueChange={v => updatePrize(i, 'type', v)}>
                    <SelectTrigger className="bg-secondary border-border w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIZE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" value={p.value} onChange={e => updatePrize(i, 'value', e.target.value)} className="bg-secondary border-border font-mono w-24" placeholder="Valor" />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => removePrize(i)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-2">
                Custo total estimado: <span className="font-mono text-foreground">{formatBRL(totalPrizePool(form.prizes))}</span>
              </p>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gradient-primary border-0">
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payout / Metrics Dialog */}
      <Dialog open={!!payoutTournament} onOpenChange={(v) => { if (!v) setPayoutTournament(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isPayoutReview ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <BarChart3 className="w-5 h-5 text-cyan-400" />}
              {isPayoutReview ? 'Revisar e aprovar' : (payoutTournament?.status === 'ATIVO' ? 'Ranking ao vivo' : 'Métricas')} — {payoutTournament?.name}
              {payoutTournament?.status === 'ATIVO' && <span className="text-[10px] font-normal text-emerald-400 flex items-center gap-1 ml-1">● atualiza a cada 30s</span>}
            </DialogTitle>
          </DialogHeader>

          {payoutLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !payoutData ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum dado disponível</div>
          ) : (
            <div className="space-y-4">
              {/* Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div className="bg-secondary/50 rounded-lg p-2">
                  <p className="text-muted-foreground">Turnover</p>
                  <p className="font-semibold text-foreground">{formatBRL(payoutData.metrics.turnover)}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2">
                  <p className="text-muted-foreground">GGR</p>
                  <p className="font-semibold text-foreground">{formatBRL(payoutData.metrics.ggr)}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2">
                  <p className="text-muted-foreground">Custo do prêmio</p>
                  <p className="font-semibold text-foreground">{formatBRL(payoutData.metrics.prize_cost)}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2">
                  <p className="text-muted-foreground">ROI</p>
                  <p className="font-semibold text-foreground">{payoutData.metrics.roi !== null ? `${(payoutData.metrics.roi * 100).toFixed(1)}%` : '—'}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2">
                  <p className="text-muted-foreground">Participantes</p>
                  <p className="font-semibold text-foreground">{payoutData.metrics.participants}</p>
                </div>
              </div>

              {isPayoutReview ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Posição</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Prêmio</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Turnover</TableHead>
                      <TableHead>GGR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payoutData.items.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum prêmio pendente</TableCell></TableRow>
                    ) : payoutData.items.map(item => (
                      <TableRow key={item.reward_id}>
                        <TableCell>
                          <Checkbox checked={checkedIds.has(item.reward_id)} onCheckedChange={() => toggleChecked(item.reward_id)} />
                        </TableCell>
                        <TableCell>{item.rank ?? '—'}</TableCell>
                        <TableCell className="font-mono">{formatCPF(item.cpf)}</TableCell>
                        <TableCell className="font-mono text-emerald-400">{formatBRL(item.value)}</TableCell>
                        <TableCell>{item.reward_type}</TableCell>
                        <TableCell className="font-mono">{formatBRL(item.total_bet)}</TableCell>
                        <TableCell className="font-mono">{formatBRL(item.total_bet - item.total_won)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Posição</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead className="text-right">Pontos</TableHead>
                      <TableHead>Turnover</TableHead>
                      <TableHead>GGR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payoutData.participants.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhum participante</TableCell></TableRow>
                    ) : payoutData.participants.map((p, i) => (
                      <TableRow key={`${p.cpf}-${i}`}>
                        <TableCell>{p.rank ?? '—'}</TableCell>
                        <TableCell className="font-mono">{formatCPF(p.cpf)}</TableCell>
                        <TableCell className="font-mono text-right font-semibold text-foreground">{Number(p.score ?? 0).toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="font-mono">{formatBRL(p.total_bet)}</TableCell>
                        <TableCell className="font-mono">{formatBRL(p.ggr)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose>
            {isPayoutReview && (
              <Button onClick={confirmPay} disabled={payMutation.isPending || payoutLoading} className="gradient-success border-0 text-success-foreground">
                {payMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                <CheckCircle2 className="w-4 h-4 mr-2" /> Aprovar e pagar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TournamentAnalysis({ tournaments }: { tournaments: Tournament[] }) {
  const [tournamentId, setTournamentId] = useState<string>('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [rep, setRep] = useState('_all');
  const [sortBy, setSortBy] = useState<'total_bet' | 'ggr'>('total_bet');

  // O filtro de datas afeta APENAS quais torneios aparecem no seletor abaixo
  // (mostra torneios cujo período intersecta o intervalo). NÃO recalcula as
  // métricas/ranking — esses dados vêm do endpoint 'analyze' do torneio escolhido.
  const filteredTournaments = useMemo(() => {
    if (!dateStart && !dateEnd) return tournaments;
    const fStart = dateStart ? new Date(dateStart).getTime() : -Infinity;
    const fEnd = dateEnd ? new Date(`${dateEnd}T23:59:59`).getTime() : Infinity;
    return tournaments.filter(t => {
      const tStart = new Date(t.start_date).getTime();
      const tEnd = new Date(t.end_date).getTime();
      return tStart <= fEnd && tEnd >= fStart; // interseção dos períodos
    });
  }, [tournaments, dateStart, dateEnd]);

  const { data, isLoading } = useQuery({
    queryKey: ['tournament-analyze', tournamentId],
    enabled: !!tournamentId,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/functions/tournament-payout`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'analyze', tournament_id: tournamentId }),
      });
      if (!res.ok) throw new Error('Erro ao carregar análise do torneio');
      return await res.json() as AnalyzeData;
    },
  });

  const representantes = data?.representantes ?? [];

  // Aplica filtro de representante (client-side) e depois ordena.
  const participants = useMemo(() => {
    let list = data?.participants ?? [];
    if (rep !== '_all') list = list.filter(p => (p.representante ?? '') === rep);
    return [...list].sort((a, b) => sortBy === 'ggr' ? b.ggr - a.ggr : b.total_bet - a.total_bet);
  }, [data, rep, sortBy]);

  const visible = participants.slice(0, 100);
  const metrics = data?.metrics;

  return (
    <div className="space-y-4">
      {/* Seletor de torneio + filtro de datas */}
      <div className="glass-card p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div className="lg:col-span-2">
          <Label>Torneio</Label>
          <Select value={tournamentId} onValueChange={setTournamentId}>
            <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue placeholder="Selecione um torneio" /></SelectTrigger>
            <SelectContent>
              {filteredTournaments.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum torneio no período</div>
              ) : filteredTournaments.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Data início</Label>
          <Input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="bg-secondary border-border mt-1" />
        </div>
        <div>
          <Label>Data fim</Label>
          <Input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="bg-secondary border-border mt-1" />
        </div>
      </div>

      {!tournamentId ? (
        <div className="glass-card p-12 text-center">
          <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Selecione um torneio para ver a análise</p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !metrics ? (
        <div className="glass-card p-8 text-center text-sm text-muted-foreground">Nenhum dado disponível</div>
      ) : (
        <div className="space-y-4">
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-muted-foreground">Turnover total</p>
              <p className="font-semibold text-foreground text-sm">{formatBRL(metrics.turnover)}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-muted-foreground">GGR total</p>
              <p className="font-semibold text-foreground text-sm">{formatBRL(metrics.ggr)}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-muted-foreground">Prêmios pagos aos jogadores</p>
              <p className="font-semibold text-foreground text-sm">{formatBRL(metrics.total_won)}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-muted-foreground">RTP</p>
              <p className="font-semibold text-foreground text-sm">{metrics.rtp != null ? `${metrics.rtp.toFixed(2)}%` : '—'}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-muted-foreground">Participantes</p>
              <p className="font-semibold text-foreground text-sm">{metrics.participants}</p>
            </div>
          </div>

          {/* Filtros de representante e ordenação */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px]">
              <Label>Representante</Label>
              <Select value={rep} onValueChange={setRep}>
                <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {representantes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[200px]">
              <Label>Ordenar por</Label>
              <Select value={sortBy} onValueChange={v => setSortBy(v as 'total_bet' | 'ggr')}>
                <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total_bet">Turnover</SelectItem>
                  <SelectItem value="ggr">GGR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Ranking */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" /> Ranking
              </h3>
              <Badge variant="secondary" className="text-[10px]">{participants.length} jogadores</Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Posição</TableHead>
                  <TableHead>Jogador</TableHead>
                  <TableHead>Representante</TableHead>
                  <TableHead>Turnover</TableHead>
                  <TableHead>GGR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhum participante</TableCell></TableRow>
                ) : visible.map((p, i) => (
                  <TableRow key={`${p.cpf}-${i}`}>
                    <TableCell>{p.rank ?? '—'}</TableCell>
                    <TableCell className="font-mono">{p.username ?? formatCPF(p.cpf)}</TableCell>
                    <TableCell>{p.representante ?? '—'}</TableCell>
                    <TableCell className="font-mono">{formatBRL(p.total_bet)}</TableCell>
                    <TableCell className="font-mono">{formatBRL(p.ggr)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {participants.length > 100 && (
              <p className="text-[10px] text-muted-foreground mt-2">Exibindo 100 de {participants.length} jogadores</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
