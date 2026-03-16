import { useState } from 'react';
import { format } from 'date-fns';
import { Megaphone, Trash2, Dices, Landmark, Play, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  Campaign, CampaignStatus, TYPE_LABELS, STATUS_COLORS,
  useCampaigns, useCampaignProcessing,
} from '@/hooks/use-campaigns';
import { CampaignDetail } from '@/components/CampaignDetail';
import { CampaignForm } from '@/components/CampaignForm';

const TYPE_ICONS: Record<string, typeof Dices> = {
  aposte_e_ganhe: Dices,
  deposite_e_ganhe: Landmark,
  ganhou_no_keno: Dices,
};

export default function Campaigns() {
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const {
    campaigns, isLoading, segments, popupsList, partidas,
    createMutation, deleteMutation, updateStatusMutation,
  } = useCampaigns();
  const { processing, processCampaign, startAutoProcess, stopAutoProcess } = useCampaignProcessing(campaigns);

  // Auto-start processing when status changes to ATIVA
  const handleStatusChange = (id: string, status: CampaignStatus) => {
    updateStatusMutation.mutate({ id, status }, {
      onSuccess: () => {
        if (status === 'ATIVA') {
          const campaign = campaigns.find(c => c.id === id);
          if (campaign) startAutoProcess({ ...campaign, status: 'ATIVA' });
        }
        if (status !== 'ATIVA') stopAutoProcess(id);
      },
    });
  };

  if (selectedCampaign) {
    return (
      <CampaignDetail
        campaign={selectedCampaign}
        campaigns={campaigns}
        onBack={() => setSelectedCampaign(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campanhas</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie campanhas de bonificação para seus jogadores</p>
        </div>
        <CampaignForm
          segments={segments}
          popupsList={popupsList}
          partidas={partidas}
          onSubmit={(form) => createMutation.mutate(form)}
          isPending={createMutation.isPending}
        />
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
                  <TableHead className="w-[80px]">ID</TableHead>
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
                      <TableCell className="font-mono text-xs text-muted-foreground">{c.id.slice(0, 8)}</TableCell>
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
                        <Select value={c.status} onValueChange={v => handleStatusChange(c.id, v as CampaignStatus)}>
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
