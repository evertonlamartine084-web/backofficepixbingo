/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Loader2, Gamepad2, Settings2, Gift, Ticket, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { logAudit } from '@/hooks/use-audit';

const GAME_TYPES = [
  { value: 'scratch_card', label: 'Raspadinha', icon: '🎴' },
  { value: 'gift_box', label: 'Caixa Surpresa', icon: '🎁' },
  { value: 'prize_drop', label: 'Prize Drop', icon: '🎯' },
];

const PRIZE_TYPES = [
  { value: 'coins', label: 'Moedas' },
  { value: 'xp', label: 'XP' },
  { value: 'bonus', label: 'Bônus (R$)' },
  { value: 'free_bet', label: 'Aposta Grátis' },
  { value: 'spins', label: 'Giros da Roleta' },
  { value: 'nothing', label: 'Nada (Tente novamente)' },
];

const emptyGameForm = {
  type: 'scratch_card', name: '', description: '', active: true,
  max_attempts_per_day: '3', free_attempts_per_day: '1', attempt_cost_coins: '0',
  theme: 'default', segment_id: '',
};

const emptyPrizeForm = {
  label: '', type: 'coins', value: '0', probability: '1',
  icon: '', color: '#8b5cf6', sort_order: '0',
};

export default function MiniGames() {
  const qc = useQueryClient();
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [gameDialogOpen, setGameDialogOpen] = useState(false);
  const [editGameId, setEditGameId] = useState<string | null>(null);
  const [gameForm, setGameForm] = useState(emptyGameForm);
  const [prizeDialogOpen, setPrizeDialogOpen] = useState(false);
  const [editPrizeId, setEditPrizeId] = useState<string | null>(null);
  const [prizeForm, setPrizeForm] = useState(emptyPrizeForm);

  const { data: segments = [] } = useQuery({
    queryKey: ['segments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('segments').select('id, name').order('name');
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: games = [], isLoading: gamesLoading } = useQuery({
    queryKey: ['mini_games'],
    queryFn: async () => {
      const { data, error } = await supabase.from('mini_games').select('*, segments(name)').order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: allPrizes = [] } = useQuery({
    queryKey: ['mini_game_prizes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('mini_game_prizes').select('*').order('sort_order');
      if (error) throw error;
      return data as any[];
    },
  });

  const selectedGame = games.find(g => g.id === selectedGameId);
  const gamePrizes = allPrizes.filter(p => p.game_id === selectedGameId);
  const totalWeight = gamePrizes.reduce((s, p) => s + (p.probability || 0), 0);

  // Game mutations
  const saveGameMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        type: gameForm.type,
        name: gameForm.name,
        description: gameForm.description || null,
        active: gameForm.active,
        max_attempts_per_day: parseInt(gameForm.max_attempts_per_day) || 3,
        free_attempts_per_day: parseInt(gameForm.free_attempts_per_day) || 1,
        attempt_cost_coins: parseInt(gameForm.attempt_cost_coins) || 0,
        theme: gameForm.theme || 'default',
        segment_id: gameForm.segment_id || null,
      };
      if (editGameId) {
        const { error } = await supabase.from('mini_games').update(payload as any).eq('id', editGameId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('mini_games').insert(payload as any);
        if (error) throw error;
      }
      await logAudit({ action: editGameId ? 'EDITAR' : 'CRIAR', resource_type: 'mini_game', resource_name: payload.name });
    },
    onSuccess: () => {
      toast.success(editGameId ? 'Jogo atualizado!' : 'Jogo criado!');
      qc.invalidateQueries({ queryKey: ['mini_games'] });
      setGameDialogOpen(false);
      setEditGameId(null);
      setGameForm(emptyGameForm);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteGameMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mini_games').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ action: 'EXCLUIR', resource_type: 'mini_game', resource_id: id });
    },
    onSuccess: () => {
      toast.success('Jogo excluído!');
      qc.invalidateQueries({ queryKey: ['mini_games'] });
      qc.invalidateQueries({ queryKey: ['mini_game_prizes'] });
      if (selectedGameId) setSelectedGameId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Prize mutations
  const savePrizeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGameId) throw new Error('Selecione um jogo');
      const payload = {
        game_id: selectedGameId,
        label: prizeForm.label,
        type: prizeForm.type,
        value: parseFloat(prizeForm.value) || 0,
        probability: isNaN(parseInt(prizeForm.probability)) ? 0 : parseInt(prizeForm.probability),
        icon: prizeForm.icon || null,
        color: prizeForm.color || '#8b5cf6',
        sort_order: parseInt(prizeForm.sort_order) || 0,
      };
      if (editPrizeId) {
        const { error } = await supabase.from('mini_game_prizes').update(payload as any).eq('id', editPrizeId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('mini_game_prizes').insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editPrizeId ? 'Prêmio atualizado!' : 'Prêmio adicionado!');
      qc.invalidateQueries({ queryKey: ['mini_game_prizes'] });
      setPrizeDialogOpen(false);
      setEditPrizeId(null);
      setPrizeForm(emptyPrizeForm);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deletePrizeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mini_game_prizes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Prêmio excluído!');
      qc.invalidateQueries({ queryKey: ['mini_game_prizes'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const togglePrizeMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('mini_game_prizes').update({ active } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mini_game_prizes'] }),
  });

  const openEditGame = (game: any) => {
    setEditGameId(game.id);
    setGameForm({
      type: game.type, name: game.name, description: game.description || '',
      active: game.active, max_attempts_per_day: String(game.max_attempts_per_day || 3),
      free_attempts_per_day: String(game.free_attempts_per_day || 1),
      attempt_cost_coins: String(game.attempt_cost_coins || 0),
      theme: game.theme || 'default', segment_id: game.segment_id || '',
    });
    setGameDialogOpen(true);
  };

  const openEditPrize = (prize: any) => {
    setEditPrizeId(prize.id);
    setPrizeForm({
      label: prize.label, type: prize.type, value: String(prize.value),
      probability: String(prize.probability), icon: prize.icon || '',
      color: prize.color || '#8b5cf6', sort_order: String(prize.sort_order || 0),
    });
    setPrizeDialogOpen(true);
  };

  const typeIcon = (type: string) => GAME_TYPES.find(t => t.value === type)?.icon || '🎮';
  const typeLabel = (type: string) => GAME_TYPES.find(t => t.value === type)?.label || type;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-primary" /> Mini Games
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Raspadinha, Caixa Surpresa e Prize Drop</p>
        </div>
        <Button onClick={() => { setEditGameId(null); setGameForm(emptyGameForm); setGameDialogOpen(true); }} className="gradient-primary border-0">
          <Plus className="w-4 h-4 mr-2" /> Novo Jogo
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Games list */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Jogos</h3>
          {gamesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : games.length === 0 ? (
            <Card className="glass-card border-border"><CardContent className="p-8 text-center text-muted-foreground text-sm">Nenhum jogo criado</CardContent></Card>
          ) : (
            games.map(game => {
              const prizesCount = allPrizes.filter(p => p.game_id === game.id).length;
              return (
                <Card
                  key={game.id}
                  className={`glass-card border-border cursor-pointer transition-all ${selectedGameId === game.id ? 'ring-2 ring-primary' : 'hover:border-primary/30'}`}
                  onClick={() => setSelectedGameId(game.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{typeIcon(game.type)}</span>
                        <div>
                          <div className="font-semibold text-foreground flex items-center gap-2">
                            {game.name}
                            {!game.active && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{typeLabel(game.type)} · {prizesCount} prêmios</div>
                          {game.segments?.name && (
                            <Badge variant="secondary" className="text-[10px] mt-1">{game.segments.name}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditGame(game); }}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); if (confirm('Excluir este jogo e todos seus prêmios?')) deleteGameMutation.mutate(game.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-3 text-[10px] text-muted-foreground">
                      <span>🎫 {game.free_attempts_per_day || 1} grátis/dia</span>
                      <span>🎲 máx {game.max_attempts_per_day || 1}/dia</span>
                      {game.attempt_cost_coins > 0 && <span>🪙 {game.attempt_cost_coins} moedas</span>}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Prizes for selected game */}
        <div className="lg:col-span-2 space-y-3">
          {selectedGame ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Prêmios — {selectedGame.name}
                </h3>
                <Button size="sm" onClick={() => { setEditPrizeId(null); setPrizeForm(emptyPrizeForm); setPrizeDialogOpen(true); }}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Prêmio
                </Button>
              </div>

              {gamePrizes.length === 0 ? (
                <Card className="glass-card border-border"><CardContent className="p-8 text-center text-muted-foreground text-sm">Adicione prêmios para este jogo</CardContent></Card>
              ) : (
                <Card className="glass-card border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-xs">Ativo</TableHead>
                        <TableHead className="text-xs">Prêmio</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs text-right">Valor</TableHead>
                        <TableHead className="text-xs text-right">Peso</TableHead>
                        <TableHead className="text-xs text-right">Prob %</TableHead>
                        <TableHead className="text-xs text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gamePrizes.map(prize => (
                        <TableRow key={prize.id} className="border-border">
                          <TableCell>
                            <Switch checked={prize.active} onCheckedChange={(v) => togglePrizeMutation.mutate({ id: prize.id, active: v })} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: prize.color }} />
                              <span className="text-sm font-medium">{prize.icon} {prize.label}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {PRIZE_TYPES.find(t => t.value === prize.type)?.label || prize.type}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono">{prize.value}</TableCell>
                          <TableCell className="text-right text-sm font-mono">{prize.probability}</TableCell>
                          <TableCell className="text-right text-sm font-mono">
                            {totalWeight > 0 ? ((prize.probability / totalWeight) * 100).toFixed(1) + '%' : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPrize(prize)}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm('Excluir este prêmio?')) deletePrizeMutation.mutate(prize.id); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </>
          ) : (
            <Card className="glass-card border-border">
              <CardContent className="p-12 text-center text-muted-foreground">
                <Gamepad2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Selecione um jogo à esquerda para gerenciar seus prêmios</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Game Dialog */}
      <Dialog open={gameDialogOpen} onOpenChange={setGameDialogOpen}>
        <DialogContent className="bg-background border-border max-w-lg">
          <DialogHeader>
            <DialogTitle>{editGameId ? 'Editar Jogo' : 'Novo Mini Game'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={gameForm.type} onValueChange={v => setGameForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GAME_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Nome</Label>
              <Input className="bg-secondary border-border" value={gameForm.name} onChange={e => setGameForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Raspadinha da Sorte" />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input className="bg-secondary border-border" value={gameForm.description} onChange={e => setGameForm(f => ({ ...f, description: e.target.value }))} placeholder="Opcional" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Tentativas grátis/dia</Label>
                <Input type="number" min="0" className="bg-secondary border-border" value={gameForm.free_attempts_per_day} onChange={e => setGameForm(f => ({ ...f, free_attempts_per_day: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Máx tentativas/dia</Label>
                <Input type="number" min="0" className="bg-secondary border-border" value={gameForm.max_attempts_per_day} onChange={e => setGameForm(f => ({ ...f, max_attempts_per_day: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Custo (moedas)</Label>
                <Input type="number" min="0" className="bg-secondary border-border" value={gameForm.attempt_cost_coins} onChange={e => setGameForm(f => ({ ...f, attempt_cost_coins: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Segmento (opcional)</Label>
              <Select value={gameForm.segment_id || '_none'} onValueChange={v => setGameForm(f => ({ ...f, segment_id: v === '_none' ? '' : v }))}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Todos os jogadores</SelectItem>
                  {segments.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={gameForm.active} onCheckedChange={v => setGameForm(f => ({ ...f, active: v }))} />
              <Label className="text-xs">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={() => saveGameMutation.mutate()} disabled={!gameForm.name || saveGameMutation.isPending} className="gradient-primary border-0">
              {saveGameMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editGameId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prize Dialog */}
      <Dialog open={prizeDialogOpen} onOpenChange={setPrizeDialogOpen}>
        <DialogContent className="bg-background border-border max-w-md">
          <DialogHeader>
            <DialogTitle>{editPrizeId ? 'Editar Prêmio' : 'Novo Prêmio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Nome do prêmio</Label>
              <Input className="bg-secondary border-border" value={prizeForm.label} onChange={e => setPrizeForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex: 50 Moedas" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={prizeForm.type} onValueChange={v => setPrizeForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIZE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Valor</Label>
                <Input type="number" min="0" step="any" className="bg-secondary border-border" value={prizeForm.value} onChange={e => setPrizeForm(f => ({ ...f, value: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Peso (probabilidade)</Label>
                <Input type="number" min="0" className="bg-secondary border-border" value={prizeForm.probability} onChange={e => setPrizeForm(f => ({ ...f, probability: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Ícone (emoji)</Label>
                <Input className="bg-secondary border-border" value={prizeForm.icon} onChange={e => setPrizeForm(f => ({ ...f, icon: e.target.value }))} placeholder="🪙" />
              </div>
              <div>
                <Label className="text-xs">Cor</Label>
                <Input type="color" className="bg-secondary border-border h-9" value={prizeForm.color} onChange={e => setPrizeForm(f => ({ ...f, color: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Ordem</Label>
              <Input type="number" min="0" className="bg-secondary border-border" value={prizeForm.sort_order} onChange={e => setPrizeForm(f => ({ ...f, sort_order: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={() => savePrizeMutation.mutate()} disabled={!prizeForm.label || savePrizeMutation.isPending} className="gradient-primary border-0">
              {savePrizeMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editPrizeId ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
