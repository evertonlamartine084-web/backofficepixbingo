import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Loader2, Trophy, Swords, Play, Square, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/formatters';
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
  ENCERRADO: { label: 'Encerrado', color: 'bg-red-500/15 text-red-400' },
};

interface Prize { rank: number; value: number; description: string }

const emptyForm = {
  name: '', description: '', image_url: '', start_date: '', end_date: '',
  metric: 'total_bet', game_filter: 'all', min_bet: '0', status: 'RASCUNHO',
  prizes: [{ rank: 1, value: 500, description: '1º lugar' }, { rank: 2, value: 200, description: '2º lugar' }, { rank: 3, value: 100, description: '3º lugar' }] as Prize[],
};

export default function Tournaments() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: tournaments = [], isLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
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
        description: form.description || null,
        image_url: form.image_url || null,
        start_date: new Date(form.start_date).toISOString(),
        end_date: new Date(form.end_date).toISOString(),
        metric: form.metric,
        game_filter: form.game_filter,
        min_bet: parseFloat(form.min_bet) || 0,
        status: form.status,
        prizes: validPrizes,
      };
      if (editId) {
        const { error } = await supabase.from('tournaments').update(payload as any).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tournaments').insert(payload as any);
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
      const { error } = await supabase.from('tournaments').update({ status } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tournaments'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const closeDialog = () => { setOpen(false); setEditId(null); setForm(emptyForm); };

  const openEdit = (t: any) => {
    const prizes = (t.prizes || []).map((p: any) => ({ rank: p.rank, value: p.value, description: p.description }));
    setEditId(t.id);
    setForm({
      name: t.name, description: t.description || '', image_url: t.image_url || '',
      start_date: t.start_date?.slice(0, 16) || '', end_date: t.end_date?.slice(0, 16) || '',
      metric: t.metric, game_filter: t.game_filter, min_bet: String(t.min_bet || 0),
      status: t.status, prizes: prizes.length > 0 ? prizes : emptyForm.prizes,
    });
    setOpen(true);
  };

  const updatePrize = (index: number, field: keyof Prize, value: any) => {
    setForm(f => {
      const prizes = [...f.prizes];
      prizes[index] = { ...prizes[index], [field]: field === 'rank' || field === 'value' ? Number(value) : value };
      return { ...f, prizes };
    });
  };

  const addPrize = () => {
    setForm(f => ({ ...f, prizes: [...f.prizes, { rank: f.prizes.length + 1, value: 0, description: '' }] }));
  };

  const removePrize = (index: number) => {
    setForm(f => ({ ...f, prizes: f.prizes.filter((_, i) => i !== index) }));
  };

  const metricLabel = (m: string) => METRICS.find(x => x.value === m)?.label || m;
  const gameLabel = (g: string) => GAMES.find(x => x.value === g)?.label || g;

  const totalPrizePool = (prizes: any[]) => (prizes || []).reduce((s: number, p: any) => s + Number(p.value || 0), 0);

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

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : tournaments.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Nenhum torneio criado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tournaments.map((t: any) => {
            const st = STATUS_MAP[t.status] || STATUS_MAP.RASCUNHO;
            const prizes: Prize[] = t.prizes || [];
            return (
              <Card key={t.id} className="glass-card border-border hover:border-primary/30 transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground truncate">{t.name}</h3>
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

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{formatDateTime(t.start_date)} — {formatDateTime(t.end_date)}</span>
                  </div>

                  {prizes.length > 0 && (
                    <div className="space-y-1">
                      {prizes.slice(0, 3).map((p: Prize, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{p.description || `${p.rank}º lugar`}</span>
                          <span className="font-mono font-semibold text-emerald-400">R$ {Number(p.value).toLocaleString('pt-BR')}</span>
                        </div>
                      ))}
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
                      <Button size="sm" variant="destructive" className="flex-1" onClick={() => statusMutation.mutate({ id: t.id, status: 'ENCERRADO' })}>
                        <Square className="w-3 h-3 mr-1" /> Encerrar
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(t.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Torneio' : 'Novo Torneio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Torneio Semanal Keno" className="bg-secondary border-border mt-1" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Aposte no Keno e concorra a prêmios..." className="bg-secondary border-border mt-1" rows={2} />
            </div>
            <div>
              <Label>URL da Imagem</Label>
              <Input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://..." className="bg-secondary border-border mt-1" />
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

            {/* Prizes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Prêmios</Label>
                <Button variant="ghost" size="sm" onClick={addPrize} className="text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Adicionar
                </Button>
              </div>
              {form.prizes.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input type="number" value={p.rank} onChange={e => updatePrize(i, 'rank', e.target.value)} className="bg-secondary border-border font-mono w-16" placeholder="#" />
                  <Input value={p.description} onChange={e => updatePrize(i, 'description', e.target.value)} className="bg-secondary border-border flex-1" placeholder="Descrição" />
                  <Input type="number" value={p.value} onChange={e => updatePrize(i, 'value', e.target.value)} className="bg-secondary border-border font-mono w-28" placeholder="R$" />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => removePrize(i)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
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
