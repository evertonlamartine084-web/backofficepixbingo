import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trophy, Trash2, Edit2, Loader2, Award, Target } from 'lucide-react';
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

const CATEGORIES = [
  { value: 'deposito', label: 'Depósito' },
  { value: 'aposta', label: 'Aposta' },
  { value: 'login', label: 'Login' },
  { value: 'vitoria', label: 'Vitória' },
  { value: 'social', label: 'Social' },
  { value: 'geral', label: 'Geral' },
];

const CONDITION_TYPES = [
  { value: 'first_deposit', label: '1º Depósito' },
  { value: 'total_deposited', label: 'Total Depositado (R$)' },
  { value: 'total_bet', label: 'Total Apostado (R$)' },
  { value: 'consecutive_days', label: 'Dias Consecutivos' },
  { value: 'total_wins', label: 'Total de Vitórias' },
  { value: 'total_games', label: 'Total de Partidas' },
  { value: 'referrals', label: 'Indicações' },
];

const REWARD_TYPES = [
  { value: 'bonus', label: 'Bônus (R$)' },
  { value: 'coins', label: 'Moedas' },
  { value: 'xp', label: 'XP' },
];

const emptyForm = {
  name: '', description: '', icon_url: '', category: 'geral',
  condition_type: 'first_deposit', condition_value: '1',
  reward_type: 'bonus', reward_value: '0',
};

export default function Achievements() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: achievements = [], isLoading } = useQuery({
    queryKey: ['achievements'],
    queryFn: async () => {
      const { data, error } = await supabase.from('achievements').select('*').order('created_at', { ascending: false });
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
        category: form.category,
        condition_type: form.condition_type,
        condition_value: parseFloat(form.condition_value) || 1,
        reward_type: form.reward_type,
        reward_value: parseFloat(form.reward_value) || 0,
      };
      if (editId) {
        const { error } = await supabase.from('achievements').update(payload as any).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('achievements').insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['achievements'] });
      toast.success(editId ? 'Conquista atualizada' : 'Conquista criada');
      logAudit({ action: editId ? 'EDITAR' : 'CRIAR', resource_type: 'conquista', resource_name: form.name });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('achievements').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['achievements'] });
      const a = achievements.find(x => x.id === id);
      toast.success('Conquista excluída');
      logAudit({ action: 'EXCLUIR', resource_type: 'conquista', resource_id: id, resource_name: a?.name });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('achievements').update({ active } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['achievements'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const closeDialog = () => {
    setOpen(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const openEdit = (a: any) => {
    setEditId(a.id);
    setForm({
      name: a.name, description: a.description || '', icon_url: a.icon_url || '',
      category: a.category, condition_type: a.condition_type,
      condition_value: String(a.condition_value), reward_type: a.reward_type,
      reward_value: String(a.reward_value),
    });
    setOpen(true);
  };

  const condLabel = (type: string) => CONDITION_TYPES.find(c => c.value === type)?.label || type;
  const catLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;
  const rewLabel = (type: string) => REWARD_TYPES.find(r => r.value === type)?.label || type;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Award className="w-6 h-6 text-primary" /> Conquistas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure medalhas e recompensas por marcos dos jogadores</p>
        </div>
        <Button className="gradient-primary border-0" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Nova Conquista
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : achievements.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Nenhuma conquista criada</p>
          <p className="text-xs text-muted-foreground mt-1">Crie conquistas para engajar os jogadores</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Conquista</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Categoria</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Condição</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Recompensa</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Ativo</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {achievements.map((a: any) => (
                <TableRow key={a.id} className="hover:bg-secondary/30">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {a.icon_url ? (
                        <img src={a.icon_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Trophy className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-foreground text-sm">{a.name}</p>
                        {a.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{a.description}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">{catLabel(a.category)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <span className="text-muted-foreground">{condLabel(a.condition_type)}</span>
                      {a.condition_type !== 'first_deposit' && (
                        <span className="font-mono font-semibold text-foreground ml-1">
                          {a.condition_type.includes('deposited') || a.condition_type.includes('bet')
                            ? `R$ ${Number(a.condition_value).toLocaleString('pt-BR')}`
                            : a.condition_value}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm font-semibold text-emerald-400">
                      {a.reward_type === 'bonus' ? `R$ ${Number(a.reward_value).toLocaleString('pt-BR')}` : `${a.reward_value} ${rewLabel(a.reward_type)}`}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Switch checked={a.active} onCheckedChange={(v) => toggleMutation.mutate({ id: a.id, active: v })} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(a.id)}>
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Conquista' : 'Nova Conquista'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Primeiro Depósito" className="bg-secondary border-border mt-1" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Faça seu primeiro depósito e ganhe..." className="bg-secondary border-border mt-1" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>URL do Ícone</Label>
                <Input value={form.icon_url} onChange={e => setForm(f => ({ ...f, icon_url: e.target.value }))} placeholder="https://..." className="bg-secondary border-border mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Condição</Label>
                <Select value={form.condition_type} onValueChange={v => setForm(f => ({ ...f, condition_type: v }))}>
                  <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITION_TYPES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor da Condição</Label>
                <Input type="number" value={form.condition_value} onChange={e => setForm(f => ({ ...f, condition_value: e.target.value }))} className="bg-secondary border-border font-mono mt-1" disabled={form.condition_type === 'first_deposit'} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Recompensa</Label>
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
