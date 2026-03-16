import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, Play, Loader2, Download, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  CashbackRule, CashbackExecution, GAME_TYPE_LABELS, PERIOD_LABELS, ITEM_STATUS_COLORS,
  useCashbackExecutions, useCashbackItems, useCashbackProcessing,
} from '@/hooks/use-cashback';

interface Props {
  rule: CashbackRule;
  onBack: () => void;
}

export function CashbackDetail({ rule, onBack }: Props) {
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null);
  const { executions, refetchExecutions } = useCashbackExecutions(rule.id);
  const { items } = useCashbackItems(selectedExecution || undefined);
  const { processing, processCashback } = useCashbackProcessing();

  const handleProcess = async () => {
    await processCashback(rule);
    refetchExecutions();
  };

  const exportCSV = () => {
    if (items.length === 0) return;
    const headers = ['CPF', 'UUID', 'Total Apostas', 'Total Ganhos', 'Perda Líquida', 'Cashback', 'Status', 'Resultado'];
    const rows = items.map(p => [
      p.cpf_masked,
      p.uuid || '',
      Number(p.total_bets).toFixed(2),
      Number(p.total_wins).toFixed(2),
      Number(p.net_loss).toFixed(2),
      Number(p.cashback_value).toFixed(2),
      p.status,
      p.credit_result || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashback-${rule.name.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedExecData = executions.find(e => e.id === selectedExecution);

  // Stats for selected execution items
  const itemStats = {
    total: items.length,
    semPerda: items.filter(i => i.status === 'SEM_PERDA').length,
    creditado: items.filter(i => i.status === 'CREDITADO').length,
    erro: items.filter(i => i.status === 'ERRO').length,
    totalCashback: items.reduce((sum, i) => sum + (i.status === 'CREDITADO' ? Number(i.cashback_value) : 0), 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{rule.name}</h1>
          <p className="text-sm text-muted-foreground">
            {GAME_TYPE_LABELS[rule.game_type]} • {PERIOD_LABELS[rule.period]} • {Number(rule.percentage).toFixed(1)}%
            {rule.segment_name && ` • ${rule.segment_name}`}
          </p>
        </div>
        <Button onClick={handleProcess} disabled={processing || !rule.segment_id} className="gap-2" size="sm">
          {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {processing ? 'Processando...' : 'Processar Cashback'}
        </Button>
      </div>

      {/* Rule summary */}
      <Card className="border-border">
        <CardContent className="p-4 grid grid-cols-5 gap-4 text-sm">
          <div><span className="text-muted-foreground text-xs block">Cashback</span>{Number(rule.percentage).toFixed(1)}%</div>
          <div><span className="text-muted-foreground text-xs block">Perda Mínima</span>R$ {Number(rule.min_loss).toFixed(2)}</div>
          <div><span className="text-muted-foreground text-xs block">Max Cashback</span>{rule.max_cashback ? `R$ ${Number(rule.max_cashback).toFixed(2)}` : 'Sem limite'}</div>
          <div><span className="text-muted-foreground text-xs block">Carteira</span><Badge variant="outline" className="text-xs">{rule.wallet_type}</Badge></div>
          <div><span className="text-muted-foreground text-xs block">Tipo de Jogo</span><Badge variant="outline" className="text-xs">{GAME_TYPE_LABELS[rule.game_type]}</Badge></div>
        </CardContent>
      </Card>

      {/* Executions list */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Histórico de Execuções</h2>
        {executions.length === 0 ? (
          <Card className="border-border">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma execução ainda. Clique em "Processar Cashback" para iniciar.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {executions.map(exec => (
              <Card
                key={exec.id}
                className={cn(
                  'border-border cursor-pointer transition-colors hover:border-primary/30',
                  selectedExecution === exec.id && 'border-primary/50 bg-primary/5'
                )}
                onClick={() => setSelectedExecution(selectedExecution === exec.id ? null : exec.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {selectedExecution === exec.id ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {format(new Date(exec.period_start), 'dd/MM/yyyy')} → {format(new Date(exec.period_end), 'dd/MM/yyyy')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Executado em {format(new Date(exec.created_at), 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Jogadores</p>
                        <p className="font-medium">{exec.total_players}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Elegíveis</p>
                        <p className="font-medium text-amber-400">{exec.eligible_players}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Creditado</p>
                        <p className="font-medium text-emerald-400">R$ {Number(exec.total_credited).toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Erros</p>
                        <p className="font-medium text-red-400">{exec.errors}</p>
                      </div>
                      <Badge className={cn('text-[10px]', exec.status === 'CONCLUIDO' ? 'bg-emerald-500/15 text-emerald-400' : exec.status === 'ERRO' ? 'bg-red-500/15 text-red-400' : 'bg-blue-500/15 text-blue-400')}>
                        {exec.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Items table for selected execution */}
      {selectedExecution && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Detalhes da Execução</h2>
            {items.length > 0 && (
              <Button onClick={exportCSV} variant="outline" size="sm" className="gap-2">
                <Download className="w-4 h-4" /> CSV
              </Button>
            )}
          </div>

          {/* Execution stats */}
          <div className="grid grid-cols-5 gap-3 mb-4">
            {[
              { label: 'Total', value: itemStats.total, color: 'text-foreground' },
              { label: 'Sem Perda', value: itemStats.semPerda, color: 'text-amber-400' },
              { label: 'Creditados', value: itemStats.creditado, color: 'text-emerald-400' },
              { label: 'Erros', value: itemStats.erro, color: 'text-red-400' },
              { label: 'Total Creditado', value: `R$ ${itemStats.totalCashback.toFixed(2)}`, color: 'text-emerald-400' },
            ].map(s => (
              <Card key={s.label} className="border-border">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground uppercase">{s.label}</p>
                  <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {itemStats.total > 0 && (
            <div className="space-y-1 mb-4">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progresso</span>
                <span>{Math.round(((itemStats.total - items.filter(i => i.status === 'PENDENTE' || i.status === 'PROCESSANDO').length) / itemStats.total) * 100)}%</span>
              </div>
              <Progress value={((itemStats.total - items.filter(i => i.status === 'PENDENTE' || i.status === 'PROCESSANDO').length) / itemStats.total) * 100} className="h-2" />
            </div>
          )}

          <Card className="border-border">
            <CardContent className="p-0">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <p className="text-sm">Nenhum item nesta execução.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CPF</TableHead>
                      <TableHead>UUID</TableHead>
                      <TableHead>Total Apostas</TableHead>
                      <TableHead>Total Ganhos</TableHead>
                      <TableHead>Perda Líquida</TableHead>
                      <TableHead>Cashback</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Resultado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.cpf_masked}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{item.uuid ? item.uuid.slice(0, 12) + '...' : '—'}</TableCell>
                        <TableCell className="text-sm">R$ {Number(item.total_bets).toFixed(2)}</TableCell>
                        <TableCell className="text-sm">R$ {Number(item.total_wins).toFixed(2)}</TableCell>
                        <TableCell className="text-sm font-medium">{Number(item.net_loss) > 0 ? `R$ ${Number(item.net_loss).toFixed(2)}` : '—'}</TableCell>
                        <TableCell className="text-sm font-medium text-emerald-400">
                          {Number(item.cashback_value) > 0 ? `R$ ${Number(item.cashback_value).toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-[10px]', ITEM_STATUS_COLORS[item.status] || 'bg-muted')}>
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {item.credit_result || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
