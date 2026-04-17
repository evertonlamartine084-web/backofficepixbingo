import { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Trash2, Edit2, Loader2, Grid3X3, AlertTriangle,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { logAudit } from '@/hooks/use-audit';

interface MatchXItem {
  id: string;
  game_id: string;
  label: string;
  image_url: string | null;
  pair_group: number;
  sort_order: number;
  active: boolean;
  created_at: string;
}

interface MiniGame {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown> | null;
}

const PAIR_COLORS = [
  '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#06b6d4', '#e11d48', '#a855f7', '#22c55e', '#eab308',
];

const emptyForm = {
  label: '',
  image_url: '',
  pair_group: '0',
  sort_order: '0',
  active: true,
};

export default function MatchXManager() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const gameId = searchParams.get('gameId') || '';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Fetch game info
  const { data: game } = useQuery({
    queryKey: ['mini_game', gameId],
    enabled: !!gameId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mini_games' as 'segments')
        .select('id, name, type, config')
        .eq('id', gameId)
        .single();
      if (error) throw error;
      return data as unknown as MiniGame;
    },
  });

  const gridCols = (game?.config as Record<string, unknown>)?.grid_cols as number || 4;
  const gridRows = (game?.config as Record<string, unknown>)?.grid_rows as number || 4;

  // Fetch items
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['match_x_items', gameId],
    enabled: !!gameId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_x_items' as 'segments')
        .select('*')
        .eq('game_id', gameId)
        .order('sort_order');
      if (error) throw error;
      return data as unknown as MatchXItem[];
    },
  });

  // Group items by pair_group
  const grouped = useMemo(() => {
    const map = new Map<number, MatchXItem[]>();
    items.forEach(item => {
      const group = item.pair_group;
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(item);
    });
    return map;
  }, [items]);

  // Validation: find groups without exactly 2 items
  const invalidGroups = useMemo(() => {
    const invalid: number[] = [];
    grouped.forEach((groupItems, group) => {
      if (groupItems.length !== 2) invalid.push(group);
    });
    return invalid;
  }, [grouped]);

  const existingGroups = Array.from(grouped.keys()).sort((a, b) => a - b);
  const nextGroup = existingGroups.length > 0 ? Math.max(...existingGroups) + 1 : 0;

  // Grid config mutation
  const updateGridMutation = useMutation({
    mutationFn: async (config: { grid_cols: number; grid_rows: number }) => {
      const existingConfig = (game?.config || {}) as Record<string, unknown>;
      const { error } = await supabase
        .from('mini_games' as 'segments')
        .update({ config: { ...existingConfig, ...config } } as Record<string, unknown>)
        .eq('id', gameId);
      if (error) throw error;
      await logAudit({ action: 'EDITAR', resource_type: 'mini_game', resource_name: game?.name || '', details: config });
    },
    onSuccess: () => {
      toast.success('Grid atualizado!');
      qc.invalidateQueries({ queryKey: ['mini_game', gameId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  // Save item mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        game_id: gameId,
        label: form.label,
        image_url: form.image_url || null,
        pair_group: parseInt(form.pair_group) || 0,
        sort_order: parseInt(form.sort_order) || 0,
        active: form.active,
      };

      if (editId) {
        const { error } = await supabase
          .from('match_x_items' as 'segments')
          .update(payload as Record<string, unknown>)
          .eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('match_x_items' as 'segments')
          .insert(payload as Record<string, unknown>);
        if (error) throw error;
      }
      await logAudit({
        action: editId ? 'EDITAR' : 'CRIAR',
        resource_type: 'match_x_item',
        resource_name: form.label,
      });
    },
    onSuccess: () => {
      toast.success(editId ? 'Item atualizado!' : 'Item criado!');
      qc.invalidateQueries({ queryKey: ['match_x_items', gameId] });
      setDialogOpen(false);
      setEditId(null);
      setForm(emptyForm);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('match_x_items' as 'segments')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await logAudit({ action: 'EXCLUIR', resource_type: 'match_x_item', resource_id: id });
    },
    onSuccess: () => {
      toast.success('Item excluído!');
      qc.invalidateQueries({ queryKey: ['match_x_items', gameId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  const openEdit = (item: MatchXItem) => {
    setEditId(item.id);
    setForm({
      label: item.label,
      image_url: item.image_url || '',
      pair_group: String(item.pair_group),
      sort_order: String(item.sort_order),
      active: item.active,
    });
    setDialogOpen(true);
  };

  if (!gameId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <p>Nenhum gameId fornecido. Volte para Mini Games.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/gamification/mini-games')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Grid3X3 className="w-6 h-6 text-primary" /> Gerenciar Match X
            </h1>
            {game && <p className="text-sm text-muted-foreground mt-0.5">{game.name}</p>}
          </div>
        </div>
        <Button
          onClick={() => {
            setEditId(null);
            setForm({ ...emptyForm, pair_group: String(nextGroup) });
            setDialogOpen(true);
          }}
          className="gradient-primary border-0"
        >
          <Plus className="w-4 h-4 mr-2" /> Novo Item
        </Button>
      </div>

      {/* Validation Warning */}
      {invalidGroups.length > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-yellow-400">Pares incompletos</p>
              <p className="text-xs text-muted-foreground">
                Os seguintes grupos não possuem exatamente 2 itens: {invalidGroups.join(', ')}.
                Cada par deve ter exatamente 2 itens para o jogo funcionar.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grid Config */}
      <Card className="glass-card border-border">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Configuração do Grid
          </h3>
          <div className="grid grid-cols-2 gap-4 max-w-xs">
            <div>
              <Label className="text-xs">Colunas (2-6)</Label>
              <Input
                type="number" min="2" max="6"
                className="bg-secondary border-border"
                value={gridCols}
                onChange={e => {
                  const v = Math.min(6, Math.max(2, parseInt(e.target.value) || 2));
                  updateGridMutation.mutate({ grid_cols: v, grid_rows: gridRows });
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Linhas (2-6)</Label>
              <Input
                type="number" min="2" max="6"
                className="bg-secondary border-border"
                value={gridRows}
                onChange={e => {
                  const v = Math.min(6, Math.max(2, parseInt(e.target.value) || 2));
                  updateGridMutation.mutate({ grid_cols: gridCols, grid_rows: v });
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Grid {gridCols}x{gridRows} = {gridCols * gridRows} posições.
            Necessários {(gridCols * gridRows) / 2} pares ({gridCols * gridRows} itens no total).
          </p>
        </CardContent>
      </Card>

      {/* Visual Grid Preview */}
      <Card className="glass-card border-border">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Preview do Grid
          </h3>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum item criado. Adicione itens para visualizar o grid.
            </p>
          ) : (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
            >
              {items.map(item => {
                const color = PAIR_COLORS[item.pair_group % PAIR_COLORS.length];
                return (
                  <div
                    key={item.id}
                    className={`rounded-lg p-3 text-center text-xs font-semibold relative group ${!item.active ? 'opacity-40' : ''}`}
                    style={{ backgroundColor: `${color}25`, border: `2px solid ${color}`, color }}
                  >
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.label} className="w-8 h-8 mx-auto rounded mb-1 object-cover" />
                    ) : (
                      <div className="w-8 h-8 mx-auto rounded mb-1 flex items-center justify-center" style={{ backgroundColor: `${color}40` }}>
                        <ImageIcon className="w-4 h-4" />
                      </div>
                    )}
                    <span className="block truncate">{item.label}</span>
                    <Badge variant="outline" className="text-[8px] mt-1" style={{ borderColor: color, color }}>
                      Par {item.pair_group}
                    </Badge>
                    {/* Hover actions */}
                    <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openEdit(item)}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-5 w-5 text-destructive"
                        onClick={() => { if (confirm('Excluir este item?')) deleteMutation.mutate(item.id); }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items by Group */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Itens por Par ({items.length} total)
        </h3>
        {existingGroups.map(group => {
          const groupItems = grouped.get(group) || [];
          const color = PAIR_COLORS[group % PAIR_COLORS.length];
          const isValid = groupItems.length === 2;
          return (
            <Card key={group} className={`glass-card border-border ${!isValid ? 'border-yellow-500/50' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-sm font-semibold">Par {group}</span>
                  {!isValid && (
                    <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/50">
                      <AlertTriangle className="w-3 h-3 mr-1" /> {groupItems.length} itens
                    </Badge>
                  )}
                  {isValid && (
                    <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/50">
                      Válido
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {groupItems.map(item => (
                    <div key={item.id} className="flex items-center gap-2 bg-secondary/50 rounded-md px-3 py-2">
                      {item.image_url && (
                        <img src={item.image_url} alt="" className="w-6 h-6 rounded object-cover" />
                      )}
                      <span className="text-sm">{item.label}</span>
                      {!item.active && <Badge variant="outline" className="text-[8px]">Inativo</Badge>}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(item)}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                        onClick={() => { if (confirm('Excluir?')) deleteMutation.mutate(item.id); }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add/Edit Item Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-background border-border max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Item' : 'Novo Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                className="bg-secondary border-border"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Ex: Estrela"
              />
            </div>

            <div>
              <Label className="text-xs">URL da Imagem (opcional)</Label>
              <Input
                className="bg-secondary border-border"
                value={form.image_url}
                onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                placeholder="https://..."
              />
              {form.image_url && (
                <div className="mt-2">
                  <img
                    src={form.image_url}
                    alt="preview"
                    className="w-16 h-16 rounded object-cover border border-border"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Grupo do Par</Label>
              <Select
                value={form.pair_group}
                onValueChange={v => setForm(f => ({ ...f, pair_group: v }))}
              >
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {existingGroups.map(g => (
                    <SelectItem key={g} value={String(g)}>
                      Par {g} ({(grouped.get(g) || []).length} itens)
                    </SelectItem>
                  ))}
                  <SelectItem value={String(nextGroup)}>
                    Novo par ({nextGroup})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Ordem</Label>
              <Input
                type="number" min="0"
                className="bg-secondary border-border"
                value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.active}
                onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
              />
              <Label className="text-xs">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.label.trim() || saveMutation.isPending}
              className="gradient-primary border-0"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
