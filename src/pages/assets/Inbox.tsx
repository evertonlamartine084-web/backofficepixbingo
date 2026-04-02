import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type InboxMessage = Database['public']['Tables']['inbox_messages']['Row'];
import { toast } from 'sonner';
import { Plus, Mail, Trash2, Eye, CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function Inbox() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', message: '', image_url: '', button_text: 'Ver', button_url: '',
    segment_id: '', start_date: undefined as Date | undefined, end_date: undefined as Date | undefined,
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['inbox_messages'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inbox_messages').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as InboxMessage[];
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
      if (!form.title || !form.start_date || !form.end_date) throw new Error('Preencha os campos obrigatórios');
      if (form.end_date <= form.start_date) throw new Error('Data de fim deve ser posterior à data de início');
      const { error } = await supabase.from('inbox_messages').insert({
        title: form.title,
        message: form.message,
        image_url: form.image_url || null,
        button_text: form.button_text || 'Ver',
        button_url: form.button_url || null,
        segment_id: form.segment_id || null,
        start_date: form.start_date.toISOString(),
        end_date: form.end_date.toISOString(),
      } as Database['public']['Tables']['inbox_messages']['Insert']);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox_messages'] });
      toast.success('Mensagem criada');
      setOpen(false);
      setForm({ title: '', message: '', image_url: '', button_text: 'Ver', button_url: '', segment_id: '', start_date: undefined, end_date: undefined });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('inbox_messages').update({ active } as Database['public']['Tables']['inbox_messages']['Update']).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inbox_messages'] }); toast.success('Status atualizado'); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inbox_messages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inbox_messages'] }); toast.success('Mensagem excluída'); },
  });

  const isActive = (m: InboxMessage) => m.active && new Date(m.start_date) <= new Date() && new Date(m.end_date) >= new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Mail className="w-7 h-7 text-primary" /> Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Mensagens exibidas na caixa de entrada do jogador no site</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2 gradient-primary border-0">
          <Plus className="w-4 h-4" /> Nova Mensagem
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : messages.length === 0 ? (
        <Card className="border-dashed border-2 border-border">
          <CardContent className="py-12 text-center">
            <Mail className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhuma mensagem de inbox criada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {messages.map((m: InboxMessage) => (
            <Card key={m.id} className="border-border hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm truncate">{m.title}</h3>
                      {isActive(m) ? (
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">Ativo</Badge>
                      ) : m.active ? (
                        <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">Agendado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Inativo</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{m.message || '—'}</p>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      <span>{new Date(m.start_date).toLocaleDateString('pt-BR')} → {new Date(m.end_date).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={m.active} onCheckedChange={(active) => toggleMutation.mutate({ id: m.id, active })} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { if (confirm('Excluir mensagem?')) deleteMutation.mutate(m.id); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Mensagem Inbox</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Título</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: 🎁 Bônus disponível!" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Mensagem</Label>
              <Textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Texto da mensagem..." rows={3} className="mt-1" />
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
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="gradient-primary border-0">Criar Mensagem</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
