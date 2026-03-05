import { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Search, Loader2, RefreshCw, ArrowDownToLine, ArrowUpFromLine,
  ChevronLeft, ChevronRight, CalendarIcon, Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ApiCredentialsBar } from '@/components/ApiCredentialsBar';
import { useProxy } from '@/hooks/use-proxy';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;


const tipoLabels: Record<string, string> = {
  DEPOSITO: 'Depósito',
  SAQUE: 'Saque',
  BONUS: 'Bônus',
  CREDITO: 'Crédito',
  DEBITO: 'Débito',
};

const tipoStyles: Record<string, string> = {
  DEPOSITO: 'bg-success/15 text-success',
  SAQUE: 'bg-destructive/15 text-destructive',
  BONUS: 'bg-primary/15 text-primary',
  CREDITO: 'bg-success/15 text-success',
  DEBITO: 'bg-destructive/15 text-destructive',
};

function parseCurrency(val: any): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    // If it looks like standard decimal (e.g. "10.00", "130.00"), parse directly
    if (/^\d+\.\d{1,2}$/.test(val.trim())) return parseFloat(val);
    // Otherwise treat as BRL format (e.g. "1.000,50")
    return parseFloat(val.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
  }
  return 0;
}

function formatBRL(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(val: string): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return format(d, 'dd/MM/yyyy HH:mm');
  } catch {
    return val;
  }
}

