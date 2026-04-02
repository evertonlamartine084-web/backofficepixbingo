import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Users, Gift, TrendingUp, DollarSign, Settings2, Loader2, Copy, ExternalLink, UserPlus, Check, Clock, AlertCircle, Plus, Trash2 } from 'lucide-react';

interface ReferralTier {
  min_referrals: number;
  reward_type: string;
  reward_value: number;
  label: string;
}

interface ReferralConfig {
  id?: string;
  created_at?: string;
  updated_at?: string;
  active: boolean;
  referrer_reward_type: string;
  referrer_reward_value: number;
  referred_reward_type: string;
  referred_reward_value: number;
  require_deposit: boolean;
  min_deposit_amount: number;
  require_bet: boolean;
  min_bet_amount: number;
  max_referrals_per_player: number;
  commission_enabled: boolean;
  commission_percent: number;
  commission_duration_days: number;
  title: string;
  description: string;
  terms_text: string;
  tiers: ReferralTier[];
  segment_id?: string | null;
}

interface Referral {
  id: string;
  referrer_cpf: string;
  referred_cpf: string;
  status: string;
  referrer_rewarded: boolean;
  referrer_reward_amount: number;
  referred_rewarded: boolean;
  referred_reward_amount: number;
  created_at: string;
}

interface ReferralCode {
  id: string;
  cpf: string;
  code: string;
  clicks: number;
  created_at: string;
}

interface Segment {
  id: string;
  name: string;
}
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { formatCPF, formatDateTime, maskCPF } from '@/lib/formatters';

