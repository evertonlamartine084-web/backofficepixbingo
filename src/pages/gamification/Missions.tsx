/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Loader2, Target, Zap, Calendar, Clock, Lock, RefreshCw, MousePointer, Hand, ExternalLink, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { logAudit } from '@/hooks/use-audit';

const MISSION_TYPES = [
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'one_time', label: 'Única' },
];

const CONDITION_TYPES = [
  { value: 'deposit', label: 'Depositar (R$)' },
  { value: 'bet', label: 'Apostar (R$)' },
  { value: 'min_balance', label: 'Saldo mínimo na banca (R$)' },
  { value: 'win', label: 'Vencer partida(s)' },
  { value: 'login', label: 'Fazer login' },
  { value: 'play_keno', label: 'Jogar Keno' },
  { value: 'play_cassino', label: 'Jogar Cassino' },
  { value: 'consecutive_days', label: 'Dias Consecutivos' },
  { value: 'total_games', label: 'Total de Partidas' },
  { value: 'referral', label: 'Indicar amigo(s)' },
  { value: 'spin_wheel', label: 'Girar a Roleta' },
  { value: 'store_purchase', label: 'Comprar na Loja' },
];

const REWARD_TYPES = [
  { value: 'bonus', label: 'Bônus (R$)' },
  { value: 'coins', label: 'Moedas' },
  { value: 'xp', label: 'XP' },
  { value: 'spins', label: 'Giros na Roleta' },
  { value: 'free_bet', label: 'Free Bet (R$)' },
];

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Sem recorrência' },
  { value: 'daily', label: 'Reseta diariamente' },
  { value: 'weekly', label: 'Reseta semanalmente' },
  { value: 'monthly', label: 'Reseta mensalmente' },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-secondary text-muted-foreground' },
  ATIVO: { label: 'Ativo', color: 'bg-emerald-500/15 text-emerald-400' },
  ARQUIVADO: { label: 'Arquivado', color: 'bg-red-500/15 text-red-400' },
};

const emptyForm = {
  name: '', description: '', icon_url: '', type: 'daily',
  condition_type: 'deposit', condition_value: '1',
  reward_type: 'bonus', reward_value: '5', segment_id: '',
  status: 'ATIVO', priority: '100', require_optin: false,
  time_limit_hours: '', start_date: '', end_date: '',
  recurrence: 'none', cta_text: '', cta_url: '', manual_claim: false,
};

