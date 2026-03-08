import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trophy, Trash2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function Levels() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    level_number: '', name: '', min_xp: '', icon_url: '', color: '#6366f1', rewards_description: '',
  });

  const { data: levels = [], isLoading } = useQuery({
    queryKey: ['player_levels'],
    queryFn: async () => {
      const { data, error } = await supabase.from('player_levels').select('*').order('level_number', { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.level_number) throw new Error('Preencha nome e número do nível');
      const { error } = await supabase.from('player_levels').insert({
        level_number: parseInt(form.level_number),
        name: form.name,
        min_xp: parseInt(form.min_xp) || 0,
        icon_url: form.icon_url || null,
        color: form.color,
        rewards_description: form.rewards_description || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player_levels'] });
      toast.success('Nível criado');
      setOpen(false);
      setForm({ level_number: '', name: '', min_xp: '', icon_url: '', color: '#6366f1', rewards_description: '' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('player_levels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['player_levels'] }); toast.success('Nível excluído'); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Trophy className="w-7 h-7 text-primary" /> Sistema de Níveis
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure os níveis de progressão dos jogadores</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2 gradient-primary border-0">
          <Plus className="w-4 h-4" /> Novo Nível
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : levels.length === 0 ? (
        <Card className="border-dashed border-2 border-border">
          <CardContent className="py-12 text-center">
            <Trophy className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhum nível configurado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {levels.map((lvl: any) => (
            <Card key={lvl.id} className="border-border hover:border-primary/30 transition-colors overflow-hidden">
              <div className="h-1.5" style={{ backgroundColor: lvl.color }} />
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold" style={{ backgroundColor: lvl.color + '20', color: lvl.color }}>
                      {lvl.icon_url ? <img src={lvl.icon_url} className="w-6 h-6" alt="" /> : lvl.level_number}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{lvl.name}</h3>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Star className="w-3 h-3" /> {lvl.min_xp.toLocaleString()} XP mínimo
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { if (confirm('Excluir nível?')) deleteMutation.mutate(lvl.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {lvl.rewards_description && (
                  <p className="text-xs text-muted-foreground mt-3 bg-secondary/50 rounded-md p-2">{lvl.rewards_description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo Nível</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nº do nível</Label>
                <Input type="number" value={form.level_number} onChange={e => setForm(f => ({ ...f, level_number: e.target.value }))} placeholder="1" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Nome</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Bronze" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">XP mínimo</Label>
                <Input type="number" value={form.min_xp} onChange={e => setForm(f => ({ ...f, min_xp: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Cor</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-12 h-9 p-1 cursor-pointer" />
                  <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="flex-1" />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">URL do ícone (opcional)</Label>
              <Input value={form.icon_url} onChange={e => setForm(f => ({ ...f, icon_url: e.target.value }))} placeholder="https://..." className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Recompensas / descrição</Label>
              <Textarea value={form.rewards_description} onChange={e => setForm(f => ({ ...f, rewards_description: e.target.value }))} placeholder="Ex: Bônus de 10% em depósitos, acesso a torneios exclusivos..." rows={3} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="gradient-primary border-0">Criar Nível</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