export default function Referrals() {
  const qc = useQueryClient();
  const [configOpen, setConfigOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch config
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['referral_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('referral_config').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data as ReferralConfig | null;
    },
  });

  // Fetch segments for selector
  const { data: segments } = useQuery({
    queryKey: ['segments_list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('segments').select('id, name').order('name');
      if (error) throw error;
      return (data || []) as Segment[];
    },
  });

  // Fetch referrals
  const { data: referrals, isLoading: refsLoading } = useQuery({
    queryKey: ['referrals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('referrals').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data || []) as Referral[];
    },
  });

  // Fetch codes
  const { data: codes } = useQuery({
    queryKey: ['referral_codes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('referral_codes').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data || []) as ReferralCode[];
    },
  });

  // Stats
  const totalReferrals = referrals?.length || 0;
  const completedReferrals = referrals?.filter((r: Referral) => r.status === 'completed').length || 0;
  const pendingReferrals = referrals?.filter((r: Referral) => r.status !== 'completed').length || 0;
  const totalRewardsGiven = referrals?.reduce((s: number, r: Referral) => s + (r.referrer_reward_amount || 0) + (r.referred_reward_amount || 0), 0) || 0;
  const uniqueReferrers = new Set(referrals?.map((r: Referral) => r.referrer_cpf) || []).size;

  // Config form state
  const [formConfig, setFormConfig] = useState<ReferralConfig | null>(null);

  const openConfig = () => {
    setFormConfig(config ? { ...config, tiers: JSON.parse(JSON.stringify(config.tiers || [])) } : {
      active: true, referrer_reward_type: 'coins', referrer_reward_value: 50,
      referred_reward_type: 'coins', referred_reward_value: 25,
      require_deposit: true, min_deposit_amount: 20, require_bet: true, min_bet_amount: 10, max_referrals_per_player: 0,
      commission_enabled: false, commission_percent: 5, commission_duration_days: 30,
      title: 'Indique e Ganhe', description: 'Convide amigos e ganhe recompensas!',
      terms_text: '', tiers: [],
    });
    setConfigOpen(true);
  };

  const saveConfigMut = useMutation({
    mutationFn: async () => {
      if (!formConfig) return;
      const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = formConfig;
      const payload = { ...rest, updated_at: new Date().toISOString() };

      if (config?.id) {
        const { error } = await supabase.from('referral_config').update(payload).eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('referral_config').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral_config'] });
      setConfigOpen(false);
      toast.success('Configuração salva!');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  const addTier = () => {
    if (!formConfig) return;
    setFormConfig({
      ...formConfig,
      tiers: [...(formConfig.tiers || []), { min_referrals: 5, reward_type: 'coins', reward_value: 100, label: '' }],
    });
  };

  const removeTier = (idx: number) => {
    if (!formConfig) return;
    const t = [...formConfig.tiers];
    t.splice(idx, 1);
    setFormConfig({ ...formConfig, tiers: t });
  };

  const updateTier = (idx: number, field: string, value: string | number) => {
    if (!formConfig) return;
    const t = [...formConfig.tiers];
    t[idx] = { ...t[idx], [field]: value };
    setFormConfig({ ...formConfig, tiers: t });
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
      completed: { label: 'Concluído', variant: 'default' },
      pending: { label: 'Pendente', variant: 'secondary' },
      deposit_required: { label: 'Aguardando Depósito', variant: 'outline' },
      bet_required: { label: 'Aguardando Aposta', variant: 'outline' },
      expired: { label: 'Expirado', variant: 'destructive' },
    };
    const m = map[status] || { label: status, variant: 'secondary' as const };
    return <Badge variant={m.variant} className="text-[10px]">{m.label}</Badge>;
  };

  const rewardLabel = (type: string) => ({ coins: 'Moedas', xp: 'XP', diamonds: 'Diamantes', bonus: 'Bônus R$' }[type] || type);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Indique e Ganhe</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie o programa de indicações e recompensas</p>
        </div>
        <Button onClick={openConfig} variant="outline" className="border-border">
          <Settings2 className="w-4 h-4 mr-2" /> Configurar
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Users className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Total Indicações</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalReferrals}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Check className="w-4 h-4 text-success" />
            <span className="text-xs font-medium uppercase tracking-wider">Completas</span>
          </div>
          <p className="text-2xl font-bold text-success">{completedReferrals}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium uppercase tracking-wider">Pendentes</span>
          </div>
          <p className="text-2xl font-bold text-amber-400">{pendingReferrals}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Gift className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium uppercase tracking-wider">Recompensas</span>
          </div>
          <p className="text-2xl font-bold text-primary">{totalRewardsGiven}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-medium uppercase tracking-wider">Indicadores</span>
          </div>
          <p className="text-2xl font-bold text-cyan-400">{uniqueReferrers}</p>
        </div>
      </div>

      {/* Config summary */}
      {config && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Configuração Ativa</h3>
            <Badge variant={config.active ? 'default' : 'destructive'} className="text-[10px]">
              {config.active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Indicador ganha</span>
              <p className="font-semibold text-foreground">{config.referrer_reward_value} {rewardLabel(config.referrer_reward_type)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Indicado ganha</span>
              <p className="font-semibold text-foreground">{config.referred_reward_value} {rewardLabel(config.referred_reward_type)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Depósito mínimo</span>
              <p className="font-semibold text-foreground">{config.require_deposit ? `R$ ${config.min_deposit_amount}` : 'Não exigido'}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Aposta mínima</span>
              <p className="font-semibold text-foreground">{config.require_bet ? `R$ ${config.min_bet_amount}` : 'Não exigida'}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Limite indicações</span>
              <p className="font-semibold text-foreground">{config.max_referrals_per_player > 0 ? config.max_referrals_per_player : 'Ilimitado'}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Segmento</span>
              <p className="font-semibold text-foreground">{config.segment_id ? (segments?.find((s: Segment) => s.id === config.segment_id)?.name || 'Segmento selecionado') : 'Todos'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Indicações</TabsTrigger>
          <TabsTrigger value="codes">Códigos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {refsLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : referrals?.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <UserPlus className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma indicação registrada ainda</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="text-xs font-semibold uppercase">Indicador</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Indicado</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Recomp. Indicador</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Recomp. Indicado</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals?.map((ref: Referral) => (
                    <TableRow key={ref.id} className="hover:bg-secondary/30">
                      <TableCell className="font-mono text-sm">{maskCPF(ref.referrer_cpf)}</TableCell>
                      <TableCell className="font-mono text-sm">{maskCPF(ref.referred_cpf)}</TableCell>
                      <TableCell>{statusBadge(ref.status)}</TableCell>
                      <TableCell className="text-sm">
                        {ref.referrer_rewarded ? (
                          <span className="text-success font-semibold">{ref.referrer_reward_amount}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {ref.referred_rewarded ? (
                          <span className="text-success font-semibold">{ref.referred_reward_amount}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(ref.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="codes" className="mt-4">
          {!codes || codes.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <ExternalLink className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum código gerado ainda</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="text-xs font-semibold uppercase">CPF</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Código</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Cliques</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Indicações</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Criado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((c: ReferralCode) => {
                    const refsCount = referrals?.filter((r: Referral) => r.referrer_cpf === c.cpf).length || 0;
                    return (
                      <TableRow key={c.id} className="hover:bg-secondary/30">
                        <TableCell className="font-mono text-sm">{maskCPF(c.cpf)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{c.code}</Badge>
                        </TableCell>
                        <TableCell className="text-sm font-semibold">{c.clicks}</TableCell>
                        <TableCell className="text-sm font-semibold">{refsCount}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(c.created_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Config Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar Indique e Ganhe</DialogTitle>
          </DialogHeader>
          {formConfig && (
            <div className="space-y-6">
              {/* Active toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                <div>
                  <p className="text-sm font-medium">Programa ativo</p>
                  <p className="text-xs text-muted-foreground">Habilita/desabilita o programa de indicação</p>
                </div>
                <Switch checked={formConfig.active} onCheckedChange={v => setFormConfig({ ...formConfig, active: v })} />
              </div>

              {/* Segment restriction */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Segmento</h4>
                <p className="text-xs text-muted-foreground">Restringe o programa a jogadores de um segmento específico. Deixe vazio para todos.</p>
                <Select value={formConfig.segment_id || '_none'} onValueChange={v => setFormConfig({ ...formConfig, segment_id: v === '_none' ? null : v })}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Todos os jogadores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Todos os jogadores</SelectItem>
                    {(segments || []).map((s: Segment) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Display */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Exibição</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Título</Label>
                    <Input value={formConfig.title} onChange={e => setFormConfig({ ...formConfig, title: e.target.value })} className="bg-secondary border-border" />
                  </div>
                  <div>
                    <Label className="text-xs">Descrição</Label>
                    <Input value={formConfig.description} onChange={e => setFormConfig({ ...formConfig, description: e.target.value })} className="bg-secondary border-border" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Termos e regras</Label>
                  <Textarea value={formConfig.terms_text || ''} onChange={e => setFormConfig({ ...formConfig, terms_text: e.target.value })} className="bg-secondary border-border" rows={3} />
                </div>
              </div>

              {/* Rewards */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Recompensas</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Indicador (quem convida)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Tipo</Label>
                        <Select value={formConfig.referrer_reward_type} onValueChange={v => setFormConfig({ ...formConfig, referrer_reward_type: v })}>
                          <SelectTrigger className="h-8 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="coins">Moedas</SelectItem>
                            <SelectItem value="xp">XP</SelectItem>
                            <SelectItem value="diamonds">Diamantes</SelectItem>
                            <SelectItem value="bonus">Bônus R$</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Valor</Label>
                        <Input type="number" value={formConfig.referrer_reward_value} onChange={e => setFormConfig({ ...formConfig, referrer_reward_value: Number(e.target.value) })} className="h-8 text-xs bg-background border-border font-mono" />
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Indicado (quem é convidado)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Tipo</Label>
                        <Select value={formConfig.referred_reward_type} onValueChange={v => setFormConfig({ ...formConfig, referred_reward_type: v })}>
                          <SelectTrigger className="h-8 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="coins">Moedas</SelectItem>
                            <SelectItem value="xp">XP</SelectItem>
                            <SelectItem value="diamonds">Diamantes</SelectItem>
                            <SelectItem value="bonus">Bônus R$</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Valor</Label>
                        <Input type="number" value={formConfig.referred_reward_value} onChange={e => setFormConfig({ ...formConfig, referred_reward_value: Number(e.target.value) })} className="h-8 text-xs bg-background border-border font-mono" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Requirements */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Requisitos</h4>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                  <div>
                    <p className="text-xs font-medium">Exigir depósito</p>
                    <p className="text-[10px] text-muted-foreground">Indicado precisa fazer depósito para completar</p>
                  </div>
                  <Switch checked={formConfig.require_deposit} onCheckedChange={v => setFormConfig({ ...formConfig, require_deposit: v })} />
                </div>
                {formConfig.require_deposit && (
                  <div>
                    <Label className="text-xs">Depósito mínimo (R$)</Label>
                    <Input type="number" value={formConfig.min_deposit_amount} onChange={e => setFormConfig({ ...formConfig, min_deposit_amount: Number(e.target.value) })} className="bg-secondary border-border font-mono" />
                  </div>
                )}
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                  <div>
                    <p className="text-xs font-medium">Exigir aposta</p>
                    <p className="text-[10px] text-muted-foreground">Indicado precisa apostar para a indicação contar</p>
                  </div>
                  <Switch checked={formConfig.require_bet ?? true} onCheckedChange={v => setFormConfig({ ...formConfig, require_bet: v })} />
                </div>
                {formConfig.require_bet && (
                  <div>
                    <Label className="text-xs">Aposta mínima (R$)</Label>
                    <Input type="number" value={formConfig.min_bet_amount ?? 10} onChange={e => setFormConfig({ ...formConfig, min_bet_amount: Number(e.target.value) })} className="bg-secondary border-border font-mono" />
                  </div>
                )}
                <div>
                  <Label className="text-xs">Limite de indicações por jogador (0 = ilimitado)</Label>
                  <Input type="number" value={formConfig.max_referrals_per_player} onChange={e => setFormConfig({ ...formConfig, max_referrals_per_player: Number(e.target.value) })} className="bg-secondary border-border font-mono" />
                </div>
              </div>

              {/* Commission */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                  <div>
                    <p className="text-xs font-medium">Comissão recorrente</p>
                    <p className="text-[10px] text-muted-foreground">Indicador ganha % dos depósitos do indicado</p>
                  </div>
                  <Switch checked={formConfig.commission_enabled} onCheckedChange={v => setFormConfig({ ...formConfig, commission_enabled: v })} />
                </div>
                {formConfig.commission_enabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Comissão (%)</Label>
                      <Input type="number" value={formConfig.commission_percent} onChange={e => setFormConfig({ ...formConfig, commission_percent: Number(e.target.value) })} className="bg-secondary border-border font-mono" />
                    </div>
                    <div>
                      <Label className="text-xs">Duração (dias)</Label>
                      <Input type="number" value={formConfig.commission_duration_days} onChange={e => setFormConfig({ ...formConfig, commission_duration_days: Number(e.target.value) })} className="bg-secondary border-border font-mono" />
                    </div>
                  </div>
                )}
              </div>

              {/* Tiers */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">Metas de Indicação (Tiers)</h4>
                  <Button variant="outline" size="sm" onClick={addTier} className="border-dashed text-xs">
                    <Plus className="w-3 h-3 mr-1" /> Adicionar Tier
                  </Button>
                </div>
                {(formConfig.tiers || []).map((tier: ReferralTier, idx: number) => (
                  <div key={idx} className="p-3 rounded-lg bg-secondary/30 border border-border space-y-2 group relative">
                    <Button variant="ghost" size="icon" className="h-6 w-6 absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => removeTier(idx)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <Label className="text-[10px]">Min. indicações</Label>
                        <Input type="number" value={tier.min_referrals} onChange={e => updateTier(idx, 'min_referrals', Number(e.target.value))} className="h-7 text-xs bg-background border-border font-mono" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Tipo recompensa</Label>
                        <Select value={tier.reward_type} onValueChange={v => updateTier(idx, 'reward_type', v)}>
                          <SelectTrigger className="h-7 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="coins">Moedas</SelectItem>
                            <SelectItem value="xp">XP</SelectItem>
                            <SelectItem value="diamonds">Diamantes</SelectItem>
                            <SelectItem value="bonus">Bônus R$</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px]">Valor</Label>
                        <Input type="number" value={tier.reward_value} onChange={e => updateTier(idx, 'reward_value', Number(e.target.value))} className="h-7 text-xs bg-background border-border font-mono" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Label</Label>
                        <Input value={tier.label} onChange={e => updateTier(idx, 'label', e.target.value)} placeholder="Ex: 5 indicações = 100 Moedas" className="h-7 text-xs bg-background border-border" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={() => saveConfigMut.mutate()} disabled={saveConfigMut.isPending} className="gradient-primary border-0">
              {saveConfigMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
