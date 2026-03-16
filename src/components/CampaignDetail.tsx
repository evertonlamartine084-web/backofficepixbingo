import { format } from 'date-fns';
import { ChevronLeft, Play, Loader2, MousePointer, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Campaign, Participant, TYPE_LABELS, PARTICIPANT_STATUS_COLORS,
  useCampaignParticipants, useCampaignProcessing,
} from '@/hooks/use-campaigns';

interface Props {
  campaign: Campaign;
  campaigns: Campaign[];
  onBack: () => void;
}

export function CampaignDetail({ campaign, campaigns, onBack }: Props) {
  const { participants, refetchParticipants } = useCampaignParticipants(campaign.id);
  const { processing, autoProcessing, startAutoProcess, stopAutoProcess, processCampaign } =
    useCampaignProcessing(campaigns);

  const exportCSV = () => {
    if (participants.length === 0) return;
    const headers = ['CPF', 'UUID', 'Total Transacionado', 'Status', 'Creditado', 'Resultado'];
    const rows = participants.map(p => [
      p.cpf_masked,
      p.uuid || '',
      Number(p.total_value).toFixed(2),
      p.status,
      p.prize_credited ? 'Sim' : 'Não',
      p.credit_result || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campanha-${campaign.name.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            {TYPE_LABELS[campaign.type]} • {campaign.segment_name || 'Sem segmento'}
            {campaign.popup_name && <> • <MousePointer className="w-3 h-3 inline" /> Opt-in: {campaign.popup_name}</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {autoProcessing.has(campaign.id) && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Verificando automaticamente...
            </Badge>
          )}
          {autoProcessing.has(campaign.id) ? (
            <Button
              onClick={() => { stopAutoProcess(campaign.id); }}
              variant="outline" size="sm"
              className="gap-2 text-red-400 border-red-500/30"
            >
              Parar Auto
            </Button>
          ) : (
            <Button
              onClick={() => startAutoProcess(campaign)}
              disabled={processing || !campaign.segment_id}
              className="gap-2" variant="outline" size="sm"
            >
              <Loader2 className="w-4 h-4" /> Iniciar Auto
            </Button>
          )}
          <Button
            onClick={() => processCampaign(campaign, refetchParticipants)}
            disabled={processing || !campaign.segment_id}
            className="gap-2" variant="outline" size="sm"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {processing ? 'Processando...' : 'Processar 1x'}
          </Button>
          {participants.length > 0 && (
            <Button onClick={exportCSV} variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" /> CSV
            </Button>
          )}
        </div>
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
          <div><span className="text-muted-foreground text-xs block">Valor Mínimo</span> R$ {Number(campaign.min_value).toFixed(2)}</div>
          <div><span className="text-muted-foreground text-xs block">Prêmio</span> R$ {Number(campaign.prize_value).toFixed(2)}</div>
          <div><span className="text-muted-foreground text-xs block">{campaign.type === 'ganhou_no_keno' ? 'Cartela' : 'Carteira'}</span>
            <Badge variant="outline" className="text-xs">
              {campaign.type === 'ganhou_no_keno'
                ? (campaign.game_filter ? `R$ ${Number(campaign.game_filter).toFixed(2)}` : 'Todas')
                : campaign.wallet_type}
            </Badge>
          </div>
          <div><span className="text-muted-foreground text-xs block">Início</span> {format(new Date(campaign.start_date), 'dd/MM/yyyy HH:mm')}</div>
          <div><span className="text-muted-foreground text-xs block">Fim</span> {format(new Date(campaign.end_date), 'dd/MM/yyyy HH:mm')}</div>
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
