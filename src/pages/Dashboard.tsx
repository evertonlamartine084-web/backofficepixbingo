import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Loader2, RefreshCw, Activity, ArrowDownToLine, ArrowUpFromLine,
  Dices, Trophy, TrendingUp, BarChart3, Wallet, DollarSign, CalendarIcon,
  Users, UserCheck, LogIn, ShieldCheck, Gift, CreditCard, Landmark,
  ArrowUpDown, CircleDollarSign, Percent, Zap, Clock, XCircle, CheckCircle,
  AlertTriangle, Shield, Package
} from 'lucide-react';
import { DashboardInfoCard } from '@/components/DashboardInfoCard';
import { StatsCard } from '@/components/StatsCard';
import { BatchStatusBadge } from '@/components/StatusBadge';
import { Link } from 'react-router-dom';
import { useDashboardStats, useBatches } from '@/hooks/use-supabase-data';
import { ApiCredentialsBar } from '@/components/ApiCredentialsBar';
import { useProxy } from '@/hooks/use-proxy';
import { Button } from '@/components/ui/button';
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
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { start: fmtDate(y), end: fmtDate(y) };
    }
    case '7d': {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      return { start: fmtDate(d), end: fmtDate(now) };
    }
    case '30d': {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      return { start: fmtDate(d), end: fmtDate(now) };
    }
    case 'custom':
      return { start: fmtDate(customStart || now), end: fmtDate(customEnd || now) };
  }
}

function formatBRL(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

      const apiErrorCode = Number(res?.data?.code ?? res?.data?._status ?? 0);
      const apiErrorMessage = res?.data?.Msg || res?.data?._raw;
      if (apiErrorCode >= 400 || apiErrorMessage) {
        toast.error('Erro na API financeira: ' + String(apiErrorMessage || `Erro HTTP ${apiErrorCode || 'desconhecido'}`));
        setFinancials(null);
        return;
      }

      const d = res?.data;
      const fonte = d?.fonte || '';
      const zeroProduct: ProductTotals = { apostas: 0, premios: 0, turnover: 0, ggr: 0, bonusTurnover: 0, bonusGgr: 0, margin: 0 };

      setFinancials({
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
      });

      toast.success('Financeiro atualizado!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingFinancials(false);
    }
  }, [creds, period, customStart, customEnd, callProxy]);

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
                  <Calendar mode="single" selected={customStart} onSelect={(d) => { if (d) { setCustomStart(d); setPeriod('custom'); } }} disabled={(d) => d > new Date()} className="p-0 pointer-events-auto" />
                </div>
                <div className="p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Data fim</p>
                  <Calendar mode="single" selected={customEnd} onSelect={(d) => { if (d) { setCustomEnd(d); setPeriod('custom'); } }} disabled={(d) => d > new Date() || d < customStart} className="p-0 pointer-events-auto" />
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button onClick={fetchFinancials} disabled={loadingFinancials || !creds.username} variant="outline" size="sm" className="border-border">
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
                { label: 'Depositantes', value: f!.qtdDepositantes || 0 },
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
                { label: 'Sacantes', value: f!.qtdSacantes || 0 },
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

          {/* Row 3: FTD | New Users | Wallet Bonus */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <DashboardInfoCard
              title="Wallet Bonus"
              mainValue={f!.walletBonus ? formatBRL(f!.walletBonus.valor) : nd}
              mainLabel="Total Bônus"
              icon={Gift}
              iconColor="text-primary"
              stats={f!.walletBonus ? [
                { label: 'Bônus x Depósito', value: `${f!.walletBonus.bonusXDeposito.toFixed(2)}%` },
              ] : [{ label: '', value: 'Dados indisponíveis' }]}
            />
          </div>

          {/* Row 4: Wallet Balance | Transações */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DashboardInfoCard
              title="Wallet Balance"
              mainValue={f!.walletBalance ? formatBRL(f!.walletBalance.liquido) : nd}
              mainLabel="Saldo Líquido (Dep - Saq)"
              icon={Landmark}
              iconColor="text-primary"
              stats={f!.walletBalance ? [
                { label: 'RTP', value: `${f!.walletBalance.rtp.toFixed(2)}%` },
                { label: 'Margem', value: `${f!.walletBalance.margem.toFixed(2)}%` },
              ] : [{ label: '', value: 'Dados indisponíveis' }]}
            />
            <DashboardInfoCard
              title="Transações"
              mainValue={String(f!.totalTransactions || 0)}
              mainLabel="Total de Transações"
              icon={ArrowUpDown}
              iconColor="text-primary"
              stats={[
                { label: 'Depósitos', value: f!.qtdDeposito || 0 },
                { label: 'Saques', value: f!.qtdSaque || 0 },
              ]}
            />
          </div>
        </div>
      ) : null}

      {/* Bonus processing stats */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-foreground">Processamento de Bônus</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard title="Total Itens" value={stats.total_items} subtitle={`${stats.total_batches} lotes`} icon={Package} variant="primary" />
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
