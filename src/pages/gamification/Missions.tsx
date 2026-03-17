import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Loader2, Target, Zap, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { logAudit } from '@/hooks/use-audit';

const MISSION_TYPES = [
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
];

const CONDITION_TYPES = [
  { value: 'deposit', label: 'Depositar (R$)' },
  { value: 'bet', label: 'Apostar (R$)' },
  { value: 'win', label: 'Vencer partida(s)' },
  { value: 'login', label: 'Fazer login' },
  { value: 'play_keno', label: 'Jogar Keno' },
  { value: 'play_cassino', label: 'Jogar Cassino' },
];

const REWARD_TYPES = [
  { value: 'bonus', label: 'Bônus (R$)' },
  { value: 'coins', label: 'Moedas' },
  { value: 'xp', label: 'XP' },
];

const emptyForm = {
  name: '', description: '', icon_url: '', type: 'daily',
  condition_type: 'deposit', condition_value: '1',
  reward_type: 'bonus', reward_value: '5', segment_id: '',
};

export default function Missions() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

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
      const { data, error } = await supabase.from('missions').select('*').order('type').order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.condition_type) throw new Error('Preencha nome e condição');
      const payload = {
        name: form.name,
        description: form.description || null,
        icon_url: form.icon_url || null,
        type: form.type,
        condition_type: form.condition_type,
        condition_value: parseFloat(form.condition_value) || 1,
        reward_type: form.reward_type,
        reward_value: parseFloat(form.reward_value) || 0,
        segment_id: form.segment_id || null,
      };
      if (editId) {
        const { error } = await supabase.from('missions').update(payload as any).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('missions').insert(payload as any);
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

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('missions').update({ active } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['missions'] }),
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
    });
    setOpen(true);
  };

  const condLabel = (type: string) => CONDITION_TYPES.find(c => c.value === type)?.label || type;
  const rewLabel = (type: string) => REWARD_TYPES.find(r => r.value === type)?.label || type;

  const dailyMissions = missions.filter(m => m.type === 'daily');
  const weeklyMissions = missions.filter(m => m.type === 'weekly');

  const renderTable = (items: any[], title: string, icon: React.ReactNode) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Badge variant="secondary" className="text-xs">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <div className="glass-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma missão {title.toLowerCase()}</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Missão</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Condição</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Recompensa</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Segmento</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Ativo</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m: any) => (
                <TableRow key={m.id} className="hover:bg-secondary/30">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {m.icon_url ? (
                        <img src={m.icon_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                          <Target className="w-4 h-4 text-amber-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-foreground text-sm">{m.name}</p>
                        {m.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{m.description}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{condLabel(m.condition_type)}</span>
                    <span className="font-mono font-semibold text-foreground ml-1">
                      {m.condition_type === 'deposit' || m.condition_type === 'bet'
                        ? `R$ ${Number(m.condition_value).toLocaleString('pt-BR')}`
                        : `${m.condition_value}x`}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm font-semibold text-emerald-400">
                      {m.reward_type === 'bonus' ? `R$ ${Number(m.reward_value).toLocaleString('pt-BR')}` : `${m.reward_value} ${rewLabel(m.reward_type)}`}
                    </span>
                  </TableCell>
                  <TableCell>
                    {m.segment_id ? (
                      <Badge variant="outline" className="text-xs">{segments.find(s => s.id === m.segment_id)?.name || 'Segmento'}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Todos</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={m.active} onCheckedChange={(v) => toggleMutation.mutate({ id: m.id, active: v })} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(m.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Target className="w-6 h-6 text-amber-400" /> Missões
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure missões diárias e semanais com recompensas</p>
        </div>
        <Button className="gradient-primary border-0" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Nova Missão
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-6">
          {renderTable(dailyMissions, 'Missões Diárias', <Zap className="w-4 h-4 text-amber-400" />)}
          {renderTable(weeklyMissions, 'Missões Semanais', <Calendar className="w-4 h-4 text-cyan-400" />)}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Missão' : 'Nova Missão'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Deposite R$50" className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MISSION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Deposite R$50 hoje e ganhe..." className="bg-secondary border-border mt-1" rows={2} />
            </div>
            <div>
              <Label>URL do Ícone</Label>
              <Input value={form.icon_url} onChange={e => setForm(f => ({ ...f, icon_url: e.target.value }))} placeholder="https://..." className="bg-secondary border-border mt-1" />
            </div>
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
                <Label>Valor</Label>
                <Input type="number" value={form.condition_value} onChange={e => setForm(f => ({ ...f, condition_value: e.target.value }))} className="bg-secondary border-border font-mono mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                <Label>Valor</Label>
                <Input type="number" value={form.reward_value} onChange={e => setForm(f => ({ ...f, reward_value: e.target.value }))} className="bg-secondary border-border font-mono mt-1" />
              </div>
            </div>
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
