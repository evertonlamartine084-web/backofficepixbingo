import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, MessageSquare, Trash2, Copy, Check, ExternalLink, Eye, CalendarIcon, Code, Type, Pin, MousePointer, Users, BarChart3, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [editingPopup, setEditingPopup] = useState<Popup | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewPopup, setPreviewPopup] = useState<Popup | null>(null);
  const [statsPopup, setStatsPopup] = useState<Popup | null>(null);
  const [showGtmScript, setShowGtmScript] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
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
  const baseUrl = `https://${projectId}.supabase.co/functions/v1`;
  const endpointUrl = `${baseUrl}/popup-check?cpf=INSERIR_CPF`;
  const eventEndpointUrl = `${baseUrl}/popup-event`;

  const gtmScript = `<script>
(function() {
  var BASE = '${baseUrl}';
  var CHECK_URL = BASE + '/popup-check';
  var EVENT_URL = BASE + '/popup-event';
  

  function getCpf() {
    // 1) Scan all page text for CPF pattern (xxx.xxx.xxx-xx or 11 digits)
    var bodyText = document.body ? document.body.innerText || '' : '';
    var cpfMatch = bodyText.match(/\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}/);
    if (cpfMatch) return cpfMatch[0].replace(/\\D/g,'');
    // 2) Try input fields (hidden or visible) with CPF-like values
    var inputs = document.querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      var v = inputs[i].value || '';
      if (v.replace(/\\D/g,'').length === 11) return v.replace(/\\D/g,'');
    }
    // 3) Cookie fallback (cpf, user_cpf, documento)
    var cookies = document.cookie.split(';');
    for (var j = 0; j < cookies.length; j++) {
      var c = cookies[j].trim();
      if (c.indexOf('cpf=') === 0 || c.indexOf('user_cpf=') === 0 || c.indexOf('documento=') === 0) {
        var val = c.split('=')[1];
        if (val && val.replace(/\\D/g,'').length >= 11) return val.replace(/\\D/g,'');
      }
    }
    // 4) localStorage / sessionStorage
    var keys = ['cpf','user_cpf','playerCpf','player_cpf'];
    for (var k = 0; k < keys.length; k++) {
      var s = localStorage.getItem(keys[k]) || sessionStorage.getItem(keys[k]);
      if (s && s.replace(/\\D/g,'').length >= 11) return s.replace(/\\D/g,'');
    }
    // 5) data-cpf attribute or window global
    var el = document.querySelector('[data-cpf]');
    if (el) { var d = el.getAttribute('data-cpf'); if (d && d.replace(/\\D/g,'').length >= 11) return d.replace(/\\D/g,''); }
    if (window.playerCpf && String(window.playerCpf).replace(/\\D/g,'').length >= 11) return String(window.playerCpf).replace(/\\D/g,'');
    return null;
  }

  function trackEvent(popupId, cpf, type, callback) {
    var payload = JSON.stringify({ popup_id: popupId, cpf: cpf, event_type: type });
    fetch(EVENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': '${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}' },
      body: payload,
      keepalive: true
    })
    .then(function() { if (callback) callback(); })
    .catch(function() { if (callback) callback(); });
  }

  var activeCpf = null;
  var displayedIds = {};

  function checkAndShow() {
    var cpf = activeCpf || getCpf();
    if (!cpf) return;
    activeCpf = cpf;
    fetch(CHECK_URL + '?cpf=' + cpf, { cache: 'no-store' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.popups || !data.popups.length) return;
        data.popups.forEach(function(p) {
          if (displayedIds[p.id]) return;
          displayedIds[p.id] = true;
          trackEvent(p.id, cpf, 'view');
          if (p.custom_html) {
            var div = document.createElement('div');
            div.innerHTML = p.custom_html;
            document.body.appendChild(div);
            div.querySelectorAll('a, button').forEach(function(btn) {
              btn.addEventListener('click', function() { trackEvent(p.id, cpf, 'click'); });
            });
          } else {
            var overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;';
            var box = document.createElement('div');
            box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:400px;width:90%;text-align:center;';
            if (p.image_url) { var img = document.createElement('img'); img.src = p.image_url; img.style.cssText = 'width:100%;border-radius:8px;margin-bottom:16px;'; box.appendChild(img); }
            var h = document.createElement('h2'); h.textContent = p.title; h.style.cssText = 'margin:0 0 8px;font-size:20px;'; box.appendChild(h);
            var m = document.createElement('p'); m.textContent = p.message; m.style.cssText = 'margin:0 0 16px;color:#666;'; box.appendChild(m);
            var btn = document.createElement('button');
            btn.textContent = p.button_text || 'OK';
            btn.style.cssText = 'background:#22c55e;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:16px;';
            btn.onclick = function() {
              trackEvent(p.id, cpf, 'click', function() {
                if (p.button_url) window.location.href = p.button_url;
                else overlay.remove();
              });
            };
            box.appendChild(btn);
            overlay.appendChild(box);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
            document.body.appendChild(overlay);
          }
        });
      }).catch(function(){});
  }

  // Use sessionStorage to know if this is the first load of the session (login)
  var SESSION_KEY = '__pbr_popup_ready';
  var isFirstLoad = !sessionStorage.getItem(SESSION_KEY);
  sessionStorage.setItem(SESSION_KEY, '1');

  function startPopups() {
    var cpf = getCpf();
    if (cpf) {
      activeCpf = cpf;
      checkAndShow();
    } else {
      var attempts = 0;
      var cpfInterval = setInterval(function() {
        var cpf = getCpf();
        if (cpf) { activeCpf = cpf; clearInterval(cpfInterval); checkAndShow(); return; }
        if (++attempts >= 15) clearInterval(cpfInterval);
      }, 2000);
    }
    // Continuous polling every 10s
    setInterval(checkAndShow, 10000);
  }

  // First load of session (login) → delay 5s. Already in session → immediate.
  if (isFirstLoad) {
    setTimeout(startPopups, 5000);
  } else {
    startPopups();
  }
})();
</script>`;

  const copyGtmScript = () => {
    navigator.clipboard.writeText(gtmScript);
    setCopiedScript(true);
    toast.success('Script GTM copiado!');
    setTimeout(() => setCopiedScript(false), 2000);
  };

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

  // Fetch event counts per popup
  const { data: eventCounts = {} } = useQuery({
    queryKey: ['popup-event-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('popup_events')
        .select('popup_id, event_type');
      if (error) throw error;
      const counts: Record<string, { views: number; clicks: number }> = {};
      for (const row of (data || [])) {
        if (!counts[row.popup_id]) counts[row.popup_id] = { views: 0, clicks: 0 };
        if (row.event_type === 'view') counts[row.popup_id].views++;
        else if (row.event_type === 'click') counts[row.popup_id].clicks++;
      }
      return counts;
    },
  });

  // Fetch detail events for selected popup
  const { data: statsEvents = [], isLoading: statsLoading } = useQuery({
    queryKey: ['popup-events-detail', statsPopup?.id],
    enabled: !!statsPopup,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('popup_events')
        .select('cpf_masked, event_type, created_at')
        .eq('popup_id', statsPopup!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
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

  const updateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!form.name || !form.start_date || !form.end_date) throw new Error('Preencha os campos obrigatórios');
      if (form.mode === 'simple' && !form.title) throw new Error('Preencha o título');
      if (form.mode === 'html' && !form.custom_html) throw new Error('Preencha o HTML');
      const { error } = await supabase.from('popups').update({
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
      } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['popups'] });
      toast.success('Popup atualizado');
      setOpen(false);
      setEditingPopup(null);
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
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
              <BarChart3 className="w-3 h-3 inline mr-1" /> Endpoint de Tracking (POST)
            </p>
            <code className="text-xs text-muted-foreground break-all font-mono">{eventEndpointUrl}</code>
            <p className="text-[10px] text-muted-foreground mt-1">
              Envie um POST com JSON: <code className="text-primary">{'{"popup_id": "...", "cpf": "...", "event_type": "view|click"}'}</code>
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-border/50">
            <button
              onClick={() => setShowGtmScript(!showGtmScript)}
              className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider hover:underline"
            >
              <Code className="w-3 h-3" /> Script GTM Completo (copiar e colar)
              {showGtmScript ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showGtmScript && (
              <div className="mt-2 space-y-2">
                <p className="text-[10px] text-muted-foreground">
                  Cole este script como uma <strong>Custom HTML Tag</strong> no GTM. Ele detecta o CPF automaticamente (cookies, localStorage, sessionStorage, DOM, variável global <code>window.playerCpf</code>) e registra views/cliques.
                </p>
                <pre className="text-[10px] text-muted-foreground bg-background border border-border rounded-md p-3 overflow-x-auto max-h-60 font-mono whitespace-pre">{gtmScript}</pre>
                <Button variant="outline" size="sm" onClick={copyGtmScript} className="gap-2">
                  {copiedScript ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  {copiedScript ? 'Copiado!' : 'Copiar Script'}
                </Button>
              </div>
            )}
          </div>
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
                      <span>•</span>
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {eventCounts[p.id]?.views || 0}</span>
                      <span className="flex items-center gap-1"><MousePointer className="w-3 h-3" /> {eventCounts[p.id]?.clicks || 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setStatsPopup(p)}>
                      <BarChart3 className="w-4 h-4" />
                    </Button>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

      {/* Stats Dialog */}
      <Dialog open={!!statsPopup} onOpenChange={() => setStatsPopup(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" /> Estatísticas: {statsPopup?.name}
            </DialogTitle>
            <DialogDescription>Visualizações e cliques registrados para este popup.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Card className="border-border">
              <CardContent className="p-4 text-center">
                <Eye className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-2xl font-bold">{eventCounts[statsPopup?.id || '']?.views || 0}</p>
                <p className="text-xs text-muted-foreground">Visualizações</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4 text-center">
                <MousePointer className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-2xl font-bold">{eventCounts[statsPopup?.id || '']?.clicks || 0}</p>
                <p className="text-xs text-muted-foreground">Cliques</p>
              </CardContent>
            </Card>
          </div>
          <Tabs defaultValue="views">
            <TabsList className="w-full">
              <TabsTrigger value="views" className="flex-1 gap-1"><Eye className="w-3 h-3" /> Quem viu</TabsTrigger>
              <TabsTrigger value="clicks" className="flex-1 gap-1"><MousePointer className="w-3 h-3" /> Quem clicou</TabsTrigger>
            </TabsList>
            <TabsContent value="views">
              {statsLoading ? <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">CPF</TableHead>
                      <TableHead className="text-xs">Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statsEvents.filter(e => e.event_type === 'view').length === 0 ? (
                      <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground text-xs">Nenhuma visualização</TableCell></TableRow>
                    ) : statsEvents.filter(e => e.event_type === 'view').map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono">{e.cpf_masked}</TableCell>
                        <TableCell className="text-xs">{new Date(e.created_at).toLocaleString('pt-BR')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            <TabsContent value="clicks">
              {statsLoading ? <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">CPF</TableHead>
                      <TableHead className="text-xs">Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statsEvents.filter(e => e.event_type === 'click').length === 0 ? (
                      <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground text-xs">Nenhum clique</TableCell></TableRow>
                    ) : statsEvents.filter(e => e.event_type === 'click').map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono">{e.cpf_masked}</TableCell>
                        <TableCell className="text-xs">{new Date(e.created_at).toLocaleString('pt-BR')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
