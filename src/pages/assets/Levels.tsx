import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trophy, Trash2, Edit2, Star, Loader2, ArrowUp, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { logAudit } from '@/hooks/use-audit';

const REWARD_TYPES = [
  { value: 'bonus', label: 'Bônus (R$)' },
  { value: 'free_bet', label: 'Free Bet (R$)' },
  { value: 'coins', label: 'Moedas' },
  { value: 'spins', label: 'Giros na Roleta' },
  { value: 'none', label: 'Nenhuma' },
];

const PERK_OPTIONS = [
  { value: 'xp_boost', label: 'Boost de XP', icon: '⚡' },
  { value: 'exclusive_missions', label: 'Missões Exclusivas', icon: '🎯' },
  { value: 'exclusive_tournaments', label: 'Torneios Exclusivos', icon: '⚔️' },
  { value: 'store_discount', label: 'Desconto na Loja', icon: '🏷️' },
  { value: 'extra_spins', label: 'Giros Extras', icon: '🎡' },
  { value: 'vip_support', label: 'Suporte VIP', icon: '👑' },
];

const emptyForm = {
  level_number: '', name: '', min_xp: '', icon_url: '', color: '#6366f1',
  rewards_description: '', reward_type: 'none', reward_value: '',
  xp_multiplier: '1', perks: [] as string[],
};

