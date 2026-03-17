import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Loader2, RotateCw, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { logAudit } from '@/hooks/use-audit';

const PRIZE_TYPES = [
  { value: 'bonus', label: 'Bônus (R$)' },
  { value: 'coins', label: 'Moedas' },
  { value: 'xp', label: 'XP' },
  { value: 'nothing', label: 'Nada (Tente novamente)' },
];

const emptyForm = {
  label: '', value: '0', type: 'bonus', probability: '1', color: '#6366f1', icon_url: '', segment_id: '',
};

export default function DailyWheel() {
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

  const { data: prizes = [], isLoading } = useQuery({
    queryKey: ['daily_wheel_prizes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('daily_wheel_prizes').select('*').order('probability', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.label) throw new Error('Preencha o rótulo');
      const payload = {
        label: form.label,
        value: parseFloat(form.value) || 0,
        type: form.type,
        probability: parseInt(form.probability) || 1,
        color: form.color,
        icon_url: form.icon_url || null,
        segment_id: form.segment_id || null,
      };
      if (editId) {
        const { error } = await supabase.from('daily_wheel_prizes').update(payload as any).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('daily_wheel_prizes').insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily_wheel_prizes'] });
      toast.success(editId ? 'Prêmio atualizado' : 'Prêmio criado');
      logAudit({ action: editId ? 'EDITAR' : 'CRIAR', resource_type: 'roleta_premio', resource_name: form.label });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('daily_wheel_prizes').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['daily_wheel_prizes'] });
      const p = prizes.find(x => x.id === id);
      toast.success('Prêmio excluído');
      logAudit({ action: 'EXCLUIR', resource_type: 'roleta_premio', resource_id: id, resource_name: p?.label });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('daily_wheel_prizes').update({ active } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily_wheel_prizes'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const closeDialog = () => { setOpen(false); setEditId(null); setForm(emptyForm); };

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({
      label: p.label, value: String(p.value), type: p.type,
      probability: String(p.probability), color: p.color, icon_url: p.icon_url || '', segment_id: p.segment_id || '',
    });
    setOpen(true);
  };

  const typeLabel = (t: string) => PRIZE_TYPES.find(x => x.value === t)?.label || t;

  // Calculate real probabilities
  const totalWeight = prizes.filter(p => p.active).reduce((s, p) => s + (p.probability || 0), 0);
  const calcPct = (weight: number) => totalWeight > 0 ? ((weight / totalWeight) * 100).toFixed(1) : '0';

  // Wheel preview colors
  const activeSlices = prizes.filter(p => p.active);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <RotateCw className="w-6 h-6 text-purple-400" /> Roleta Diária
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure os prêmios e probabilidades da roleta</p>
        </div>
        <Button className="gradient-primary border-0" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Novo Prêmio
        </Button>
      </div>

      {/* Wheel Preview */}
      {activeSlices.length > 0 && (
        <div className="glass-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Preview da Roleta</p>
          <div className="flex items-center gap-4 flex-wrap">
            {activeSlices.map((p: any) => (
              <div key={p.id} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: p.color }} />
                <span className="text-xs text-foreground">{p.label}</span>
                <span className="text-[10px] text-muted-foreground">({calcPct(p.probability)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : prizes.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <RotateCw className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Nenhum prêmio configurado</p>
          <p className="text-xs text-muted-foreground mt-1">Adicione pelo menos 4 prêmios para a roleta funcionar</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Cor</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Rótulo</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Tipo</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Valor</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Peso</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Probabilidade</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Ativo</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prizes.map((p: any) => (
                <TableRow key={p.id} className="hover:bg-secondary/30">
                  <TableCell>
                    <div className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: p.color }} />
                  </TableCell>
                  <TableCell className="font-semibold text-foreground">{p.label}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">{typeLabel(p.type)}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {p.type === 'nothing' ? '—' : p.type === 'bonus' ? `R$ ${Number(p.value).toLocaleString('pt-BR')}` : p.value}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{p.probability}</TableCell>
                  <TableCell>
                    <span className={`font-mono text-sm ${p.active ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {p.active ? `${calcPct(p.probability)}%` : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Switch checked={p.active} onCheckedChange={(v) => toggleMutation.mutate({ id: p.id, active: v })} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(p.id)}>
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

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Prêmio' : 'Novo Prêmio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rótulo (texto na roleta)</Label>
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex: R$ 10, 50 moedas, Tente novamente" className="bg-secondary border-border mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIZE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor</Label>
                <Input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} className="bg-secondary border-border font-mono mt-1" disabled={form.type === 'nothing'} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Peso (probabilidade)</Label>
                <Input type="number" value={form.probability} onChange={e => setForm(f => ({ ...f, probability: e.target.value }))} className="bg-secondary border-border font-mono mt-1" min="1" />
                <p className="text-[10px] text-muted-foreground mt-1">Quanto maior o peso, maior a chance de ser sorteado</p>
              </div>
              <div>
                <Label className="flex items-center gap-1"><Palette className="w-3 h-3" /> Cor</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-9 p-0.5 bg-secondary border-border cursor-pointer" />
                  <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="bg-secondary border-border font-mono flex-1" />
                </div>
              </div>
            </div>
            <div>
              <Label>URL do Ícone (opcional)</Label>
              <Input value={form.icon_url} onChange={e => setForm(f => ({ ...f, icon_url: e.target.value }))} placeholder="https://..." className="bg-secondary border-border mt-1" />
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
