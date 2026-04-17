import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Palette, Plus, Trash2, Edit2, Copy, Loader2, Save, Image, Type, Sliders, Code2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { logAudit } from '@/hooks/use-audit';
import { SkinPreview, DEFAULT_SKIN_DATA } from '@/components/mini-games/SkinPreview';
import { SkinColorField } from '@/components/mini-games/SkinColorField';
import type { SkinData } from '@/components/mini-games/SkinPreview';

interface MiniGameSkin {
  id: string;
  name: string;
  description: string | null;
  game_type: string;
  is_template: boolean;
  skin_data: SkinData;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const GAME_TYPES = [
  { value: 'scratch_card', label: 'Raspadinha' },
  { value: 'gift_box', label: 'Caixa Surpresa' },
  { value: 'prize_drop', label: 'Prize Drop' },
  { value: 'prize_drop_live', label: 'Prize Drop Live' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'match_x', label: 'Match X' },
];

const FONT_OPTIONS = [
  'Space Grotesk',
  'JetBrains Mono',
  'Inter',
  'Poppins',
  'Roboto',
  'Montserrat',
  'Open Sans',
];

const ANIMATION_SPEEDS = [
  { value: 'slow', label: 'Lento' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Rápido' },
];

const COLOR_LABELS: Record<string, string> = {
  primary: 'Primária',
  secondary: 'Secundária',
  background: 'Fundo',
  accent: 'Destaque',
  text: 'Texto',
  text_secondary: 'Texto Sec.',
  success: 'Sucesso',
  card_bg: 'Fundo Card',
};

const IMAGE_LABELS: Record<string, string> = {
  background_url: 'Fundo (URL)',
  logo_url: 'Logo (URL)',
  prize_icon_url: 'Ícone Prêmio (URL)',
  scratch_overlay_url: 'Overlay Raspadinha (URL)',
};

const emptyForm = {
  name: '',
  description: '',
  game_type: 'scratch_card',
  is_template: false,
};

export default function SkinEditor() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [skinData, setSkinData] = useState<SkinData>({ ...DEFAULT_SKIN_DATA });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ── Queries ──────────────────────────────────────────────────────
  const { data: skins = [], isLoading } = useQuery({
    queryKey: ['mini_game_skins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mini_game_skins' as 'segments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as MiniGameSkin[];
    },
  });

  const templates = skins.filter((s) => s.is_template);

  // ── Mutations ────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Nome é obrigatório');
      const payload = {
        name: form.name,
        description: form.description || null,
        game_type: form.game_type,
        is_template: form.is_template,
        skin_data: skinData as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      };
      if (editId) {
        const { error } = await supabase
          .from('mini_game_skins' as 'segments')
          .update(payload as Record<string, unknown>)
          .eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('mini_game_skins' as 'segments')
          .insert(payload as Record<string, unknown>);
        if (error) throw error;
      }
      await logAudit({
        action: editId ? 'EDITAR' : 'CRIAR',
        resource_type: 'mini_game_skin',
        resource_name: form.name,
      });
    },
    onSuccess: () => {
      toast.success(editId ? 'Skin atualizada!' : 'Skin criada!');
      qc.invalidateQueries({ queryKey: ['mini_game_skins'] });
      resetForm();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('mini_game_skins' as 'segments')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await logAudit({ action: 'EXCLUIR', resource_type: 'mini_game_skin', resource_id: id });
    },
    onSuccess: () => {
      toast.success('Skin excluída!');
      qc.invalidateQueries({ queryKey: ['mini_game_skins'] });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro ao excluir'),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (skin: MiniGameSkin) => {
      const payload = {
        name: `${skin.name} (Cópia)`,
        description: skin.description,
        game_type: skin.game_type,
        is_template: false,
        skin_data: skin.skin_data as unknown as Record<string, unknown>,
      };
      const { error } = await supabase
        .from('mini_game_skins' as 'segments')
        .insert(payload as Record<string, unknown>);
      if (error) throw error;
      await logAudit({ action: 'DUPLICAR', resource_type: 'mini_game_skin', resource_name: payload.name });
    },
    onSuccess: () => {
      toast.success('Skin duplicada!');
      qc.invalidateQueries({ queryKey: ['mini_game_skins'] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro ao duplicar'),
  });

  // ── Helpers ──────────────────────────────────────────────────────
  function resetForm() {
    setEditId(null);
    setForm(emptyForm);
    setSkinData({ ...DEFAULT_SKIN_DATA });
  }

  function loadSkinForEdit(skin: MiniGameSkin) {
    setEditId(skin.id);
    setForm({
      name: skin.name,
      description: skin.description || '',
      game_type: skin.game_type,
      is_template: skin.is_template,
    });
    setSkinData({ ...DEFAULT_SKIN_DATA, ...skin.skin_data });
  }

  function loadTemplate(templateId: string) {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setSkinData({ ...DEFAULT_SKIN_DATA, ...tpl.skin_data });
    toast.info(`Template "${tpl.name}" carregado!`);
  }

  function updateColor(key: string, value: string) {
    setSkinData((prev) => ({
      ...prev,
      colors: { ...prev.colors, [key]: value },
    }));
  }

  function updateImage(key: string, value: string) {
    setSkinData((prev) => ({
      ...prev,
      images: { ...prev.images, [key]: value },
    }));
  }

  function updateFont(key: 'primary' | 'secondary', value: string) {
    setSkinData((prev) => ({
      ...prev,
      fonts: { ...prev.fonts, [key]: value },
    }));
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Palette className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Editor de Skins</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {templates.length > 0 && (
            <Select onValueChange={loadTemplate}>
              <SelectTrigger className="w-52 bg-secondary border-border h-9">
                <SelectValue placeholder="Carregar Template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setForm((f) => ({ ...f, is_template: true }));
              saveMutation.mutate();
            }}
            disabled={!form.name.trim() || saveMutation.isPending}
          >
            <Save className="w-4 h-4 mr-1" />
            Salvar como Template
          </Button>
          <Button
            className="gradient-primary border-0"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!form.name.trim() || saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            {editId ? 'Atualizar' : 'Salvar'}
          </Button>
          {editId && (
            <Button variant="ghost" size="sm" onClick={resetForm}>
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Editor: Left Form + Right Preview */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT PANEL — Form */}
        <div className="w-full lg:w-[40%] space-y-5 overflow-y-auto max-h-[80vh] pr-1">
          {/* Info Section */}
          <div className="glass-card border-border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Sliders className="w-4 h-4" /> Info
            </h3>
            <div className="space-y-2">
              <Label className="text-xs">Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Tema Neon"
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Breve descrição da skin"
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Tipo de Jogo</Label>
              <Select
                value={form.game_type}
                onValueChange={(v) => setForm((f) => ({ ...f, game_type: v }))}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GAME_TYPES.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_template}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_template: v }))}
              />
              <Label className="text-xs">É Template</Label>
            </div>
          </div>

          {/* Colors Section */}
          <div className="glass-card border-border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Palette className="w-4 h-4" /> Cores
            </h3>
            {Object.entries(COLOR_LABELS).map(([key, label]) => (
              <SkinColorField
                key={key}
                label={label}
                value={skinData.colors[key as keyof typeof skinData.colors]}
                onChange={(v) => updateColor(key, v)}
              />
            ))}
          </div>

          {/* Images Section */}
          <div className="glass-card border-border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Image className="w-4 h-4" /> Imagens
            </h3>
            {Object.entries(IMAGE_LABELS).map(([key, label]) => {
              const val = skinData.images[key as keyof typeof skinData.images];
              return (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={val}
                      onChange={(e) => updateImage(key, e.target.value)}
                      placeholder="https://..."
                      className="bg-secondary border-border text-xs"
                    />
                    {val && (
                      <img
                        src={val}
                        alt=""
                        className="w-8 h-8 rounded border border-border object-cover flex-shrink-0"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Typography Section */}
          <div className="glass-card border-border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Type className="w-4 h-4" /> Tipografia
            </h3>
            <div className="space-y-2">
              <Label className="text-xs">Fonte Primária</Label>
              <Select value={skinData.fonts.primary} onValueChange={(v) => updateFont('primary', v)}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Fonte Secundária</Label>
              <Select value={skinData.fonts.secondary} onValueChange={(v) => updateFont('secondary', v)}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Style Section */}
          <div className="glass-card border-border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Sliders className="w-4 h-4" /> Estilo
            </h3>
            <div className="space-y-2">
              <Label className="text-xs">
                Border Radius: {skinData.border_radius}px
              </Label>
              <Slider
                min={0}
                max={24}
                step={1}
                value={[parseInt(skinData.border_radius) || 0]}
                onValueChange={([v]) =>
                  setSkinData((prev) => ({ ...prev, border_radius: String(v) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Velocidade da Animação</Label>
              <Select
                value={skinData.animation_speed}
                onValueChange={(v) =>
                  setSkinData((prev) => ({ ...prev, animation_speed: v }))
                }
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANIMATION_SPEEDS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Custom CSS Section */}
          <div className="glass-card border-border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Code2 className="w-4 h-4" /> CSS Customizado
            </h3>
            <Textarea
              value={skinData.custom_css}
              onChange={(e) =>
                setSkinData((prev) => ({ ...prev, custom_css: e.target.value }))
              }
              placeholder=".preview-card { box-shadow: 0 0 20px rgba(139,92,246,.3); }"
              rows={5}
              className="bg-secondary border-border font-mono text-xs"
            />
          </div>
        </div>

        {/* RIGHT PANEL — Live Preview */}
        <div className="w-full lg:w-[60%] flex flex-col items-center">
          <div className="sticky top-4 w-full flex flex-col items-center gap-3">
            <Badge variant="outline" className="text-xs">
              Preview ao vivo
            </Badge>
            <SkinPreview skinData={skinData} />
          </div>
        </div>
      </div>

      {/* Skins Table */}
      <div className="glass-card border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Skins Salvas</h3>
          <Button
            size="sm"
            className="gradient-primary border-0"
            onClick={resetForm}
          >
            <Plus className="w-4 h-4 mr-1" /> Nova Skin
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : skins.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma skin salva ainda.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skins.map((skin) => (
                <TableRow key={skin.id}>
                  <TableCell className="font-medium">{skin.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {GAME_TYPES.find((g) => g.value === skin.game_type)?.label || skin.game_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {skin.is_template ? (
                      <Badge className="bg-primary/20 text-primary border-primary/30">Template</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(skin.created_at).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => loadSkinForEdit(skin)}
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => duplicateMutation.mutate(skin)}
                        title="Duplicar"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          setDeleteTarget(skin.id);
                          setDeleteDialogOpen(true);
                        }}
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Skin</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir esta skin? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1" />
              )}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
