import { useState, useEffect, useCallback } from 'react';
import {
  Package, Users, CheckCircle, XCircle, AlertTriangle, Clock, Zap, Shield,
  Loader2, RefreshCw, Activity, ArrowDownToLine, ArrowUpFromLine,
  Dices, Trophy, TrendingUp, BarChart3, Wallet, DollarSign
} from 'lucide-react';
import { StatsCard } from '@/components/StatsCard';
import { FinancialKPICard } from '@/components/FinancialKPICard';
import { BatchStatusBadge } from '@/components/StatusBadge';
import { Link } from 'react-router-dom';
import { useDashboardStats, useBatches } from '@/hooks/use-supabase-data';
import { ApiCredentialsBar } from '@/components/ApiCredentialsBar';
import { useProxy } from '@/hooks/use-proxy';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { BatchStatus } from '@/types';

type PeriodFilter = 'today' | 'yesterday' | '7d' | '30d';

function getDateRange(period: PeriodFilter) {
  const now = new Date();
  // API expects dd/mm/yyyy format
  const fmt = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  switch (period) {
    case 'today':
      return { start: fmt(now), end: fmt(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: fmt(y), end: fmt(y) };
    }
    case '7d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { start: fmt(d), end: fmt(now) };
    }
    case '30d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { start: fmt(d), end: fmt(now) };
    }
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

interface FinancialTotals {
  depositos: number;
  saques: number;
  bonus: number | null;
  ggr: number | null;
  comissao: number | null;
  lucro: number | null;
  apostas: number | null;
  premios: number | null;
  turnover: number | null;
  isFallback?: boolean;
}

export default function Dashboard() {
  const { data: s, isLoading: loadingStats } = useDashboardStats();
  const { data: batches, isLoading: loadingBatches } = useBatches();
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [financials, setFinancials] = useState<FinancialTotals | null>(null);
  const [loadingFinancials, setLoadingFinancials] = useState(false);
  const { callProxy } = useProxy();

  const fetchFinancials = useCallback(async () => {
    if (!creds.username) return;
    setLoadingFinancials(true);
    try {
      const range = getDateRange(period);
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

      const rows = res?.data?.aaData || res?.data?.data || [];
      const isFallback = res?.data?.fonte === 'transferencias_fallback';
      const totals: FinancialTotals = {
        depositos: 0, saques: 0, bonus: isFallback ? null : 0, ggr: isFallback ? null : 0,
        comissao: isFallback ? null : 0, lucro: isFallback ? null : 0,
        apostas: isFallback ? null : 0, premios: isFallback ? null : 0,
        turnover: isFallback ? null : 0, isFallback,
      };

      if (Array.isArray(rows)) {
        for (const row of rows) {
          totals.depositos += parseCurrency(row.depositos);
          totals.saques += parseCurrency(row.saques);
          if (!isFallback) {
            totals.bonus = (totals.bonus || 0) + parseCurrency(row.bonus);
            totals.ggr = (totals.ggr || 0) + parseCurrency(row.ggr);
            totals.comissao = (totals.comissao || 0) + parseCurrency(row.comissao);
            totals.lucro = (totals.lucro || 0) + parseCurrency(row.lucro);
            totals.apostas = (totals.apostas || 0) + parseCurrency(row.apostas || row.bets || 0);
            totals.premios = (totals.premios || 0) + parseCurrency(row.premios || row.prizes || 0);
            totals.turnover = (totals.turnover || 0) + parseCurrency(row.turnover || row.apostas || row.bets || 0);
          }
        }
      }

      setFinancials(totals);
      if (isFallback) {
        toast.info('Dados parciais: apenas depósitos e saques disponíveis');
      } else {
        toast.success('Financeiro atualizado!');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingFinancials(false);
    }
  }, [creds, period, callProxy]);

  // Auto-fetch when creds or period change
  useEffect(() => {
    if (creds.username) fetchFinancials();
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadingStats || loadingBatches) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const stats = s || { total_batches: 0, total_items: 0, pendente: 0, processando: 0, sem_bonus: 0, bonus_1x: 0, bonus_2x_plus: 0, erro: 0 };
  const recentBatches = (batches || []).slice(0, 5);

  const periodLabels: Record<PeriodFilter, string> = {
    today: 'Hoje',
    yesterday: 'Ontem',
    '7d': '7 dias',
    '30d': '30 dias',
  };

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
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(Object.keys(periodLabels) as PeriodFilter[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    period === p
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {periodLabels[p]}
                </button>
              ))}
            </div>
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
              <FinancialKPICard title="Apostas" value={financials.apostas !== null ? formatBRL(financials.apostas) : 'N/D'} icon={Dices} variant={financials.apostas !== null ? 'blue' : 'default'} />
              <FinancialKPICard title="Prêmios" value={financials.premios !== null ? formatBRL(financials.premios) : 'N/D'} icon={Trophy} variant={financials.premios !== null ? 'amber' : 'default'} />
              <FinancialKPICard title="Turnover" value={financials.turnover !== null ? formatBRL(financials.turnover) : 'N/D'} icon={TrendingUp} variant={financials.turnover !== null ? 'purple' : 'default'} />
              <FinancialKPICard title="GGR" value={financials.ggr !== null ? formatBRL(financials.ggr) : 'N/D'} icon={BarChart3} variant={financials.ggr !== null ? (financials.ggr >= 0 ? 'green' : 'red') : 'default'} trend={financials.ggr !== null ? (financials.ggr >= 0 ? 'up' : 'down') : undefined} trendValue={financials.ggr !== null && financials.turnover !== null && financials.turnover > 0 ? `${((financials.ggr / financials.turnover) * 100).toFixed(1)}% margem` : undefined} />
            </div>
            {financials.isFallback && (
              <p className="text-xs text-muted-foreground">⚠️ Dados parciais — endpoint financeiro indisponível, exibindo apenas depósitos e saques.</p>
            )}
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
