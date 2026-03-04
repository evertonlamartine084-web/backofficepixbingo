import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Package, Users, CheckCircle, XCircle, AlertTriangle, Clock, Zap, Shield,
  Loader2, RefreshCw, Activity, ArrowDownToLine, ArrowUpFromLine,
  Dices, Trophy, TrendingUp, BarChart3, Wallet, DollarSign, CalendarIcon
} from 'lucide-react';
import { StatsCard } from '@/components/StatsCard';
import { FinancialKPICard } from '@/components/FinancialKPICard';
import { BatchStatusBadge } from '@/components/StatusBadge';
import { Link } from 'react-router-dom';
import { useDashboardStats, useBatches } from '@/hooks/use-supabase-data';
import { ApiCredentialsBar } from '@/components/ApiCredentialsBar';
import { useProxy } from '@/hooks/use-proxy';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { BatchStatus } from '@/types';

type PeriodFilter = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

const fmtDate = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

function getDateRange(period: PeriodFilter, customStart?: Date, customEnd?: Date) {
  const now = new Date();
  switch (period) {
    case 'today':
      return { start: fmtDate(now), end: fmtDate(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: fmtDate(y), end: fmtDate(y) };
    }
    case '7d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { start: fmtDate(d), end: fmtDate(now) };
    }
    case '30d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { start: fmtDate(d), end: fmtDate(now) };
    }
    case 'custom':
      return { start: fmtDate(customStart || now), end: fmtDate(customEnd || now) };
  }
}

function parseCurrency(val: any): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    return parseFloat(val.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
  }
  return 0;
}