export default function Missions() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');

  const { data: segments = [] } = useQuery({
    queryKey: ['segments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('segments').select('id, name').order('name');
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: missions = [], isLoading } = useQuery({
    queryKey: ['missions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('missions').select('*').order('priority', { ascending: true }).order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.condition_type) throw new Error('Preencha nome e condição');
      const payload: any = {
        name: form.name,
        description: form.description || null,
        icon_url: form.icon_url || null,
        type: form.type,
        condition_type: form.condition_type,
        condition_value: parseFloat(form.condition_value) || 1,
        reward_type: form.reward_type,
        reward_value: parseFloat(form.reward_value) || 0,
        segment_id: form.segment_id || null,
        status: form.status || 'ATIVO',
        priority: parseInt(form.priority) || 100,
        require_optin: form.require_optin,
        time_limit_hours: form.time_limit_hours ? parseInt(form.time_limit_hours) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        recurrence: form.recurrence || 'none',
        cta_text: form.cta_text || null,
        cta_url: form.cta_url || null,
        manual_claim: form.manual_claim,
        active: form.status === 'ATIVO',
      };
      if (editId) {
        const { error } = await supabase.from('missions').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('missions').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] });
      toast.success(editId ? 'Missão atualizada' : 'Missão criada');
      logAudit({ action: editId ? 'EDITAR' : 'CRIAR', resource_type: 'missao', resource_name: form.name });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('missions').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['missions'] });
      const m = missions.find(x => x.id === id);
      toast.success('Missão excluída');
      logAudit({ action: 'EXCLUIR', resource_type: 'missao', resource_id: id, resource_name: m?.name });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeDialog = () => { setOpen(false); setEditId(null); setForm(emptyForm); };

  const openEdit = (m: any) => {
    setEditId(m.id);
    setForm({
      name: m.name, description: m.description || '', icon_url: m.icon_url || '',
      type: m.type, condition_type: m.condition_type,
      condition_value: String(m.condition_value), reward_type: m.reward_type,
      reward_value: String(m.reward_value), segment_id: m.segment_id || '',
      status: m.status || 'ATIVO', priority: String(m.priority || 100),
      require_optin: m.require_optin || false,
      time_limit_hours: m.time_limit_hours ? String(m.time_limit_hours) : '',
      start_date: m.start_date ? m.start_date.slice(0, 16) : '',
      end_date: m.end_date ? m.end_date.slice(0, 16) : '',
      recurrence: m.recurrence || 'none',
      cta_text: m.cta_text || '', cta_url: m.cta_url || '',
      manual_claim: m.manual_claim || false,
    });
    setOpen(true);
  };

  const condLabel = (type: string) => CONDITION_TYPES.find(c => c.value === type)?.label || type;
  const rewLabel = (type: string) => REWARD_TYPES.find(r => r.value === type)?.label || type;
  const typeLabel = (type: string) => MISSION_TYPES.find(t => t.value === type)?.label || type;

  const groupedByType = MISSION_TYPES.map(t => ({
    ...t,
    missions: missions.filter(m => m.type === t.value),
  })).filter(g => g.missions.length > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Target className="w-6 h-6 text-amber-400" /> Missões
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure missões com recorrência, opt-in, timer e recompensas</p>
        </div>
        <Button className="gradient-primary border-0" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Nova Missão
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{missions.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{missions.filter(m => m.status === 'ATIVO' || m.active).length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ativas</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{missions.filter(m => m.recurrence && m.recurrence !== 'none').length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Recorrentes</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-purple-400">{missions.filter(m => m.require_optin).length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Com Opt-in</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : missions.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Nenhuma missão criada</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByType.map(group => (
            <div key={group.value} className="space-y-3">
              <div className="flex items-center gap-2">
                {group.value === 'daily' && <Zap className="w-4 h-4 text-amber-400" />}
                {group.value === 'weekly' && <Calendar className="w-4 h-4 text-cyan-400" />}
                {group.value === 'monthly' && <RefreshCw className="w-4 h-4 text-purple-400" />}
                {group.value === 'one_time' && <Target className="w-4 h-4 text-emerald-400" />}
                <h2 className="text-sm font-semibold text-foreground">Missões {group.label}s</h2>
                <Badge variant="secondary" className="text-xs">{group.missions.length}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.missions.map((m: any) => {
                  const st = STATUS_MAP[m.status] || STATUS_MAP.ATIVO;
                  return (
                    <Card key={m.id} className="border-border hover:border-primary/30 transition-colors cursor-pointer group" onClick={() => openEdit(m)}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            {m.icon_url ? (
                              <img src={m.icon_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                                <Target className="w-5 h-5 text-amber-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-foreground truncate">{m.name}</p>
                              {m.description && <p className="text-xs text-muted-foreground truncate">{m.description}</p>}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(m.id); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {/* Condition + Reward */}
                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {condLabel(m.condition_type)} <span className="font-mono font-semibold text-foreground">
                              {m.condition_type === 'deposit' || m.condition_type === 'bet' || m.condition_type === 'min_balance' ? `R$ ${Number(m.condition_value).toLocaleString('pt-BR')}` : `${m.condition_value}x`}
                            </span>
                          </span>
                          <span className="font-mono font-semibold text-emerald-400">
                            {m.reward_type === 'bonus' || m.reward_type === 'free_bet' ? `R$ ${Number(m.reward_value).toLocaleString('pt-BR')}` : `${m.reward_value} ${rewLabel(m.reward_type)}`}
                          </span>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <Badge variant="secondary" className={`text-[10px] ${st.color}`}>{st.label}</Badge>
                          {m.recurrence && m.recurrence !== 'none' && (
                            <Badge variant="secondary" className="text-[10px] bg-purple-500/10 text-purple-400">
                              <RefreshCw className="w-2.5 h-2.5 mr-0.5" />{RECURRENCE_OPTIONS.find(r => r.value === m.recurrence)?.label}
                            </Badge>
                          )}
                          {m.require_optin && (
                            <Badge variant="secondary" className="text-[10px] bg-cyan-500/10 text-cyan-400">
                              <Hand className="w-2.5 h-2.5 mr-0.5" />Opt-in
                            </Badge>
                          )}
                          {m.time_limit_hours && (
                            <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400">
                              <Clock className="w-2.5 h-2.5 mr-0.5" />{m.time_limit_hours}h
                            </Badge>
                          )}
                          {m.manual_claim && (
                            <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-400">
                              <MousePointer className="w-2.5 h-2.5 mr-0.5" />Claim
                            </Badge>
                          )}
                          {m.segment_id && (
                            <Badge variant="outline" className="text-[10px]">
                              {segments.find(s => s.id === m.segment_id)?.name || 'Segmento'}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Missão' : 'Nova Missão'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Basic */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Nome</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Deposite R$50" className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RASCUNHO">Rascunho</SelectItem>
                    <SelectItem value="ATIVO">Ativo</SelectItem>
                    <SelectItem value="ARQUIVADO">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Deposite R$50 hoje e ganhe..." className="bg-secondary border-border mt-1" rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MISSION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade (menor = primeiro)</Label>
                <Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="bg-secondary border-border font-mono mt-1" placeholder="100" />
              </div>
            </div>

            <div>
              <Label>URL do Ícone</Label>
              <Input value={form.icon_url} onChange={e => setForm(f => ({ ...f, icon_url: e.target.value }))} placeholder="https://..." className="bg-secondary border-border mt-1" />
            </div>

            {/* Condition + Reward */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground mb-3">Condição e Recompensa</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Condição</Label>
                  <Select value={form.condition_type} onValueChange={v => setForm(f => ({ ...f, condition_type: v }))}>
                    <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDITION_TYPES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor da Condição</Label>
                  <Input type="number" value={form.condition_value} onChange={e => setForm(f => ({ ...f, condition_value: e.target.value }))} className="bg-secondary border-border font-mono mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <Label>Recompensa</Label>
                  <Select value={form.reward_type} onValueChange={v => setForm(f => ({ ...f, reward_type: v }))}>
                    <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REWARD_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor da Recompensa</Label>
                  <Input type="number" value={form.reward_value} onChange={e => setForm(f => ({ ...f, reward_value: e.target.value }))} className="bg-secondary border-border font-mono mt-1" />
                </div>
              </div>
            </div>

            {/* Advanced */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground mb-3">Configuração Avançada</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Recorrência</Label>
                  <Select value={form.recurrence} onValueChange={v => setForm(f => ({ ...f, recurrence: v }))}>
                    <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="flex items-center gap-1"><Clock className="w-3 h-3" /> Tempo Limite (horas)</Label>
                  <Input type="number" value={form.time_limit_hours} onChange={e => setForm(f => ({ ...f, time_limit_hours: e.target.value }))} placeholder="Sem limite" className="bg-secondary border-border font-mono mt-1" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <Label>Data Início (opcional)</Label>
                  <Input type="datetime-local" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="bg-secondary border-border mt-1" />
                </div>
                <div>
                  <Label>Data Fim (opcional)</Label>
                  <Input type="datetime-local" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="bg-secondary border-border mt-1" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div>
                    <Label className="text-xs flex items-center gap-1"><Hand className="w-3 h-3 text-cyan-400" /> Requer Opt-in</Label>
                    <p className="text-[10px] text-muted-foreground">Jogador precisa se inscrever</p>
                  </div>
                  <Switch checked={form.require_optin} onCheckedChange={v => setForm(f => ({ ...f, require_optin: v }))} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div>
                    <Label className="text-xs flex items-center gap-1"><MousePointer className="w-3 h-3 text-emerald-400" /> Claim Manual</Label>
                    <p className="text-[10px] text-muted-foreground">Jogador resgata manualmente</p>
                  </div>
                  <Switch checked={form.manual_claim} onCheckedChange={v => setForm(f => ({ ...f, manual_claim: v }))} />
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <ExternalLink className="w-4 h-4" /> Botão de Ação (CTA)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Texto do Botão</Label>
                  <Input value={form.cta_text} onChange={e => setForm(f => ({ ...f, cta_text: e.target.value }))} placeholder="Ex: Depositar Agora" className="bg-secondary border-border mt-1" />
                </div>
                <div>
                  <Label>URL do Botão</Label>
                  <Input value={form.cta_url} onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))} placeholder="https://..." className="bg-secondary border-border mt-1" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Opcional. Exibe um botão no card da missão no widget.</p>
            </div>

            {/* Segment */}
            <div>
              <Label>Segmento (opcional)</Label>
              <Select value={form.segment_id || '_all'} onValueChange={v => setForm(f => ({ ...f, segment_id: v === '_all' ? '' : v }))}>
                <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos os jogadores</SelectItem>
                  {segments.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gradient-primary border-0">
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
