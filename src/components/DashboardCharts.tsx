import { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingUp, BarChart3, Activity, Wallet, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDashboardCharts, useFinancialEvolution } from '@/hooks/use-dashboard-charts';

const CHART_COLORS = {
  primary: '#8b5cf6',
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  blue: '#3b82f6',
  cyan: '#06b6d4',
};

const formatBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CustomTooltip = ({ active, payload, label, formatter }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-mono font-medium text-foreground">
            {formatter ? formatter(entry.value) : entry.value.toLocaleString('pt-BR')}
          </span>
        </div>
      ))}
    </div>
  );
};

interface DashboardChartsProps {
  callProxy: (action: string, creds: any, params?: any) => Promise<any>;
  creds: { username: string; password: string };
}

export function DashboardCharts({ callProxy, creds }: DashboardChartsProps) {
  const [days, setDays] = useState(7);
  const { metrics, activityByDay, totals, refreshCharts } = useDashboardCharts(days);
  const { financialDaily, isLoading: loadingFinancial, refreshFinancial } = useFinancialEvolution(days, callProxy, creds);

  const handleRefresh = () => {
    refreshCharts();
    if (creds.username) refreshFinancial();
  };

  const hasFinancial = financialDaily.length > 0 && financialDaily.some(d => d.depositos > 0 || d.ggr > 0);

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Evolução</h2>
        </div>
        <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="border-border" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4" />
        </Button>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {[
            { d: 7, label: '7 dias' },
            { d: 14, label: '14 dias' },
            { d: 30, label: '30 dias' },
          ].map(opt => (
            <button
              key={opt.d}
              onClick={() => setDays(opt.d)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                days === opt.d
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Bônus Creditados" value={formatBRL(totals.bonus_creditados)} color="text-emerald-400" />
        <MiniStat label="Cashback Total" value={formatBRL(totals.cashback_total)} color="text-purple-400" />
        <MiniStat label="Campanhas Total" value={formatBRL(totals.campanhas_total)} color="text-amber-400" />
        <MiniStat label="Ações no Sistema" value={totals.acoes_total.toLocaleString()} color="text-blue-400" />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Financial Evolution */}
        {creds.username && (
          <Card className="glass-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Depósitos vs Saques</h3>
                {loadingFinancial && <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />}
              </div>
              {hasFinancial ? (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={financialDaily}>
                      <defs>
                        <linearGradient id="gradDepositos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.emerald} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS.emerald} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradSaques" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.red} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS.red} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<CustomTooltip formatter={formatBRL} />} />
                      <Area type="monotone" dataKey="depositos" name="Depósitos" stroke={CHART_COLORS.emerald} fill="url(#gradDepositos)" strokeWidth={2} />
                      <Area type="monotone" dataKey="saques" name="Saques" stroke={CHART_COLORS.red} fill="url(#gradSaques)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  {loadingFinancial ? 'Carregando dados financeiros...' : 'Conecte-se à API para ver a evolução'}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* GGR Evolution */}
        {creds.username && (
          <Card className="glass-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">GGR Diário</h3>
              </div>
              {hasFinancial ? (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={financialDaily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<CustomTooltip formatter={formatBRL} />} />
                      <Bar dataKey="ggr" name="GGR" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  {loadingFinancial ? 'Carregando...' : 'Sem dados'}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Bonus / Cashback / Campaigns */}
        <Card className="glass-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-foreground">Créditos por Dia</h3>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<CustomTooltip formatter={formatBRL} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="bonus_creditado" name="Bônus (R$)" fill={CHART_COLORS.emerald} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cashback_creditado" name="Cashback (R$)" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="campanhas_creditado" name="Campanhas (R$)" fill={CHART_COLORS.amber} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* System Activity */}
        <Card className="glass-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-foreground">Atividade do Sistema</h3>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activityByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="logins" name="Logins" stroke={CHART_COLORS.blue} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="operacoes" name="Operações" stroke={CHART_COLORS.cyan} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* New Users (from financial API) */}
        {creds.username && hasFinancial && (
          <Card className="glass-card border-border lg:col-span-2">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-foreground">Novos Usuários por Dia</h3>
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={financialDaily}>
                    <defs>
                      <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.cyan} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.cyan} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="newUsers" name="Novos Usuários" stroke={CHART_COLORS.cyan} fill="url(#gradUsers)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="glass-card p-3 text-center">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