export default function Levels() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: levels = [], isLoading } = useQuery({
    queryKey: ['player_levels'],
    queryFn: async () => {
      const { data, error } = await supabase.from('player_levels').select('*').order('level_number', { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const closeDialog = () => { setOpen(false); setEditId(null); setForm(emptyForm); };

  const openEdit = (lvl: any) => {
    setEditId(lvl.id);
    setForm({
      level_number: String(lvl.level_number),
      name: lvl.name,
      min_xp: String(lvl.min_xp),
      icon_url: lvl.icon_url || '',
      color: lvl.color || '#6366f1',
      rewards_description: lvl.rewards_description || '',
      reward_type: lvl.reward_type || 'none',
      reward_value: lvl.reward_value ? String(lvl.reward_value) : '',
      xp_multiplier: lvl.xp_multiplier ? String(lvl.xp_multiplier) : '1',
      perks: Array.isArray(lvl.perks) ? lvl.perks : [],
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.level_number) throw new Error('Preencha nome e número do nível');
      const payload = {
        level_number: parseInt(form.level_number),
        name: form.name,
        min_xp: parseInt(form.min_xp) || 0,
        icon_url: form.icon_url || null,
        color: form.color,
        rewards_description: form.rewards_description || null,
        reward_type: form.reward_type === 'none' ? null : form.reward_type,
        reward_value: form.reward_value ? parseFloat(form.reward_value) : null,
        xp_multiplier: parseFloat(form.xp_multiplier) || 1,
        perks: form.perks,
      };
      if (editId) {
        const { error } = await supabase.from('player_levels').update(payload as any).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('player_levels').insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['player_levels'] });
      toast.success(editId ? 'Nível atualizado' : 'Nível criado');
      logAudit({ action: editId ? 'EDITAR' : 'CRIAR', resource_type: 'nivel', resource_name: form.name });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('player_levels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['player_levels'] });
      toast.success('Nível excluído');
    },
  });

  const togglePerk = (perk: string) => {
    setForm(f => ({
      ...f,
      perks: f.perks.includes(perk) ? f.perks.filter(p => p !== perk) : [...f.perks, perk],
    }));
  };

  // Visual: level map progression
  const maxXp = levels.length > 0 ? Math.max(...levels.map((l: any) => l.min_xp)) : 100;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-6 h-6 text-purple-400" /> Sistema de Níveis
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure a progressão, recompensas e vantagens de cada nível</p>
        </div>
        <Button className="gradient-primary border-0" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Novo Nível
        </Button>
      </div>

      {/* Level Map Visual */}
      {levels.length > 0 && (
        <div className="glass-card p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Mapa de Progressão</p>
          <div className="flex items-end gap-1 overflow-x-auto pb-2" style={{ minHeight: 120 }}>
            {levels.map((lvl: any, i: number) => {
              const height = maxXp > 0 ? Math.max(30, (lvl.min_xp / maxXp) * 100) : 30;
              return (
                <div key={lvl.id} className="flex flex-col items-center gap-1 min-w-[60px]">
                  <span className="text-[10px] text-muted-foreground font-mono">{lvl.min_xp.toLocaleString()} XP</span>
                  <div
                    className="rounded-t-md w-10 transition-all hover:opacity-80 cursor-pointer relative group"
                    style={{ height: `${height}px`, backgroundColor: lvl.color }}
                    onClick={() => openEdit(lvl)}
                  >
                    {lvl.xp_multiplier > 1 && (
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-amber-400 whitespace-nowrap">
                        {lvl.xp_multiplier}x XP
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-foreground whitespace-nowrap">{lvl.name}</span>
                  <span className="text-[9px] text-muted-foreground">Nv {lvl.level_number}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : levels.length === 0 ? (
        <Card className="border-dashed border-2 border-border">
          <CardContent className="py-12 text-center">
            <Trophy className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhum nível configurado</p>
            <p className="text-xs text-muted-foreground mt-1">Crie pelo menos 3 níveis para o sistema funcionar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {levels.map((lvl: any) => (
            <Card key={lvl.id} className="border-border hover:border-primary/30 transition-colors overflow-hidden group cursor-pointer" onClick={() => openEdit(lvl)}>
              <div className="h-1.5" style={{ backgroundColor: lvl.color }} />
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold shrink-0" style={{ backgroundColor: lvl.color + '20', color: lvl.color }}>
                      {lvl.icon_url ? <img src={lvl.icon_url} className="w-7 h-7" alt="" /> : lvl.level_number}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{lvl.name}</h3>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Star className="w-3 h-3" /> {lvl.min_xp.toLocaleString()} XP
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); if (confirm('Excluir nível?')) deleteMutation.mutate(lvl.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {lvl.xp_multiplier > 1 && (
                    <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400">
                      <Zap className="w-2.5 h-2.5 mr-0.5" />{lvl.xp_multiplier}x XP
                    </Badge>
                  )}
                  {lvl.reward_type && lvl.reward_type !== 'none' && (
                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-400">
                      <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                      {REWARD_TYPES.find(r => r.value === lvl.reward_type)?.label}: {lvl.reward_value}
                    </Badge>
                  )}
                  {Array.isArray(lvl.perks) && lvl.perks.map((p: string) => {
                    const perk = PERK_OPTIONS.find(x => x.value === p);
                    return perk ? (
                      <Badge key={p} variant="secondary" className="text-[10px]">
                        {perk.icon} {perk.label}
                      </Badge>
                    ) : null;
                  })}
                </div>

                {lvl.rewards_description && (
                  <p className="text-xs text-muted-foreground mt-2 bg-secondary/50 rounded-md p-2">{lvl.rewards_description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Nível' : 'Novo Nível'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nº do Nível</Label>
                <Input type="number" value={form.level_number} onChange={e => setForm(f => ({ ...f, level_number: e.target.value }))} placeholder="1" className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-xs">Nome</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Bronze" className="bg-secondary border-border mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">XP Mínimo para Alcançar</Label>
                <Input type="number" value={form.min_xp} onChange={e => setForm(f => ({ ...f, min_xp: e.target.value }))} placeholder="0" className="bg-secondary border-border font-mono mt-1" />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" /> Multiplicador de XP</Label>
                <Input type="number" step="0.1" value={form.xp_multiplier} onChange={e => setForm(f => ({ ...f, xp_multiplier: e.target.value }))} placeholder="1" className="bg-secondary border-border font-mono mt-1" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Ex: 1.5 = ganha 50% mais XP neste nível</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Cor</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-9 p-0.5 bg-secondary border-border cursor-pointer" />
                  <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="bg-secondary border-border font-mono flex-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">URL do Ícone (opcional)</Label>
                <Input value={form.icon_url} onChange={e => setForm(f => ({ ...f, icon_url: e.target.value }))} placeholder="https://..." className="bg-secondary border-border mt-1" />
              </div>
            </div>

            {/* Reward on level up */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <ArrowUp className="w-4 h-4 text-emerald-400" /> Recompensa ao Subir de Nível
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={form.reward_type} onValueChange={v => setForm(f => ({ ...f, reward_type: v }))}>
                    <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REWARD_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Valor</Label>
                  <Input type="number" value={form.reward_value} onChange={e => setForm(f => ({ ...f, reward_value: e.target.value }))} placeholder="0" className="bg-secondary border-border font-mono mt-1" disabled={form.reward_type === 'none'} />
                </div>
              </div>
            </div>

            {/* Perks */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" /> Vantagens do Nível
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PERK_OPTIONS.map(perk => (
                  <button
                    key={perk.value}
                    type="button"
                    onClick={() => togglePerk(perk.value)}
                    className={`p-2 rounded-lg border text-left text-xs transition-colors ${
                      form.perks.includes(perk.value)
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    <span className="mr-1">{perk.icon}</span> {perk.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Descrição (exibida no widget)</Label>
              <Textarea value={form.rewards_description} onChange={e => setForm(f => ({ ...f, rewards_description: e.target.value }))} placeholder="Ex: Bônus de 10% em depósitos, acesso a torneios exclusivos..." rows={2} className="bg-secondary border-border mt-1" />
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
