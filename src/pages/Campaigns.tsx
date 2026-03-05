import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Plus, Megaphone, Trash2, CalendarIcon, X, Dices, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type CampaignType = 'aposte_e_ganhe' | 'deposite_e_ganhe';
type CampaignStatus = 'RASCUNHO' | 'ATIVA' | 'PAUSADA' | 'ENCERRADA';

const TYPE_LABELS: Record<CampaignType, string> = {
  aposte_e_ganhe: 'Aposte e Ganhe',
  deposite_e_ganhe: 'Deposite e Ganhe',
};

const TYPE_ICONS: Record<CampaignType, typeof Dices> = {
  aposte_e_ganhe: Dices,
  deposite_e_ganhe: Landmark,
};

const STATUS_COLORS: Record<CampaignStatus, string> = {
  RASCUNHO: 'bg-muted text-muted-foreground',
  ATIVA: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PAUSADA: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ENCERRADA: 'bg-red-500/15 text-red-400 border-red-500/30',
};

interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  description: string;
  segment_id: string | null;
  min_value: number;
  prize_value: number;
  prize_description: string;
  start_date: string;
  end_date: string;
  status: CampaignStatus;
  created_at: string;
  segment_name?: string;
}

export default function Campaigns() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'aposte_e_ganhe' as CampaignType,
    description: '',
    segment_id: '',
    min_value: '',
    prize_value: '',
    prize_description: '',
    start_date: undefined as Date | undefined,
    end_date: undefined as Date | undefined,
  });

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Fetch segment names
      const segmentIds = [...new Set((data as any[]).filter(c => c.segment_id).map(c => c.segment_id))];
      let segmentMap: Record<string, string> = {};
      if (segmentIds.length > 0) {
        const { data: segments } = await supabase.from('segments').select('id, name').in('id', segmentIds);
        if (segments) segmentMap = Object.fromEntries(segments.map(s => [s.id, s.name]));
      }

      return (data as any[]).map(c => ({
        ...c,
        segment_name: c.segment_id ? segmentMap[c.segment_id] || '—' : null,
      })) as Campaign[];
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
      const { error } = await supabase.from('campaigns').insert({
        name: form.name,
        type: form.type,
        description: form.description,
        segment_id: form.segment_id || null,
        min_value: Number(form.min_value) || 0,
        prize_value: Number(form.prize_value) || 0,
        prize_description: form.prize_description,
        start_date: form.start_date.toISOString(),
        end_date: form.end_date.toISOString(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campanha criada com sucesso');
      setOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campanha excluída');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CampaignStatus }) => {
      const { error } = await supabase.from('campaigns').update({ status } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Status atualizado');
    },
  });

  const resetForm = () => setForm({
    name: '', type: 'aposte_e_ganhe', description: '', segment_id: '',
    min_value: '', prize_value: '', prize_description: '',
    start_date: undefined, end_date: undefined,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campanhas</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie campanhas de bonificação para seus jogadores</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Nova Campanha</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Criar Campanha</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Promo Março" />
              </div>

              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as CampaignType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aposte_e_ganhe">🎲 Aposte e Ganhe</SelectItem>
                    <SelectItem value="deposite_e_ganhe">🏦 Deposite e Ganhe</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Segmento</Label>
                <Select value={form.segment_id} onValueChange={v => setForm(f => ({ ...f, segment_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione um segmento (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {segments.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalhes da campanha..." rows={2} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{form.type === 'aposte_e_ganhe' ? 'Aposta mínima (R$)' : 'Depósito mínimo (R$)'}</Label>
                  <Input type="number" value={form.min_value} onChange={e => setForm(f => ({ ...f, min_value: e.target.value }))} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Prêmio (R$)</Label>
                  <Input type="number" value={form.prize_value} onChange={e => setForm(f => ({ ...f, prize_value: e.target.value }))} placeholder="0.00" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Descrição do prêmio</Label>
                <Input value={form.prize_description} onChange={e => setForm(f => ({ ...f, prize_description: e.target.value }))} placeholder="Ex: Bônus de 50% até R$100" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Data início *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-full justify-start gap-2', !form.start_date && 'text-muted-foreground')}>
                        <CalendarIcon className="w-4 h-4" />
                        {form.start_date ? format(form.start_date, 'dd/MM/yyyy') : 'Selecionar'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={form.start_date} onSelect={d => setForm(f => ({ ...f, start_date: d }))} className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label>Data fim *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-full justify-start gap-2', !form.end_date && 'text-muted-foreground')}>
                        <CalendarIcon className="w-4 h-4" />
                        {form.end_date ? format(form.end_date, 'dd/MM/yyyy') : 'Selecionar'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={form.end_date} onSelect={d => setForm(f => ({ ...f, end_date: d }))} disabled={d => form.start_date ? d < form.start_date : false} className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Criando...' : 'Criar Campanha'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        {(['RASCUNHO', 'ATIVA', 'PAUSADA', 'ENCERRADA'] as CampaignStatus[]).map(status => (
          <Card key={status} className="border-border">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase">{status}</p>
                <p className="text-2xl font-bold">{campaigns.filter(c => c.status === status).length}</p>
              </div>
              <Badge className={cn('text-xs', STATUS_COLORS[status])}>{status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">Carregando...</div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Megaphone className="w-10 h-10 opacity-40" />
              <p>Nenhuma campanha criada ainda</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Segmento</TableHead>
                  <TableHead>Valor Mín.</TableHead>
                  <TableHead>Prêmio</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map(c => {
                  const Icon = TYPE_ICONS[c.type] || Megaphone;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{c.name}</p>
                            {c.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{c.description}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><span className="text-xs">{TYPE_LABELS[c.type]}</span></TableCell>
                      <TableCell>
                        {c.segment_name ? (
                          <Badge variant="outline" className="text-xs">{c.segment_name}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">R$ {Number(c.min_value).toFixed(2)}</TableCell>
                      <TableCell className="text-sm">R$ {Number(c.prize_value).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(c.start_date), 'dd/MM/yy')} → {format(new Date(c.end_date), 'dd/MM/yy')}
                      </TableCell>
                      <TableCell>
                        <Select value={c.status} onValueChange={v => updateStatusMutation.mutate({ id: c.id, status: v as CampaignStatus })}>
                          <SelectTrigger className="h-7 text-xs w-[120px]">
                            <Badge className={cn('text-[10px]', STATUS_COLORS[c.status as CampaignStatus])}>{c.status}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="RASCUNHO">Rascunho</SelectItem>
                            <SelectItem value="ATIVA">Ativa</SelectItem>
                            <SelectItem value="PAUSADA">Pausada</SelectItem>
                            <SelectItem value="ENCERRADA">Encerrada</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
