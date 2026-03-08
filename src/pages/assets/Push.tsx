import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Bell, Trash2, CalendarIcon, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function Push() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', message: '', icon_url: '', action_url: '', segment_id: '',
    scheduled_at: undefined as Date | undefined,
  });

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['push_notifications'],
    queryFn: async () => {
      const { data, error } = await supabase.from('push_notifications').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
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
      if (!form.title || !form.scheduled_at) throw new Error('Preencha título e data');
      const { error } = await supabase.from('push_notifications').insert({
        title: form.title,
        message: form.message,
        icon_url: form.icon_url || null,
        action_url: form.action_url || null,
        segment_id: form.segment_id || null,
        scheduled_at: form.scheduled_at.toISOString(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push_notifications'] });
      toast.success('Push criado');
      setOpen(false);
      setForm({ title: '', message: '', icon_url: '', action_url: '', segment_id: '', scheduled_at: undefined });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('push_notifications').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['push_notifications'] }); toast.success('Push excluído'); },
  });

  const statusColor: Record<string, string> = {
    RASCUNHO: 'bg-muted text-muted-foreground',
    AGENDADO: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    ENVIADO: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Bell className="w-7 h-7 text-primary" /> Push Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie notificações push enviadas aos jogadores</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2 gradient-primary border-0">
          <Plus className="w-4 h-4" /> Novo Push
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : notifications.length === 0 ? (
        <Card className="border-dashed border-2 border-border">
          <CardContent className="py-12 text-center">
            <Bell className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhum push criado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {notifications.map((n: any) => (
            <Card key={n.id} className="border-border hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm truncate">{n.title}</h3>
                      <Badge className={cn("text-[10px]", statusColor[n.status] || statusColor.RASCUNHO)}>{n.status}</Badge>
                      {n.sent_count > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Send className="w-3 h-3" />{n.sent_count}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{n.message || '—'}</p>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      <span>Agendado: {new Date(n.scheduled_at).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => { if (confirm('Excluir push?')) deleteMutation.mutate(n.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Push</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Título</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: 🔥 Promoção relâmpago!" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Mensagem</Label>
              <Textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Texto da notificação..." rows={3} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">URL do ícone (opcional)</Label>
                <Input value={form.icon_url} onChange={e => setForm(f => ({ ...f, icon_url: e.target.value }))} placeholder="https://..." className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">URL de ação (opcional)</Label>
                <Input value={form.action_url} onChange={e => setForm(f => ({ ...f, action_url: e.target.value }))} placeholder="https://..." className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Segmento (vazio = todos)</Label>
              <Select value={form.segment_id} onValueChange={v => setForm(f => ({ ...f, segment_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Todos os jogadores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Todos os jogadores</SelectItem>
                  {segments.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Agendar para</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !form.scheduled_at && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.scheduled_at ? format(form.scheduled_at, "dd/MM/yyyy HH:mm") : "Selecionar data/hora"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <DateTimePicker date={form.scheduled_at} onSelect={d => setForm(f => ({ ...f, scheduled_at: d }))} />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="gradient-primary border-0">Criar Push</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
