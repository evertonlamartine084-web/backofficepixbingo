import { useState } from 'react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, RefreshCw, Activity, ArrowDownToLine, ArrowUpFromLine,
  Dices, Trophy, TrendingUp, BarChart3, Wallet, DollarSign, CalendarIcon,
  Users, CircleDollarSign,
} from 'lucide-react';
import { DashboardInfoCard } from '@/components/DashboardInfoCard';
import { ApiCredentialsBar } from '@/components/ApiCredentialsBar';
import { useProxy } from '@/hooks/use-proxy';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatBRL, formatDateAPI } from '@/lib/formatters';

type PeriodFilter = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

function getDateRange(period: PeriodFilter, customStart?: Date, customEnd?: Date) {
  const now = new Date();
  switch (period) {
    case 'today':
      return { start: formatDateAPI(now), end: formatDateAPI(now) };
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { start: formatDateAPI(y), end: formatDateAPI(y) };
    }
    case '7d': {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      return { start: formatDateAPI(d), end: formatDateAPI(now) };
    }
    case '30d': {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      return { start: formatDateAPI(d), end: formatDateAPI(now) };
    }
    case 'custom':
      return { start: formatDateAPI(customStart || now), end: formatDateAPI(customEnd || now) };
  }
}

interface ProductTotals {
  apostas: number;
  premios: number;
  turnover: number;
  ggr: number;
  bonusTurnover?: number;
  bonusGgr?: number;
  margin?: number;
}

interface FinancialData {
  depositos: number;
  saques: number;
  qtdDeposito?: number;
  qtdSaque?: number;
  qtdDepositantes?: number;
  qtdSacantes?: number;
  totalTransactions?: number;
  keno: ProductTotals;
  cassino: ProductTotals;
  total: ProductTotals;
  ftd?: { valor: number; qtd: number } | null;
  newUsers?: number;
  walletBonus?: { valor: number; bonusXDeposito: number } | null;
  walletBalance?: { liquido: number; rtp: number; margem: number } | null;
  adjustments?: { cashIn: number; cashInQtd: number; cashOut: number; cashOutQtd: number } | null;
  isFallback?: boolean;
}

