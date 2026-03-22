import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Code, Eye, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { logAudit } from '@/hooks/use-audit';

interface PopupAsset {
  id: string;
  name: string;
  description: string | null;
  html: string;
  created_at: string;
  updated_at: string;
}

export default function PopupAssets() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PopupAsset | null>(null);
  const [previewAsset, setPreviewAsset] = useState<PopupAsset | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', html: '' });

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['popup_assets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('popup_assets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as PopupAsset[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (values.id) {
        const { error } = await supabase
          .from('popup_assets')
          .update({ name: values.name, description: values.description || null, html: values.html, updated_at: new Date().toISOString() })
          .eq('id', values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('popup_assets')
          .insert({ name: values.name, description: values.description || null, html: values.html });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['popup_assets'] });
      toast.success(editing ? 'Asset atualizado' : 'Asset criado');
      logAudit({ action: editing ? 'EDITAR' : 'CRIAR', resource_type: 'popup_asset', resource_id: editing?.id, resource_name: form.name });
      closeDialog();
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const asset = assets.find(a => a.id === id);
      const { error } = await supabase.from('popup_assets').delete().eq('id', id);
      if (error) throw error;
      return asset;
    },
    onSuccess: (asset) => {
      queryClient.invalidateQueries({ queryKey: ['popup_assets'] });
      toast.success('Asset excluído');
      logAudit({ action: 'EXCLUIR', resource_type: 'popup_asset', resource_id: asset?.id, resource_name: asset?.name });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => toast.error(err.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', description: '', html: '' });
    setOpen(true);
  };

  const openEdit = (asset: PopupAsset) => {
    setEditing(asset);
    setForm({ name: asset.name, description: asset.description || '', html: asset.html });
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
    setForm({ name: '', description: '', html: '' });
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.html.trim()) {
      toast.error('Nome e HTML são obrigatórios');
      return;
    }
    saveMutation.mutate({ ...form, id: editing?.id });
  };

  const handleCopy = (id: string, html: string) => {
    navigator.clipboard.writeText(html);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const preparePreview = (html: string) => `<!doctype html>
<html><head><meta charset="UTF-8"/><style>html,body{margin:0;padding:0;min-height:100%;background:#f5f5f5;}</style></head>
<body>${html}</body></html>`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assets HTML</h1>
          <p className="text-sm text-muted-foreground mt-1">Templates HTML reutilizáveis para popups</p>
        </div>
        <Button onClick={openNew} className="gradient-primary border-0" size="sm">
          <Plus className="w-4 h-4 mr-2" /> Novo Asset
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : assets.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Code className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">Nenhum asset criado ainda</p>
          <Button onClick={openNew} variant="outline" size="sm" className="mt-4">
            <Plus className="w-4 h-4 mr-2" /> Criar primeiro asset
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => (
            <Card key={asset.id} className="glass-card border-border hover:border-primary/30 transition-colors">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground truncate">{asset.name}</h3>
                    {asset.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{asset.description}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-[10px] ml-2 shrink-0">
                    <Code className="w-3 h-3 mr-1" /> HTML
                  </Badge>
                </div>

                <div className="bg-secondary/30 rounded-md p-2 max-h-24 overflow-hidden">
                  <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap break-all">
                    {asset.html.slice(0, 300)}{asset.html.length > 300 ? '...' : ''}
                  </pre>
                </div>

                <div className="text-[10px] text-muted-foreground">
                  Criado em {format(new Date(asset.created_at), 'dd/MM/yyyy HH:mm')}
                </div>

                <div className="flex items-center gap-1 pt-1 border-t border-border">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setPreviewAsset(asset)}>
                    <Eye className="w-3 h-3" /> Preview
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleCopy(asset.id, asset.html)}>
                    {copied === asset.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === asset.id ? 'Copiado' : 'Copiar'}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openEdit(asset)}>
                    <Pencil className="w-3 h-3" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-destructive hover:text-destructive ml-auto"
                    onClick={() => {
                      if (confirm(`Excluir "${asset.name}"?`)) deleteMutation.mutate(asset.id);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Asset' : 'Novo Asset HTML'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Banner Boas-vindas"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Breve descrição do template"
                className="mt-1"
              />
            </div>
            <div>
              <Label>HTML</Label>
              <Textarea
                value={form.html}
                onChange={(e) => setForm({ ...form, html: e.target.value })}
                placeholder="Cole o HTML aqui..."
                className="mt-1 font-mono text-xs min-h-[250px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="gradient-primary border-0">
              {saveMutation.isPending ? 'Salvando...' : editing ? 'Salvar' : 'Criar Asset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewAsset} onOpenChange={() => setPreviewAsset(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Preview: {previewAsset?.name}</DialogTitle>
          </DialogHeader>
          {previewAsset && (
            <div className="border border-border rounded-lg overflow-hidden bg-white" style={{ height: '500px' }}>
              <iframe
                srcDoc={preparePreview(previewAsset.html)}
                className="w-full h-full"
                sandbox="allow-scripts"
                title="preview"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