function formatBRL(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface ProductTotals {
  apostas: number;
  premios: number;
  turnover: number;
  ggr: number;
}

interface FinancialData {
  depositos: number;
  saques: number;
  keno: ProductTotals;
  cassino: ProductTotals;
  total: ProductTotals;
  isFallback?: boolean;
}

export default function Dashboard() {
  const { data: s, isLoading: loadingStats } = useDashboardStats();
  const { data: batches, isLoading: loadingBatches } = useBatches();
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [customStart, setCustomStart] = useState<Date>(new Date());
  const [customEnd, setCustomEnd] = useState<Date>(new Date());
  const [financials, setFinancials] = useState<FinancialData | null>(null);
  const [loadingFinancials, setLoadingFinancials] = useState(false);
  const { callProxy } = useProxy();

  const fetchFinancials = useCallback(async () => {
    if (!creds.username) return;
    setLoadingFinancials(true);
    try {
      const range = getDateRange(period, customStart, customEnd);
      const res = await callProxy('financeiro', creds, {
        busca_data_inicio: range.start,
        busca_data_fim: range.end,
        length: 100,
      });

      // Handle API error responses
      const apiErrorCode = Number(res?.data?.code ?? res?.data?._status ?? 0);
      const apiErrorMessage = res?.data?.Msg || res?.data?._raw;
      if (apiErrorCode >= 400 || apiErrorMessage) {
        const message = String(apiErrorMessage || `Erro HTTP ${apiErrorCode || 'desconhecido'}`);
        console.error('API financeiro error:', message);
        toast.error('Erro na API financeira: ' + message);
        setFinancials(null);
        return;
      }

      const d = res?.data;
      const fonte = d?.fonte || '';

      // New separated format from proxy
      if (d?.keno || d?.cassino || d?.total) {
        const zeroProduct: ProductTotals = { apostas: 0, premios: 0, turnover: 0, ggr: 0 };
        setFinancials({
          depositos: Number(d.depositos || 0),
          saques: Number(d.saques || 0),
          keno: d.keno || zeroProduct,
          cassino: d.cassino || zeroProduct,
          total: d.total || zeroProduct,
          isFallback: fonte.includes('fallback'),
        });
      } else {
        // Legacy aaData format
        const rows = d?.aaData || d?.data || [];
        let depositos = 0, saques = 0, apostas = 0, premios = 0;
        if (Array.isArray(rows)) {
          for (const row of rows) {
            depositos += parseCurrency(row.depositos);
            saques += parseCurrency(row.saques);
            apostas += parseCurrency(row.apostas || row.bets || 0);
            premios += parseCurrency(row.premios || row.prizes || 0);
          }
        }
        const totalP: ProductTotals = { apostas, premios, turnover: apostas, ggr: apostas - premios };
        setFinancials({
          depositos, saques,
          keno: { apostas: 0, premios: 0, turnover: 0, ggr: 0 },
          cassino: { apostas: 0, premios: 0, turnover: 0, ggr: 0 },
          total: totalP,
          isFallback: fonte.includes('fallback'),
        });
      }

      toast.success('Financeiro atualizado!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingFinancials(false);
    }
  }, [creds, period, callProxy]);

  // Auto-fetch when creds or period change
  useEffect(() => {
    if (creds.username) fetchFinancials();
  }, [period, customStart, customEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadingStats || loadingBatches) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const stats = s || { total_batches: 0, total_items: 0, pendente: 0, processando: 0, sem_bonus: 0, bonus_1x: 0, bonus_2x_plus: 0, erro: 0 };
  const recentBatches = (batches || []).slice(0, 5);

  const quickFilters: { key: PeriodFilter; label: string }[] = [
    { key: 'today', label: 'Hoje' },
    { key: 'yesterday', label: 'Ontem' },
    { key: '7d', label: '7 dias' },
    { key: '30d', label: '30 dias' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral financeira e de bônus</p>
        </div>
      </div>

      {/* API Connection */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Conexão API</span>
        </div>
        <ApiCredentialsBar onCredentials={(c) => { setCreds(c); }} />
      </div>

      {/* Period Filter + Financial KPIs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Financeiro</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {quickFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setPeriod(f.key)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    period === f.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Custom date pickers */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={period === 'custom' ? 'default' : 'outline'}
                  size="sm"
                  className={cn('gap-1.5 text-xs', period !== 'custom' && 'border-border')}
                  onClick={() => setPeriod('custom')}
                >
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {period === 'custom'
                    ? `${format(customStart, 'dd/MM')} - ${format(customEnd, 'dd/MM')}`
                    : 'Personalizado'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="flex flex-col sm:flex-row">
                  <div className="p-3 border-b sm:border-b-0 sm:border-r border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Data início</p>
                    <Calendar
                      mode="single"
                      selected={customStart}
                      onSelect={(d) => { if (d) { setCustomStart(d); setPeriod('custom'); } }}
                      disabled={(d) => d > new Date()}
                      className={cn("p-0 pointer-events-auto")}
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Data fim</p>
                    <Calendar
                      mode="single"
                      selected={customEnd}
                      onSelect={(d) => { if (d) { setCustomEnd(d); setPeriod('custom'); } }}
                      disabled={(d) => d > new Date() || d < customStart}
                      className={cn("p-0 pointer-events-auto")}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Button
              onClick={fetchFinancials}
              disabled={loadingFinancials || !creds.username}
              variant="outline"
              size="sm"
              className="border-border"
            >
              {loadingFinancials ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {!creds.username ? (
          <div className="glass-card p-8 text-center">
            <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">Conecte-se à API acima para visualizar os dados financeiros</p>
          </div>
        ) : loadingFinancials && !financials ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : financials ? (
          <div className="space-y-3">
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <FinancialKPICard title="Depósitos" value={formatBRL(financials.depositos)} icon={ArrowDownToLine} variant="green" />
              <FinancialKPICard title="Saques" value={formatBRL(financials.saques)} icon={ArrowUpFromLine} variant="red" />
            </div>

            <Tabs defaultValue="total" className="w-full">
              <TabsList>
                <TabsTrigger value="total">Total</TabsTrigger>
                <TabsTrigger value="keno">Keno</TabsTrigger>
                <TabsTrigger value="cassino">Cassino</TabsTrigger>
              </TabsList>
              {(['total', 'keno', 'cassino'] as const).map((tab) => {
                const data = financials[tab];
                return (
                  <TabsContent key={tab} value={tab}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <FinancialKPICard title="Apostas" value={formatBRL(data.apostas)} icon={Dices} variant="blue" />
                      <FinancialKPICard title="Prêmios" value={formatBRL(data.premios)} icon={Trophy} variant="amber" />
                      <FinancialKPICard title="Turnover" value={formatBRL(data.turnover)} icon={TrendingUp} variant="purple" />
                      <FinancialKPICard title="GGR" value={formatBRL(data.ggr)} icon={BarChart3} variant={data.ggr >= 0 ? 'green' : 'red'} trend={data.ggr >= 0 ? 'up' : 'down'} trendValue={data.turnover > 0 ? `${((data.ggr / data.turnover) * 100).toFixed(1)}% margem` : undefined} />
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
        ) : null}
      </div>

      {/* Bonus processing stats */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-foreground">Processamento de Bônus</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard title="Total Itens" value={stats.total_items} subtitle={`${stats.total_batches} lotes`} icon={Users} variant="primary" />
          <StatsCard title="Sem Bônus" value={stats.sem_bonus} icon={XCircle} variant="default" />
          <StatsCard title="Bônus 1x" value={stats.bonus_1x} icon={CheckCircle} variant="success" />
          <StatsCard title="Bônus 2x+" value={stats.bonus_2x_plus} subtitle="Duplicados!" icon={AlertTriangle} variant="danger" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard title="Pendentes" value={stats.pendente} icon={Clock} />
          <StatsCard title="Erros" value={stats.erro} icon={XCircle} variant="warning" />
          <StatsCard title="Processando" value={stats.processando} icon={Zap} variant="primary" />
          <StatsCard title="Alertas 2x+" value={stats.bonus_2x_plus} subtitle="Duplicados" icon={Shield} variant="danger" />
        </div>
      </div>

      {/* Recent batches */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Lotes Recentes</h2>
          <Link to="/batches" className="text-sm text-primary hover:underline">Ver todos →</Link>
        </div>
        {recentBatches.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhum lote cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Progresso</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">2x+</th>
                </tr>
              </thead>
              <tbody>
                {recentBatches.map((b) => (
                  <tr key={b.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="py-3">
                      <Link to={`/batches/${b.id}`} className="text-foreground hover:text-primary font-medium">{b.name}</Link>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full gradient-primary rounded-full transition-all" style={{ width: `${b.total_items > 0 ? (b.processed / b.total_items) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{b.processed}/{b.total_items}</span>
                      </div>
                    </td>
                    <td className="py-3"><BatchStatusBadge status={b.status as BatchStatus} /></td>
                    <td className="py-3">
                      {(b.stats as any).bonus_2x_plus > 0 && (
                        <span className="status-badge bg-destructive/20 text-destructive font-semibold">{(b.stats as any).bonus_2x_plus}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