function maskCPF(cpf: string): string {
  if (!cpf) return '—';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}.***.***.${clean.slice(9)}`;
  }
  return cpf;
}

const fmtApiDate = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};

export default function Transactions() {
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [searchCpf, setSearchCpf] = useState('');
  const [dateStart, setDateStart] = useState<Date | undefined>(new Date());
  const [dateEnd, setDateEnd] = useState<Date | undefined>(new Date());
  const [txData, setTxData] = useState<any>(null);
  const [apiSummary, setApiSummary] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const { callWithLoading, loading } = useProxy();

  const handleFetch = useCallback(async (pageNum = 0) => {
    if (!creds.username) { toast.error('Conecte-se primeiro'); return; }
    try {
      const extra: Record<string, any> = {
        draw: pageNum + 1,
        start: pageNum * PAGE_SIZE,
        length: PAGE_SIZE,
      };
      if (searchCpf) extra.busca_cpf = searchCpf;
      if (dateStart) extra.busca_data_inicio = fmtApiDate(dateStart);
      if (dateEnd) extra.busca_data_fim = fmtApiDate(dateEnd);

      const res = await callWithLoading('list_transactions', creds, extra);
      const data = res?.data;
      const rows = data?.aaData || data?.data || [];
      setTxData(Array.isArray(rows) ? rows : []);
      setApiSummary(data);
      setTotalRecords(Number(data?.iTotalRecords || data?.recordsTotal || data?.recordsFiltered || rows.length || 0));
      setPage(pageNum);
      toast.success(`${rows.length} transações carregadas`);
    } catch (err: any) {
      toast.error(err.message);
    }
  }, [creds, searchCpf, dateStart, dateEnd, callWithLoading]);

  // Auto-fetch when credentials are set
  useEffect(() => {
    if (creds.username) handleFetch(0);
  }, [creds.username]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const items: any[] = txData || [];

  // Use API-provided totals instead of summing page items
  const summary = {
    entradas: Number(apiSummary?.valorDeposito || 0),
    saidas: Number(apiSummary?.valorSaque || 0),
    countEntradas: Number(apiSummary?.qtdeDeposito || 0),
    countSaidas: Number(apiSummary?.qtdeSaque || 0),
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Transações</h1>
        <p className="text-sm text-muted-foreground mt-1">Histórico global de transferências do site</p>
      </div>

      <ApiCredentialsBar onCredentials={setCreds} />

      {/* Filters */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] items-end gap-3">
          {/* CPF Search */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">CPF</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="000.000.000-00"
                value={searchCpf}
                onChange={e => setSearchCpf(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFetch(0)}
                className="pl-9 bg-secondary border-border h-9 text-sm font-mono"
              />
            </div>
          </div>

          {/* Date Start */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Data início</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('h-9 gap-1.5 border-border bg-secondary text-sm min-w-[150px] justify-start', !dateStart && 'text-muted-foreground')}>
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {dateStart ? format(dateStart, 'dd/MM/yyyy') : 'Selecionar'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateStart} onSelect={setDateStart} disabled={(d) => d > new Date()} className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Date End */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Data fim</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('h-9 gap-1.5 border-border bg-secondary text-sm min-w-[150px] justify-start', !dateEnd && 'text-muted-foreground')}>
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {dateEnd ? format(dateEnd, 'dd/MM/yyyy') : 'Selecionar'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateEnd} onSelect={setDateEnd} disabled={(d) => d > new Date() || (dateStart ? d < dateStart : false)} className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Actions */}
          <div className="flex items-end gap-2">
            <Button onClick={() => handleFetch(0)} disabled={loading || !creds.username} className="gradient-primary border-0 h-9">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Search className="w-4 h-4 mr-1.5" />}
              Buscar
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 border-border"
              onClick={() => { setSearchCpf(''); setDateStart(new Date()); setDateEnd(new Date()); }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {txData !== null && items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card p-4 bg-gradient-to-br from-success/10 to-transparent">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownToLine className="w-4 h-4 text-success" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Entradas</span>
            </div>
            <p className="text-lg font-bold text-success font-mono">{formatBRL(summary.entradas)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{summary.countEntradas} transações</p>
          </div>
          <div className="glass-card p-4 bg-gradient-to-br from-destructive/10 to-transparent">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpFromLine className="w-4 h-4 text-destructive" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Saídas</span>
            </div>
            <p className="text-lg font-bold text-destructive font-mono">{formatBRL(summary.saidas)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{summary.countSaidas} transações</p>
          </div>
          <div className="glass-card p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Líquido</span>
            <p className={cn('text-lg font-bold font-mono mt-1', summary.entradas - summary.saidas >= 0 ? 'text-success' : 'text-destructive')}>
              {formatBRL(summary.entradas - summary.saidas)}
            </p>
          </div>
          <div className="glass-card p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total na página</span>
            <p className="text-lg font-bold text-foreground font-mono mt-1">{items.length}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">de {totalRecords} registros</p>
          </div>
        </div>
      )}

      {/* Table */}
      {txData !== null && (
        <div className="glass-card overflow-hidden">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Nenhuma transação encontrada.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/40">
                      <th className="text-left p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Data</th>
                      <th className="text-left p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo</th>
                      <th className="text-left p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Usuário</th>
                      <th className="text-left p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">CPF</th>
                      <th className="text-right p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Valor</th>
                      <th className="text-center p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any, i: number) => {
                      const tipo = String(item.tipo_transacao || item.tipo || '').toUpperCase();
                      const valor = parseCurrency(item.valor);
                      const isPositive = tipo.includes('DEPOSITO') || tipo.includes('CREDITO') || tipo.includes('CRÉDITO') || tipo.includes('BONUS');

                      return (
                        <tr key={item.id || i} className="border-b border-border/30 hover:bg-secondary/20 transition-colors group">
                          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(item.updated_at || item.created_at)}</td>
                          <td className="p-3">
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', tipoStyles[tipo] || 'bg-secondary text-muted-foreground')}>
                              {isPositive ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                              {tipoLabels[tipo] || tipo || '—'}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-foreground font-medium">{item.name || item.username || '—'}</td>
                          <td className="p-3 text-xs font-mono text-muted-foreground">{maskCPF(item.cpf)}</td>
                          <td className={cn('p-3 text-sm font-bold font-mono text-right whitespace-nowrap', isPositive ? 'text-success' : 'text-destructive')}>
                            {isPositive ? '+' : '-'}{formatBRL(Math.abs(valor))}
                          </td>
                          <td className="p-3 text-center">
                            <span className={cn(
                              'inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider',
                              String(item.status || '').toLowerCase().includes('aprovad') || String(item.status || '').toLowerCase().includes('confirm') || String(item.status || '').toLowerCase() === 'paid'
                                ? 'bg-success/15 text-success'
                                : String(item.status || '').toLowerCase().includes('pend')
                                  ? 'bg-warning/15 text-warning'
                                  : String(item.status || '').toLowerCase().includes('cancel') || String(item.status || '').toLowerCase().includes('recus')
                                    ? 'bg-destructive/15 text-destructive'
                                    : 'bg-secondary text-muted-foreground'
                            )}>
                              {item.status || '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalRecords)} de {totalRecords}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 border-border"
                    disabled={page === 0 || loading}
                    onClick={() => handleFetch(page - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground px-2">
                    {page + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 border-border"
                    disabled={page >= totalPages - 1 || loading}
                    onClick={() => handleFetch(page + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
