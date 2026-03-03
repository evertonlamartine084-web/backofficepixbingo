import type { ItemStatus, BatchStatus } from '@/types';

const itemStatusConfig: Record<ItemStatus, { label: string; className: string }> = {
  PENDENTE: { label: 'Pendente', className: 'bg-muted text-muted-foreground' },
  PROCESSANDO: { label: 'Processando', className: 'bg-primary/20 text-primary animate-pulse-slow' },
  SEM_BONUS: { label: 'Sem Bônus', className: 'bg-secondary text-secondary-foreground' },
  BONUS_1X: { label: 'Bônus 1x', className: 'bg-success/20 text-success' },
  'BONUS_2X+': { label: 'Bônus 2x+', className: 'bg-destructive/20 text-destructive font-semibold' },
  ERRO: { label: 'Erro', className: 'bg-destructive/20 text-destructive' },
  TIMEOUT: { label: 'Timeout', className: 'bg-warning/20 text-warning' },
};

const batchStatusConfig: Record<BatchStatus, { label: string; className: string }> = {
  PENDENTE: { label: 'Pendente', className: 'bg-muted text-muted-foreground' },
  EM_ANDAMENTO: { label: 'Em Andamento', className: 'bg-primary/20 text-primary animate-pulse-slow' },
  PAUSADO: { label: 'Pausado', className: 'bg-warning/20 text-warning' },
  CONCLUIDO: { label: 'Concluído', className: 'bg-success/20 text-success' },
  ERRO: { label: 'Erro', className: 'bg-destructive/20 text-destructive' },
};

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const config = itemStatusConfig[status];
  return <span className={`status-badge ${config.className}`}>{config.label}</span>;
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const config = batchStatusConfig[status];
  return <span className={`status-badge ${config.className}`}>{config.label}</span>;
}
