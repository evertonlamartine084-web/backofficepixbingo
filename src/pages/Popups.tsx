import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, MessageSquare, Trash2, Copy, Check, ExternalLink, Eye, CalendarIcon, Code, Type, Pin, Layout } from 'lucide-react';
import { WidgetBuilder, defaultWidgetConfig, generateWidgetHtml, type WidgetConfig } from '@/components/WidgetBuilder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Popup {
  id: string;
  name: string;
  title: string;
  message: string;
  image_url: string | null;
  button_text: string;
  button_url: string | null;
  custom_html: string | null;
  segment_id: string | null;
  start_date: string;
  end_date: string;
  active: boolean;
  persistent: boolean;
  style: Record<string, any>;
  created_at: string;
  segment_name?: string;
}

const prepareHtmlPreview = (html: string) => {
  const withoutCommonGuards = html
    .replace(/location\.origin\s*\+\s*location\.pathname/g, "'https://pixbingobr.com/'")
    .replace(/window\.location\.origin\s*\+\s*window\.location\.pathname/g, "'https://pixbingobr.com/'")
    .replace(/if\s*\(\s*allowed\.indexOf\(current\)\s*===\s*-1\s*\)\s*return;?/gi, '')
    .replace(/if\s*\(\s*!allowed\.includes\(current\)\s*\)\s*return;?/gi, '')
    .replace(/\blocalStorage\b/g, '__lovablePreviewLocalStorage')
    .replace(/\bsessionStorage\b/g, '__lovablePreviewSessionStorage');

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body { margin: 0; padding: 0; min-height: 100%; background: #f5f5f5; }
    </style>
    <script>
      (function () {
        const createStorage = () => {
          const map = new Map();
          return {
            getItem: (key) => (map.has(key) ? map.get(key) : null),
            setItem: (key, value) => map.set(key, String(value)),
            removeItem: (key) => map.delete(key),
            clear: () => map.clear(),
          };
        };
        window.__lovablePreviewLocalStorage = createStorage();
        window.__lovablePreviewSessionStorage = createStorage();
        window.__POPUP_PREVIEW__ = true;
      })();
    </script>
  </head>
  <body>
    ${withoutCommonGuards}
  </body>
</html>`;
};

export default function Popups() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewPopup, setPreviewPopup] = useState<Popup | null>(null);
  const [form, setForm] = useState({
    name: '',
    mode: 'simple' as 'simple' | 'html',
    title: '',
    message: '',
    image_url: '',
    button_text: 'OK',
    button_url: '',
    custom_html: '',
    segment_id: '',
    persistent: false,
    start_date: undefined as Date | undefined,
    end_date: undefined as Date | undefined,
  });

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const endpointUrl = `https://${projectId}.supabase.co/functions/v1/popup-check?cpf=INSERIR_CPF`;

  const { data: popups = [], isLoading } = useQuery({
    queryKey: ['popups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('popups')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const segmentIds = [...new Set((data as any[]).filter(p => p.segment_id).map(p => p.segment_id))];
      let segMap: Record<string, string> = {};
      if (segmentIds.length > 0) {
        const { data: segs } = await supabase.from('segments').select('id, name').in('id', segmentIds);
        if (segs) segMap = Object.fromEntries(segs.map(s => [s.id, s.name]));
      }

      return (data as any[]).map(p => ({
        ...p,
        segment_name: p.segment_id ? segMap[p.segment_id] || '—' : null,
      })) as Popup[];
    },
  });

  const { data: segments = [] } = useQuery({
    queryKey: ['segments-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('segments').select('id, name').order('name');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.start_date || !form.end_date) throw new Error('Preencha os campos obrigatórios');
      if (form.mode === 'simple' && !form.title) throw new Error('Preencha o título');
      if (form.mode === 'html' && !form.custom_html) throw new Error('Preencha o HTML');
      const { error } = await supabase.from('popups').insert({
        name: form.name,
        title: form.mode === 'simple' ? form.title : form.name,
        message: form.mode === 'simple' ? form.message : '',
        image_url: form.mode === 'simple' ? (form.image_url || null) : null,
        button_text: form.mode === 'simple' ? (form.button_text || 'OK') : '',
        button_url: form.mode === 'simple' ? (form.button_url || null) : null,
        custom_html: form.mode === 'html' ? form.custom_html : null,
        segment_id: form.segment_id || null,
        persistent: form.persistent,
        start_date: form.start_date.toISOString(),
        end_date: form.end_date.toISOString(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['popups'] });
      toast.success('Popup criado');
      setOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('popups').update({ active } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['popups'] });
      toast.success('Status atualizado');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('popups').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['popups'] });
      toast.success('Popup excluído');
    },
  });

  const resetForm = () => setForm({
    name: '', mode: 'simple', title: '', message: '', image_url: '', button_text: 'OK',
    button_url: '', custom_html: '', segment_id: '', persistent: false, start_date: undefined, end_date: undefined,
  });

  const copyEndpoint = () => {
    navigator.clipboard.writeText(endpointUrl);
    setCopied(true);
    toast.success('URL copiada!');
    setTimeout(() => setCopied(false), 2000);
  };

  const isActive = (p: Popup) => p.active && new Date(p.start_date) <= new Date() && new Date(p.end_date) >= new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <MessageSquare className="w-7 h-7 text-primary" /> Popups GTM
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie popups que serão exibidos no site via Google Tag Manager
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2 gradient-primary border-0">
          <Plus className="w-4 h-4" /> Novo Popup
        </Button>
      </div>

      {/* Endpoint URL Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
                <ExternalLink className="w-3 h-3 inline mr-1" /> Endpoint para o GTM
              </p>
              <code className="text-xs text-muted-foreground break-all font-mono">{endpointUrl}</code>
            </div>
            <Button variant="outline" size="sm" onClick={copyEndpoint} className="shrink-0 gap-2">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            O GTM deve fazer um GET neste endpoint substituindo <code className="text-primary">INSERIR_CPF</code> pelo CPF do jogador logado. Retorna os popups ativos para aquele jogador.
          </p>
        </CardContent>
      </Card>

      {/* Popups List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : popups.length === 0 ? (
        <Card className="border-dashed border-2 border-border">
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhum popup criado ainda</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {popups.map(p => (
            <Card key={p.id} className="border-border hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm truncate">{p.name}</h3>
                      {isActive(p) ? (
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">Ativo</Badge>
                      ) : p.active ? (
                        <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">Agendado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Inativo</Badge>
                      )}
                      {p.custom_html && <Badge variant="outline" className="text-[10px] gap-1"><Code className="w-3 h-3" />HTML</Badge>}
                      {p.persistent && <Badge variant="outline" className="text-[10px] gap-1 border-blue-500/30 text-blue-400"><Pin className="w-3 h-3" />Widget</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{p.custom_html ? 'Conteúdo HTML customizado' : p.title}</p>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      <span>Segmento: {p.segment_name || 'Todos'}</span>
                      <span>•</span>
                      <span>{new Date(p.start_date).toLocaleDateString('pt-BR')} → {new Date(p.end_date).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewPopup(p)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Switch
                      checked={p.active}
                      onCheckedChange={(active) => toggleMutation.mutate({ id: p.id, active })}
                    />
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                      onClick={() => { if (confirm('Excluir popup?')) deleteMutation.mutate(p.id); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Popup</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Nome interno</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Promo março" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs mb-2 block">Modo do conteúdo</Label>
              <div className="flex gap-2">
                <Button type="button" variant={form.mode === 'simple' ? 'default' : 'outline'} size="sm" className="gap-2" onClick={() => setForm(f => ({ ...f, mode: 'simple' }))}>
                  <Type className="w-4 h-4" /> Simples
                </Button>
                <Button type="button" variant={form.mode === 'html' ? 'default' : 'outline'} size="sm" className="gap-2" onClick={() => setForm(f => ({ ...f, mode: 'html' }))}>
                  <Code className="w-4 h-4" /> HTML / CSS / JS
                </Button>
              </div>
            </div>
            {form.mode === 'simple' ? (
              <>
                <div>
                  <Label className="text-xs">Título do popup</Label>
                  <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: 🎉 Bônus Especial!" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Mensagem</Label>
                  <Textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Texto do popup..." rows={3} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Texto do botão</Label>
                    <Input value={form.button_text} onChange={e => setForm(f => ({ ...f, button_text: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">URL do botão (opcional)</Label>
                    <Input value={form.button_url} onChange={e => setForm(f => ({ ...f, button_url: e.target.value }))} placeholder="https://..." className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">URL da imagem (opcional)</Label>
                  <Input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://..." className="mt-1" />
                </div>
              </>
            ) : (
              <div>
                <Label className="text-xs">HTML / CSS / JS customizado</Label>
                <Textarea
                  value={form.custom_html}
                  onChange={e => setForm(f => ({ ...f, custom_html: e.target.value }))}
                  placeholder={'<div style="text-align:center; padding:20px;">\n  <h2>🎉 Promoção!</h2>\n  <p>Deposite agora e ganhe bônus</p>\n  <button onclick="window.location=\'/deposito\'">Depositar</button>\n</div>'}
                  rows={10}
                  className="mt-1 font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Cole aqui o HTML completo do popup. Pode incluir &lt;style&gt; e &lt;script&gt;.</p>
              </div>
            )}
            <div>
              <Label className="text-xs">Segmento (vazio = todos os jogadores)</Label>
              <Select value={form.segment_id} onValueChange={v => setForm(f => ({ ...f, segment_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Todos os jogadores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Todos os jogadores</SelectItem>
                  {segments.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label className="text-xs font-medium">Widget persistente</Label>
                <p className="text-[10px] text-muted-foreground">Mantém visível em todas as páginas (botão flutuante, banner, etc)</p>
              </div>
              <Switch checked={form.persistent} onCheckedChange={v => setForm(f => ({ ...f, persistent: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !form.start_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.start_date ? format(form.start_date, "dd/MM/yyyy HH:mm") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <DateTimePicker date={form.start_date} onSelect={d => setForm(f => ({ ...f, start_date: d }))} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">Fim</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !form.end_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.end_date ? format(form.end_date, "dd/MM/yyyy HH:mm") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <DateTimePicker date={form.end_date} onSelect={d => setForm(f => ({ ...f, end_date: d }))} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="gradient-primary border-0">
              Criar Popup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewPopup} onOpenChange={() => setPreviewPopup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Preview: {previewPopup?.name}</DialogTitle>
            <DialogDescription>
              Pré-visualização do popup com simulação local para scripts HTML/CSS/JS.
            </DialogDescription>
          </DialogHeader>
          {previewPopup?.custom_html ? (
            <div className="py-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Preview HTML</p>
              <iframe
                srcDoc={prepareHtmlPreview(previewPopup.custom_html)}
                className="w-full min-h-[300px] rounded-lg border border-border bg-white"
                sandbox="allow-scripts"
                title="Popup Preview"
              />
            </div>
          ) : (
            <div className="text-center space-y-4 py-2">
              {previewPopup?.image_url && (
                <img src={previewPopup.image_url} alt="" className="w-full max-h-48 object-cover rounded-lg" />
              )}
              <h2 className="text-lg font-bold">{previewPopup?.title}</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{previewPopup?.message}</p>
              <Button className="w-full gradient-primary border-0">
                {previewPopup?.button_text || 'OK'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
