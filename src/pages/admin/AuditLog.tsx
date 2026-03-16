import { useState } from 'react';
import { format } from 'date-fns';
import { ScrollText, ChevronLeft, ChevronRight, Search, Filter, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuditLog, AuditEntry } from '@/hooks/use-audit';

const ACTION_COLORS: Record<string, string> = {
  CRIAR: 'bg-emerald-500/15 text-emerald-400',
  EDITAR: 'bg-blue-500/15 text-blue-400',
  EXCLUIR: 'bg-red-500/15 text-red-400',
  STATUS: 'bg-amber-500/15 text-amber-400',
  PROCESSAR: 'bg-purple-500/15 text-purple-400',
  CREDITAR: 'bg-emerald-500/15 text-emerald-400',
  CALCULAR: 'bg-blue-500/15 text-blue-400',
  APROVAR: 'bg-emerald-500/15 text-emerald-400',
  LOGIN: 'bg-blue-500/15 text-blue-400',
  LOGOUT: 'bg-muted text-muted-foreground',
  SENHA: 'bg-amber-500/15 text-amber-400',
};

const RESOURCE_ICONS: Record<string, string> = {
  campanha: 'Campanha',
  cashback: 'Cashback',
  segmento: 'Segmento',
  popup: 'Popup',
  popup_asset: 'Asset HTML',
  usuario: 'Usuário',
  batch: 'Lote',
  auth: 'Autenticação',
};

const PAGE_SIZE = 25;

export default function AuditLog() {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [detailEntry, setDetailEntry] = useState<AuditEntry | null>(null);

  const { entries, totalCount, isLoading } = useAuditLog({
    action: actionFilter || undefined,
    resource_type: resourceFilter || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getActionColor = (action: string) => {
    const key = Object.keys(ACTION_COLORS).find(k => action.toUpperCase().includes(k));
    return key ? ACTION_COLORS[key] : 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Log de Auditoria</h1>
        <p className="text-sm text-muted-foreground mt-1">Histórico completo de todas as ações realizadas no sistema</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={actionFilter} onValueChange={v => { setActionFilter(v === '__all__' ? '' : v); setPage(0); }}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Todas as ações" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as ações</SelectItem>
              <SelectItem value="CRIAR">Criar</SelectItem>
              <SelectItem value="EDITAR">Editar</SelectItem>
              <SelectItem value="EXCLUIR">Excluir</SelectItem>
              <SelectItem value="STATUS">Mudança de Status</SelectItem>
              <SelectItem value="PROCESSAR">Processar</SelectItem>
              <SelectItem value="CALCULAR">Calcular</SelectItem>
              <SelectItem value="APROVAR">Aprovar</SelectItem>
              <SelectItem value="CREDITAR">Creditar</SelectItem>
              <SelectItem value="LOGIN">Login</SelectItem>
              <SelectItem value="LOGOUT">Logout</SelectItem>
              <SelectItem value="SENHA">Senha</SelectItem>
            </SelectContent>
          </Select>
          <Select value={resourceFilter} onValueChange={v => { setResourceFilter(v === '__all__' ? '' : v); setPage(0); }}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Todos os recursos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os recursos</SelectItem>
              <SelectItem value="campanha">Campanhas</SelectItem>
              <SelectItem value="cashback">Cashback</SelectItem>
              <SelectItem value="segmento">Segmentos</SelectItem>
              <SelectItem value="popup">Popups</SelectItem>
              <SelectItem value="popup_asset">Assets HTML</SelectItem>
              <SelectItem value="usuario">Usuários</SelectItem>
              <SelectItem value="batch">Lotes</SelectItem>
              <SelectItem value="auth">Autenticação</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground">
          {totalCount} registros
        </div>
      </div>

      {/* Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">Carregando...</div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <ScrollText className="w-10 h-10 opacity-40" />
              <p>Nenhum registro de auditoria encontrado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Data/Hora</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Recurso</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Resumo</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(entry => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {format(new Date(entry.created_at), 'dd/MM/yy HH:mm:ss')}
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.user_email ? entry.user_email.split('@')[0] : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn('text-[10px]', getActionColor(entry.action))}>
                        {entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{RESOURCE_ICONS[entry.resource_type] || entry.resource_type}</span>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {entry.resource_name || entry.resource_id?.slice(0, 8) || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">
                      {entry.details ? summarizeDetails(entry) : '—'}
                    </TableCell>
                    <TableCell>
                      {entry.details && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailEntry(entry)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Página {page + 1} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailEntry} onOpenChange={() => setDetailEntry(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da Auditoria</DialogTitle>
          </DialogHeader>
          {detailEntry && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-muted-foreground block">Data/Hora</span>
                  {format(new Date(detailEntry.created_at), 'dd/MM/yyyy HH:mm:ss')}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Usuário</span>
                  {detailEntry.user_email || '—'}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Ação</span>
                  <Badge className={cn('text-[10px]', getActionColor(detailEntry.action))}>{detailEntry.action}</Badge>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Recurso</span>
                  {RESOURCE_ICONS[detailEntry.resource_type] || detailEntry.resource_type}
                </div>
              </div>
              {detailEntry.resource_name && (
                <div>
                  <span className="text-xs text-muted-foreground block">Nome do Recurso</span>
                  {detailEntry.resource_name}
                </div>
              )}
              {detailEntry.resource_id && (
                <div>
                  <span className="text-xs text-muted-foreground block">ID do Recurso</span>
                  <span className="font-mono text-xs">{detailEntry.resource_id}</span>
                </div>
              )}
              {detailEntry.details && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Detalhes</span>
                  <pre className="bg-secondary/50 rounded-md p-3 text-xs font-mono whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto">
                    {JSON.stringify(detailEntry.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function summarizeDetails(entry: AuditEntry): string {
  const d = entry.details;
  if (!d) return '';
  if (d.status) return `Status: ${d.status}`;
  if (d.from && d.to) return `${d.from} → ${d.to}`;
  if (d.total_players) return `${d.total_players} jogadores`;
  if (d.percentage) return `${d.percentage}%`;
  if (d.value) return `R$ ${Number(d.value).toFixed(2)}`;
  if (d.role) return `Role: ${d.role}`;
  if (d.email) return d.email;
  const keys = Object.keys(d);
  if (keys.length <= 3) return keys.map(k => `${k}: ${d[k]}`).join(', ');
  return `${keys.length} campos`;
}
