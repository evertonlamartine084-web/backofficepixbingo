import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Plus, Megaphone, Trash2, CalendarIcon, Dices, Landmark, Play, Loader2, Eye, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { getSavedCredentials } from '@/hooks/use-proxy';

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

const PARTICIPANT_STATUS_COLORS: Record<string, string> = {
  PENDENTE: 'bg-muted text-muted-foreground',
  NAO_ELEGIVEL: 'bg-amber-500/15 text-amber-400',
  CREDITADO: 'bg-emerald-500/15 text-emerald-400',
  ERRO: 'bg-red-500/15 text-red-400',
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
  wallet_type: 'REAL' | 'BONUS';
  segment_name?: string;
}

interface Participant {
  id: string;
  campaign_id: string;
  cpf: string;
  cpf_masked: string;
  uuid: string | null;
  status: string;
  total_value: number;
  prize_credited: boolean;
  credit_result: string | null;
  created_at: string;
}

export default function Campaigns() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [processing, setProcessing] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'aposte_e_ganhe' as CampaignType,
    description: '',
    segment_id: '',
    min_value: '',
    prize_value: '',
    prize_description: '',
    wallet_type: 'REAL' as 'REAL' | 'BONUS',
    start_date: undefined as Date | undefined,
    end_date: undefined as Date | undefined,
    start_time: '00:00',
    end_time: '23:59',
  });

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns').select('*').order('created_at', { ascending: false });
      if (error) throw error;
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

  const { data: participants = [], refetch: refetchParticipants } = useQuery({
    queryKey: ['campaign-participants', selectedCampaign?.id],
    enabled: !!selectedCampaign,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_participants').select('*')
        .eq('campaign_id', selectedCampaign!.id)
        .order('status', { ascending: true });
      if (error) throw error;
      return (data || []) as Participant[];
    },
  });

  // Realtime subscription for participants
  useEffect(() => {
    if (!selectedCampaign) return;
    const channel = supabase
      .channel(`campaign-${selectedCampaign.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'campaign_participants',
        filter: `campaign_id=eq.${selectedCampaign.id}`,
      }, () => {
        refetchParticipants();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedCampaign?.id]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.start_date || !form.end_date) throw new Error('Preencha os campos obrigatórios');
      const [sh, sm] = form.start_time.split(':').map(Number);
      const [eh, em] = form.end_time.split(':').map(Number);
      const startDate = new Date(form.start_date);
      startDate.setHours(sh, sm, 0, 0);
      const endDate = new Date(form.end_date);
      endDate.setHours(eh, em, 59, 999);
      const { error } = await supabase.from('campaigns').insert({
        name: form.name, type: form.type, description: form.description,
        segment_id: form.segment_id || null,
        min_value: Number(form.min_value) || 0, prize_value: Number(form.prize_value) || 0,
        prize_description: form.prize_description,
        wallet_type: form.wallet_type,
        start_date: startDate.toISOString(), end_date: endDate.toISOString(),
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

  const processCampaign = async (campaign: Campaign) => {
    const creds = getSavedCredentials();
    if (!creds.username || !creds.password) {
      toast.error('Configure as credenciais da plataforma primeiro (barra superior)');
      return;
    }
    if (!campaign.segment_id) {
      toast.error('Campanha sem segmento vinculado');
      return;
    }

    setProcessing(true);
    setSelectedCampaign(campaign);

    try {
      const { data, error } = await supabase.functions.invoke('process-campaign', {
        body: {
          campaign_id: campaign.id,
          username: creds.username,
          password: creds.password,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao processar campanha');

      const result = data.data;
      toast.success(`Processado: ${result.processed} jogadores | Elegíveis: ${result.eligible} | Creditados: ${result.credited} | Erros: ${result.errors}`);
      refetchParticipants();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao processar');
    } finally {
      setProcessing(false);
    }
  };

  const resetForm = () => setForm({
    name: '', type: 'aposte_e_ganhe', description: '', segment_id: '',
    min_value: '', prize_value: '', prize_description: '', wallet_type: 'REAL',
    start_date: undefined, end_date: undefined, start_time: '00:00', end_time: '23:59',
  });

  // Campaign detail view
  if (selectedCampaign) {
    const stats = {
      total: participants.length,
      pendente: participants.filter(p => p.status === 'PENDENTE').length,
      elegivel: participants.filter(p => p.status === 'CREDITADO' || p.status === 'NAO_ELEGIVEL' || p.status === 'ERRO').length,
      creditado: participants.filter(p => p.prize_credited).length,
      nao_elegivel: participants.filter(p => p.status === 'NAO_ELEGIVEL').length,
      erro: participants.filter(p => p.status === 'ERRO').length,
    };
    const progress = stats.total > 0 ? ((stats.total - stats.pendente) / stats.total) * 100 : 0;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setSelectedCampaign(null)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{selectedCampaign.name}</h1>
            <p className="text-sm text-muted-foreground">{TYPE_LABELS[selectedCampaign.type]} • {selectedCampaign.segment_name || 'Sem segmento'}</p>
          </div>
          <Button
            onClick={() => processCampaign(selectedCampaign)}
            disabled={processing || !selectedCampaign.segment_id}
            className="gap-2"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {processing ? 'Processando...' : 'Processar Campanha'}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-foreground' },
            { label: 'Pendentes', value: stats.pendente, color: 'text-muted-foreground' },
            { label: 'Creditados', value: stats.creditado, color: 'text-emerald-400' },
            { label: 'Não Elegíveis', value: stats.nao_elegivel, color: 'text-amber-400' },
            { label: 'Erros', value: stats.erro, color: 'text-red-400' },
          ].map(s => (
            <Card key={s.label} className="border-border">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">{s.label}</p>
                <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {stats.total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progresso</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Regras */}
        <Card className="border-border">
          <CardContent className="p-4 grid grid-cols-5 gap-4 text-sm">
            <div><span className="text-muted-foreground text-xs block">Valor Mínimo</span> R$ {Number(selectedCampaign.min_value).toFixed(2)}</div>
            <div><span className="text-muted-foreground text-xs block">Prêmio</span> R$ {Number(selectedCampaign.prize_value).toFixed(2)}</div>
            <div><span className="text-muted-foreground text-xs block">Carteira</span> <Badge variant="outline" className="text-xs">{selectedCampaign.wallet_type}</Badge></div>
            <div><span className="text-muted-foreground text-xs block">Início</span> {format(new Date(selectedCampaign.start_date), 'dd/MM/yyyy HH:mm')}</div>
            <div><span className="text-muted-foreground text-xs block">Fim</span> {format(new Date(selectedCampaign.end_date), 'dd/MM/yyyy HH:mm')}</div>
          </CardContent>
        </Card>

        {/* Participants table */}
        <Card className="border-border">
          <CardContent className="p-0">
            {participants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <p className="text-sm">Nenhum participante ainda. Clique em "Processar Campanha" para iniciar.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CPF</TableHead>
                    <TableHead>UUID</TableHead>
                    <TableHead>Total Transacionado</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {participants.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">{p.cpf_masked}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{p.uuid ? p.uuid.slice(0, 12) + '...' : '—'}</TableCell>
                      <TableCell className="text-sm">R$ {Number(p.total_value).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge className={cn('text-[10px]', PARTICIPANT_STATUS_COLORS[p.status] || 'bg-muted')}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {p.credit_result || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Campaign list view
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
           <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Criar Campanha</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nome *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Promo Março" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo *</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as CampaignType }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aposte_e_ganhe">🎲 Aposte e Ganhe</SelectItem>
                      <SelectItem value="deposite_e_ganhe">🏦 Deposite e Ganhe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Segmento *</Label>
                  <Select value={form.segment_id} onValueChange={v => setForm(f => ({ ...f, segment_id: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {segments.map(s => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Carteira *</Label>
                  <Select value={form.wallet_type} onValueChange={v => setForm(f => ({ ...f, wallet_type: v as 'REAL' | 'BONUS' }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="REAL">💰 Saldo Real</SelectItem>
                      <SelectItem value="BONUS">🎁 Saldo Bônus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{form.type === 'aposte_e_ganhe' ? 'Aposta mín. (R$)' : 'Depósito mín. (R$)'}</Label>
                  <Input type="number" value={form.min_value} onChange={e => setForm(f => ({ ...f, min_value: e.target.value }))} placeholder="0.00" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Prêmio (R$)</Label>
                  <Input type="number" value={form.prize_value} onChange={e => setForm(f => ({ ...f, prize_value: e.target.value }))} placeholder="0.00" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Desc. prêmio</Label>
                  <Input value={form.prize_description} onChange={e => setForm(f => ({ ...f, prize_description: e.target.value }))} placeholder="Opcional" className="h-9" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalhes da campanha..." rows={2} className="resize-none" />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Data início *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn('w-full justify-start gap-1 h-9 text-xs', !form.start_date && 'text-muted-foreground')}>
                        <CalendarIcon className="w-3.5 h-3.5" />
                        {form.start_date ? format(form.start_date, 'dd/MM/yy') : 'Selecionar'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={form.start_date} onSelect={d => setForm(f => ({ ...f, start_date: d }))} className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hora início *</Label>
                  <Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data fim *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn('w-full justify-start gap-1 h-9 text-xs', !form.end_date && 'text-muted-foreground')}>
                        <CalendarIcon className="w-3.5 h-3.5" />
                        {form.end_date ? format(form.end_date, 'dd/MM/yy') : 'Selecionar'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={form.end_date} onSelect={d => setForm(f => ({ ...f, end_date: d }))} disabled={d => form.start_date ? d < form.start_date : false} className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hora fim *</Label>
                  <Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className="h-9" />
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
                  <TableHead className="w-[140px]">Ações</TableHead>
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
                        ) : (<span className="text-xs text-muted-foreground">—</span>)}
                      </TableCell>
                      <TableCell className="text-sm">R$ {Number(c.min_value).toFixed(2)}</TableCell>
                      <TableCell className="text-sm">R$ {Number(c.prize_value).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(c.start_date), 'dd/MM/yy HH:mm')} → {format(new Date(c.end_date), 'dd/MM/yy HH:mm')}
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
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver detalhes" onClick={() => setSelectedCampaign(c)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-400" title="Processar" onClick={() => processCampaign(c)} disabled={processing || !c.segment_id}>
                            <Play className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
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
