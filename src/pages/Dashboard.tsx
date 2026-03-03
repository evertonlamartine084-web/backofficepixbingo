import {
  Package, Users, CheckCircle, XCircle, AlertTriangle, Clock, Zap, Shield
} from 'lucide-react';
import { StatsCard } from '@/components/StatsCard';
import { mockDashboardStats, mockBatches } from '@/lib/mock-data';
import { BatchStatusBadge } from '@/components/StatusBadge';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const s = mockDashboardStats;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral do processamento de bônus</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Total Itens" value={s.total_items} subtitle={`${s.total_batches} lotes`} icon={Users} variant="primary" />
        <StatsCard title="Sem Bônus" value={s.sem_bonus} icon={XCircle} variant="default" />
        <StatsCard title="Bônus 1x" value={s.bonus_1x} icon={CheckCircle} variant="success" />
        <StatsCard title="Bônus 2x+" value={s.bonus_2x_plus} subtitle="Duplicados!" icon={AlertTriangle} variant="danger" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Pendentes" value={s.pendente} icon={Clock} />
        <StatsCard title="Erros" value={s.erro} icon={XCircle} variant="warning" />
        <StatsCard title="Tempo Médio" value={`${s.avg_time_ms}ms`} icon={Zap} variant="primary" />
        <StatsCard title="Alertas 429" value={s.rate_limit_alerts} subtitle="Rate limit" icon={Shield} variant="danger" />
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Lotes Recentes</h2>
          <Link to="/batches" className="text-sm text-primary hover:underline">Ver todos →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome</th>
                <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fluxo</th>
                <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Progresso</th>
                <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">2x+</th>
              </tr>
            </thead>
            <tbody>
              {mockBatches.map((b) => (
                <tr key={b.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="py-3">
                    <Link to={`/batches/${b.id}`} className="text-foreground hover:text-primary font-medium">{b.name}</Link>
                  </td>
                  <td className="py-3 text-muted-foreground">{b.flow_name}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full gradient-primary rounded-full transition-all"
                          style={{ width: `${(b.processed / b.total_items) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{b.processed}/{b.total_items}</span>
                    </div>
                  </td>
                  <td className="py-3"><BatchStatusBadge status={b.status} /></td>
                  <td className="py-3">
                    {b.stats.bonus_2x_plus > 0 && (
                      <span className="status-badge bg-destructive/20 text-destructive font-semibold">
                        {b.stats.bonus_2x_plus}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
