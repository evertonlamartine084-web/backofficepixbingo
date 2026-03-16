import { useState } from 'react';
import { format } from 'date-fns';
import { RotateCcw, Trash2, Play, Eye, Plus, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  CashbackRule, CashbackRuleStatus, CashbackGameType, CashbackPeriod,
  GAME_TYPE_LABELS, PERIOD_LABELS, CASHBACK_STATUS_COLORS,
  useCashbackRules, useCashbackProcessing,
} from '@/hooks/use-cashback';
import { CashbackDetail } from '@/components/CashbackDetail';

interface FormData {
  name: string;
  game_type: CashbackGameType;
  period: CashbackPeriod;
  percentage: string;
  min_loss: string;
  max_cashback: string;
  wallet_type: 'REAL' | 'BONUS';
  segment_id: string;
}

const INITIAL_FORM: FormData = {
  name: '', game_type: 'both', period: 'weekly',
  percentage: '', min_loss: '', max_cashback: '',
  wallet_type: 'BONUS', segment_id: '',
};

export default function Cashback() {
  const [selectedRule, setSelectedRule] = useState<CashbackRule | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);

  const { rules, isLoading, segments, createMutation, deleteMutation, updateStatusMutation } = useCashbackRules();
  const { processing, processCashback } = useCashbackProcessing();

  const handleSubmit = () => {
    createMutation.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        setForm(INITIAL_FORM);
      },
    });
  };

  if (selectedRule) {
    return <CashbackDetail rule={selectedRule} onBack={() => setSelectedRule(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cashback</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure regras de cashback baseadas nas perdas dos jogadores</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(INITIAL_FORM); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Nova Regra</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Criar Regra de Cashback</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Cashback Semanal 10%" className="h-9" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de Jogo *</Label>
                  <Select value={form.game_type} onValueChange={v => setForm(f => ({ ...f, game_type: v as CashbackGameType }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">Ambos (Bingo + Cassino)</SelectItem>
                      <SelectItem value="bingo">Somente Bingo</SelectItem>
                      <SelectItem value="cassino">Somente Cassino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Período *</Label>
                  <Select value={form.period} onValueChange={v => setForm(f => ({ ...f, period: v as CashbackPeriod }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diário</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Cashback (%) *</Label>
                  <Input type="number" value={form.percentage} onChange={e => setForm(f => ({ ...f, percentage: e.target.value }))} placeholder="10" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Perda mín. (R$)</Label>
                  <Input type="number" value={form.min_loss} onChange={e => setForm(f => ({ ...f, min_loss: e.target.value }))} placeholder="0.00" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max cashback (R$)</Label>
                  <Input type="number" value={form.max_cashback} onChange={e => setForm(f => ({ ...f, max_cashback: e.target.value }))} placeholder="Sem limite" className="h-9" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Carteira de crédito *</Label>
                  <Select value={form.wallet_type} onValueChange={v => setForm(f => ({ ...f, wallet_type: v as 'REAL' | 'BONUS' }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BONUS">Saldo Bônus</SelectItem>
                      <SelectItem value="REAL">Saldo Real</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Segmento *</Label>
                  <Select value={form.segment_id} onValueChange={v => setForm(f => ({ ...f, segment_id: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {segments.map(s => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Criando...' : 'Criar Regra'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        {(['RASCUNHO', 'ATIVA', 'PAUSADA', 'ENCERRADA'] as CashbackRuleStatus[]).map(status => (
          <Card key={status} className="border-border">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase">{status}</p>
                <p className="text-2xl font-bold">{rules.filter(r => r.status === status).length}</p>
              </div>
              <Badge className={cn('text-xs', CASHBACK_STATUS_COLORS[status])}>{status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">Carregando...</div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <RotateCcw className="w-10 h-10 opacity-40" />
              <p>Nenhuma regra de cashback criada ainda</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Jogo</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Cashback</TableHead>
                  <TableHead>Perda Mín.</TableHead>
                  <TableHead>Max</TableHead>
                  <TableHead>Segmento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[140px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Percent className="w-4 h-4 text-muted-foreground" />
                        <p className="font-medium text-sm">{r.name}</p>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{GAME_TYPE_LABELS[r.game_type]}</Badge></TableCell>
                    <TableCell><span className="text-xs">{PERIOD_LABELS[r.period]}</span></TableCell>
                    <TableCell className="text-sm font-medium">{Number(r.percentage).toFixed(1)}%</TableCell>
                    <TableCell className="text-sm">R$ {Number(r.min_loss).toFixed(2)}</TableCell>
                    <TableCell className="text-sm">{r.max_cashback ? `R$ ${Number(r.max_cashback).toFixed(2)}` : '—'}</TableCell>
                    <TableCell>
                      {r.segment_name ? (
                        <Badge variant="outline" className="text-xs">{r.segment_name}</Badge>
                      ) : (<span className="text-xs text-muted-foreground">—</span>)}
                    </TableCell>
                    <TableCell>
                      <Select value={r.status} onValueChange={v => updateStatusMutation.mutate({ id: r.id, status: v as CashbackRuleStatus })}>
                        <SelectTrigger className="h-7 text-xs w-[120px]">
                          <Badge className={cn('text-[10px]', CASHBACK_STATUS_COLORS[r.status])}>{r.status}</Badge>
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
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver detalhes" onClick={() => setSelectedRule(r)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-400" title="Processar" onClick={() => processCashback(r)} disabled={processing || !r.segment_id}>
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => {
                          if (confirm(`Excluir regra "${r.name}"?`)) deleteMutation.mutate(r.id);
                        }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
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