export default function Dashboard() {
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [customStart, setCustomStart] = useState<Date>(new Date());
  const [customEnd, setCustomEnd] = useState<Date>(new Date());
  const { callProxy } = useProxy();


  const range = getDateRange(period, customStart, customEnd);
  const { data: financials, isLoading: loadingFinancials, refetch: refetchFinancials } = useQuery({
    queryKey: ['financials', creds.username, range.start, range.end],
    enabled: !!creds.username,
    queryFn: async () => {
      const res = await callProxy('financeiro', creds, {
        busca_data_inicio: range.start,
        busca_data_fim: range.end,
        length: 100,
      });

      const apiErrorCode = Number(res?.data?.code ?? res?.data?._status ?? 0);
      const apiErrorMessage = res?.data?.Msg || res?.data?._raw;
      if (apiErrorCode >= 400 || apiErrorMessage) {
        throw new Error(String(apiErrorMessage || `Erro HTTP ${apiErrorCode || 'desconhecido'}`));
      }

      const d = res?.data;
      const fonte = d?.fonte || '';
      const zeroProduct: ProductTotals = { apostas: 0, premios: 0, turnover: 0, ggr: 0, bonusTurnover: 0, bonusGgr: 0, margin: 0 };

      return {
        depositos: Number(d.depositos || 0),
        saques: Number(d.saques || 0),
        qtdDeposito: Number(d.qtdDeposito || 0),
        qtdSaque: Number(d.qtdSaque || 0),
        qtdDepositantes: Number(d.qtdDepositantes || 0),
        qtdSacantes: Number(d.qtdSacantes || 0),
        keno: d.keno || zeroProduct,
        cassino: d.cassino || zeroProduct,
        total: d.total || zeroProduct,
        ftd: d.ftd || null,
        newUsers: Number(d.newUsers || 0),
        walletBonus: d.walletBonus || null,
        walletBalance: d.walletBalance || null,
        adjustments: d.adjustments || null,
        totalTransactions: Number(d.totalTransactions || 0),
        isFallback: fonte.includes('fallback'),
      } as FinancialData;
    },
    meta: { onError: (err: Error) => toast.error(err.message) },
  });

  const quickFilters: { key: PeriodFilter; label: string }[] = [
    { key: 'today', label: 'Hoje' },
    { key: 'yesterday', label: 'Ontem' },
    { key: '7d', label: '7 dias' },
    { key: '30d', label: '30 dias' },
  ];

  const f = financials;
  const netDeposits = f ? f.depositos - f.saques : 0;
  const netPct = f && f.depositos > 0 ? ((netDeposits / f.depositos) * 100).toFixed(2) : '0.00';
  const avgDeposit = f && f.qtdDeposito ? f.depositos / f.qtdDeposito : 0;
  const avgSaque = f && f.qtdSaque ? f.saques / f.qtdSaque : 0;
  const avgFtd = f?.ftd && f.ftd.qtd > 0 ? f.ftd.valor / f.ftd.qtd : 0;
  
  const nd = 'N/D';

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
        <ApiCredentialsBar onCredentials={(c) => setCreds(c)} />
      </div>

      {/* Period Filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Financeiro</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {quickFilters.map((qf) => (
              <button
                key={qf.key}
                onClick={() => setPeriod(qf.key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === qf.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {qf.label}
              </button>
            ))}
          </div>
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
                  <DateTimePicker date={customStart} onSelect={(d) => { if (d) { setCustomStart(d); setPeriod('custom'); } }} disabled={(d) => d > new Date()} />
                </div>
                <div className="p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Data fim</p>
                  <DateTimePicker date={customEnd} onSelect={(d) => { if (d) { setCustomEnd(d); setPeriod('custom'); } }} disabled={(d) => d > new Date() || d < customStart} />
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button onClick={() => refetchFinancials()} disabled={loadingFinancials || !creds.username} variant="outline" size="sm" className="border-border">
            {loadingFinancials ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Financial Dashboard */}
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
        <div className="space-y-4">
          {/* Row 1: Deposits | Withdrawals | NET Deposits */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DashboardInfoCard
              title="Deposits"
              mainValue={formatBRL(f!.depositos)}
              mainLabel="Deposits"
              icon={ArrowDownToLine}
              iconColor="text-success"
              stats={[
                { label: 'Transações', value: f!.qtdDeposito || 0 },
                { label: 'AVG Deposit', value: formatBRL(avgDeposit) },
              ]}
            />
            <DashboardInfoCard
              title="Withdrawals"
              mainValue={formatBRL(f!.saques)}
              mainLabel="Withdrawals"
              icon={ArrowUpFromLine}
              iconColor="text-destructive"
              stats={[
                { label: 'Transações', value: f!.qtdSaque || 0 },
                { label: 'AVG Withdrawals', value: formatBRL(avgSaque) },
              ]}
            />
            <DashboardInfoCard
              title="NET Deposits"
              mainValue={formatBRL(netDeposits)}
              mainLabel="NET Deposits"
              icon={CircleDollarSign}
              iconColor="text-primary"
              stats={[
                { label: 'Percentage', value: `${netPct}%` },
              ]}
            />
          </div>

          {/* Row 2: Keno | Casino | Total */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DashboardInfoCard
              title="Keno"
              mainValue={formatBRL(f!.keno.ggr)}
              mainLabel="GGR"
              icon={Dices}
              iconColor="text-primary"
              secondaryValue={formatBRL(f!.keno.bonusGgr || 0)}
              secondaryLabel="Bonus GGR"
              stats={[
                { label: 'Turnover', value: formatBRL(f!.keno.turnover) },
                { label: 'Bonus Turnover', value: formatBRL(f!.keno.bonusTurnover || 0) },
                { label: 'Margin', value: `${(f!.keno.margin || 0).toFixed(2)}%` },
              ]}
            />
            <DashboardInfoCard
              title="Casino"
              mainValue={formatBRL(f!.cassino.ggr)}
              mainLabel="GGR"
              icon={Trophy}
              iconColor="text-warning"
              secondaryValue={formatBRL(f!.cassino.bonusGgr || 0)}
              secondaryLabel="Bonus GGR"
              stats={[
                { label: 'Turnover', value: formatBRL(f!.cassino.turnover) },
                { label: 'Bonus Turnover', value: formatBRL(f!.cassino.bonusTurnover || 0) },
                { label: 'Margin', value: `${(f!.cassino.margin || 0).toFixed(2)}%` },
              ]}
            />
            <DashboardInfoCard
              title="Total"
              mainValue={formatBRL(f!.total.ggr)}
              mainLabel="Total GGR"
              icon={BarChart3}
              iconColor="text-primary"
              secondaryValue={formatBRL(f!.total.bonusGgr || 0)}
              secondaryLabel="Bonus GGR"
              stats={[
                { label: 'Total Turnover', value: formatBRL(f!.total.turnover) },
                { label: 'Bonus Turnover', value: formatBRL(f!.total.bonusTurnover || 0) },
                { label: 'Total Margin', value: `${(f!.total.margin || 0).toFixed(2)}%` },
              ]}
            />
          </div>

          {/* Row 3: FTD | New Users */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DashboardInfoCard
              title="FTD"
              mainValue={f!.ftd ? formatBRL(f!.ftd.valor) : nd}
              mainLabel="FTD Value"
              icon={TrendingUp}
              iconColor="text-primary"
              stats={f!.ftd ? [
                { label: 'Transactions', value: f!.ftd.qtd },
                { label: 'AVG Value', value: formatBRL(avgFtd) },
              ] : [{ label: '', value: 'Dados indisponíveis' }]}
            />
            <DashboardInfoCard
              title="Novos Usuários"
              mainValue={f!.newUsers ? String(f!.newUsers) : '0'}
              mainLabel="Registros no período"
              icon={Users}
              iconColor="text-primary"
              stats={[]}
            />
          </div>

        </div>
      ) : null}
    </div>
  );
}
