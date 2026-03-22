/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Trophy, Edit2, Loader2, Star, Gem, Diamond, Coins, ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { logAudit } from '@/hooks/use-audit';

const TIER_ORDER = ['Iniciante', 'Bronze', 'Prata', 'Ouro', 'Titanio', 'Platina', 'Rubi', 'Diamante', 'Black', 'Elite', 'Lendario', 'Supremo'];

const WIDGET_BASE = 'https://backofficepixbingobr.vercel.app';

function resolveIcon(url: string) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${WIDGET_BASE}${url}`;
}

export default function Levels() {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editLevel, setEditLevel] = useState<any>(null);
  const [expandedTiers, setExpandedTiers] = useState<Set<string>>(new Set(TIER_ORDER));
  const [xpConfigOpen, setXpConfigOpen] = useState(false);

  const { data: levels = [], isLoading } = useQuery({
    queryKey: ['levels'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('levels').select('*').order('level', { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: xpConfig = [] } = useQuery({
    queryKey: ['xp_config'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('xp_config').select('*').order('action');
      if (error) throw error;
      return data as any[];
    },
  });

  const [form, setForm] = useState({ xp_required: '', reward_coins: '', reward_gems: '', reward_diamonds: '', color: '' });

  const openEdit = (lvl: any) => {
    setEditLevel(lvl);
    setForm({
      xp_required: String(lvl.xp_required),
      reward_coins: String(lvl.reward_coins || 0),
      reward_gems: String(lvl.reward_gems || 0),
      reward_diamonds: String(lvl.reward_diamonds || 0),
      color: lvl.color || '#8b5cf6',
    });
    setEditOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editLevel) return;
      const payload = {
        xp_required: parseInt(form.xp_required) || 0,
        reward_coins: parseInt(form.reward_coins) || 0,
        reward_gems: parseInt(form.reward_gems) || 0,
        reward_diamonds: parseInt(form.reward_diamonds) || 0,
        color: form.color,
      };
      const { error } = await (supabase as any).from('levels').update(payload).eq('id', editLevel.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['levels'] });
      toast.success(`${editLevel.name} atualizado`);
      logAudit({ action: 'EDITAR', resource_type: 'nivel', resource_name: editLevel.name });
      setEditOpen(false);
      setEditLevel(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [xpForm, setXpForm] = useState<Record<string, string>>({});
  const saveXpConfig = useMutation({
    mutationFn: async () => {
      for (const cfg of xpConfig) {
        const newVal = xpForm[cfg.action];
        if (newVal !== undefined && parseFloat(newVal) !== cfg.xp_per_real) {
          await (supabase as any).from('xp_config').update({ xp_per_real: parseFloat(newVal) }).eq('id', cfg.id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['xp_config'] });
      toast.success('Configuração de XP salva');
      setXpConfigOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleTier = (tier: string) => {
    setExpandedTiers(prev => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier); else next.add(tier);
      return next;
    });
  };

  // Group levels by tier
  const grouped = TIER_ORDER.map(tier => ({
    tier,
    levels: levels.filter((l: any) => l.tier === tier),
  })).filter(g => g.levels.length > 0);

  const totalLevels = levels.length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-6 h-6 text-purple-400" /> Sistema de Níveis
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{totalLevels} níveis configurados · 12 tiers</p>
        </div>
        <Button variant="outline" className="border-border" onClick={() => { setXpForm(Object.fromEntries(xpConfig.map((c: any) => [c.action, String(c.xp_per_real)]))); setXpConfigOpen(true); }}>
          <Settings2 className="w-4 h-4 mr-2" /> Config XP
        </Button>
      </div>

      {/* XP Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {xpConfig.map((cfg: any) => (
          <Card key={cfg.id} className="border-border">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{cfg.action === 'aposta' ? 'Apostas' : 'Depósitos'}</p>
              <p className="text-xl font-bold text-foreground">{cfg.xp_per_real} <span className="text-xs text-muted-foreground">XP/R$1</span></p>
              <p className="text-[10px] text-muted-foreground mt-1">{cfg.description}</p>
            </CardContent>
          </Card>
        ))}
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Níveis</p>
            <p className="text-xl font-bold text-foreground">{totalLevels}</p>
            <p className="text-[10px] text-muted-foreground mt-1">De Iniciante a Supremo</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">XP Máximo</p>
            <p className="text-xl font-bold text-foreground">{levels.length > 0 ? levels[levels.length - 1].xp_required?.toLocaleString('pt-BR') : 0}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Para Supremo MAX</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ tier, levels: tierLevels }) => {
            const isExpanded = expandedTiers.has(tier);
            const tierColor = tierLevels[0]?.color || '#8b5cf6';
            const minXp = tierLevels[0]?.xp_required || 0;
            const maxXp = tierLevels[tierLevels.length - 1]?.xp_required || 0;

            return (
              <Card key={tier} className="border-border overflow-hidden">
                {/* Tier Header */}
                <button
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-secondary/30 transition-colors"
                  onClick={() => toggleTier(tier)}
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tierColor }} />
                  <div className="flex-1">
                    <span className="font-semibold text-foreground">{tier}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {tierLevels.length} {tierLevels.length === 1 ? 'nível' : 'níveis'}
                      {' · '}
                      {minXp.toLocaleString('pt-BR')} - {maxXp.toLocaleString('pt-BR')} XP
                    </span>
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </button>

                {/* Tier Levels */}
                {isExpanded && (
                  <div className="border-t border-border">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-4">
                      {tierLevels.map((lvl: any) => (
                        <div
                          key={lvl.id}
                          className="group flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-secondary/30 cursor-pointer transition-all"
                          onClick={() => openEdit(lvl)}
                        >
                          <div className="w-14 h-14 flex-shrink-0">
                            <img
                              src={resolveIcon(lvl.icon_url)}
                              alt={lvl.name}
                              className="w-full h-full object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-semibold text-foreground leading-tight">{lvl.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{lvl.xp_required?.toLocaleString('pt-BR')} XP</p>
                          </div>
                          <div className="flex gap-1 flex-wrap justify-center">
                            {lvl.reward_coins > 0 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 flex items-center gap-0.5">
                                <Coins className="w-2.5 h-2.5" />{lvl.reward_coins}
                              </span>
                            )}
                            {lvl.reward_gems > 0 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 flex items-center gap-0.5">
                                <Gem className="w-2.5 h-2.5" />{lvl.reward_gems}
                              </span>
                            )}
                            {lvl.reward_diamonds > 0 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 flex items-center gap-0.5">
                                <Diamond className="w-2.5 h-2.5" />{lvl.reward_diamonds}
                              </span>
                            )}
                          </div>
                          <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Level Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { if (!v) { setEditOpen(false); setEditLevel(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {editLevel && (
                <>
                  <img src={resolveIcon(editLevel.icon_url)} className="w-10 h-10 object-contain" alt="" />
                  {editLevel.name}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nível</Label>
                <Input value={editLevel?.level ?? ''} disabled className="bg-secondary/50 border-border mt-1 font-mono" />
              </div>
              <div>
                <Label className="text-xs">Tier</Label>
                <Input value={editLevel?.tier ?? ''} disabled className="bg-secondary/50 border-border mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs flex items-center gap-1"><Star className="w-3 h-3 text-purple-400" /> XP Necessário</Label>
                <Input type="number" value={form.xp_required} onChange={e => setForm(f => ({ ...f, xp_required: e.target.value }))} className="bg-secondary border-border mt-1 font-mono" />
              </div>
              <div>
                <Label className="text-xs">Cor</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-9 p-0.5 bg-secondary border-border cursor-pointer" />
                  <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="bg-secondary border-border font-mono flex-1" />
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground mb-3">Recompensas ao Alcançar</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs flex items-center gap-1"><Coins className="w-3 h-3 text-amber-400" /> Moedas</Label>
                  <Input type="number" value={form.reward_coins} onChange={e => setForm(f => ({ ...f, reward_coins: e.target.value }))} className="bg-secondary border-border mt-1 font-mono" />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><Gem className="w-3 h-3 text-emerald-400" /> Gemas</Label>
                  <Input type="number" value={form.reward_gems} onChange={e => setForm(f => ({ ...f, reward_gems: e.target.value }))} className="bg-secondary border-border mt-1 font-mono" />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><Diamond className="w-3 h-3 text-cyan-400" /> Diamantes</Label>
                  <Input type="number" value={form.reward_diamonds} onChange={e => setForm(f => ({ ...f, reward_diamonds: e.target.value }))} className="bg-secondary border-border mt-1 font-mono" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gradient-primary border-0">
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* XP Config Dialog */}
      <Dialog open={xpConfigOpen} onOpenChange={setXpConfigOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Configuração de XP</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Defina quanto XP o jogador ganha por R$1 em cada ação.</p>
            {xpConfig.map((cfg: any) => (
              <div key={cfg.id}>
                <Label className="text-xs capitalize">{cfg.action === 'aposta' ? 'Apostas' : 'Depósitos'} (XP por R$1)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={xpForm[cfg.action] ?? String(cfg.xp_per_real)}
                  onChange={e => setXpForm(f => ({ ...f, [cfg.action]: e.target.value }))}
                  className="bg-secondary border-border mt-1 font-mono"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">{cfg.description}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={() => saveXpConfig.mutate()} disabled={saveXpConfig.isPending} className="gradient-primary border-0">
              {saveXpConfig.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
