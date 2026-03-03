import { useState } from 'react';
import {
  Package, Users, CheckCircle, XCircle, AlertTriangle, Clock, Zap, Shield,
  BarChart3, Loader2, RefreshCw, Activity
} from 'lucide-react';
import { StatsCard } from '@/components/StatsCard';
import { BatchStatusBadge } from '@/components/StatusBadge';
import { Link } from 'react-router-dom';
import { useDashboardStats, useBatches } from '@/hooks/use-supabase-data';
import { ApiCredentialsBar } from '@/components/ApiCredentialsBar';
import { useProxy } from '@/hooks/use-proxy';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { BatchStatus } from '@/types';

export default function Dashboard() {
  const { data: s, isLoading: loadingStats } = useDashboardStats();
  const { data: batches, isLoading: loadingBatches } = useBatches();
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [liveData, setLiveData] = useState<any>(null);
  const [siteStatus, setSiteStatus] = useState<any>(null);
  const { callProxy, loading: _l } = useProxy();
  const [loadingLive, setLoadingLive] = useState(false);

  const fetchLiveData = async () => {
    if (!creds.username) return;
    setLoadingLive(true);
    try {
      const [dashRes, statusRes] = await Promise.allSettled([
        callProxy('dashboard', creds),
        callProxy('site_status', creds),
      ]);
      if (dashRes.status === 'fulfilled') setLiveData(dashRes.value?.data);
      if (statusRes.status === 'fulfilled') setSiteStatus(statusRes.value?.data);
      toast.success('Dados ao vivo carregados!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingLive(false);
    }
  };

  if (loadingStats || loadingBatches) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const stats = s || { total_batches: 0, total_items: 0, pendente: 0, processando: 0, sem_bonus: 0, bonus_1x: 0, bonus_2x_plus: 0, erro: 0 };
  const recentBatches = (batches || []).slice(0, 5);

  const renderLiveKV = (data: any) => {
    if (!data) return null;
    const entries = typeof data === 'object' && !Array.isArray(data) ? Object.entries(data) : [];
    if (entries.length === 0) return <p className="text-xs text-muted-foreground">Sem dados</p>;
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {entries.filter(([k]) => !k.startsWith('_')).slice(0, 12).map(([k, v]) => (
          <div key={k} className="bg-secondary/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{k}</p>
            <p className="text-sm font-semibold text-foreground font-mono mt-1">
              {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}
            </p>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral do processamento de bônus</p>
        </div>
      </div>

      {/* Local stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Total Itens" value={stats.total_items} subtitle={`${stats.total_batches} lotes`} icon={Users} variant="primary" />
        <StatsCard title="Sem Bônus" value={stats.sem_bonus} icon={XCircle} variant="default" />
        <StatsCard title="Bônus 1x" value={stats.bonus_1x} icon={CheckCircle} variant="success" />
        <StatsCard title="Bônus 2x+" value={stats.bonus_2x_plus} subtitle="Duplicados!" icon={AlertTriangle} variant="danger" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Pendentes" value={stats.pendente} icon={Clock} />
        <StatsCard title="Erros" value={stats.erro} icon={XCircle} variant="warning" />
        <StatsCard title="Processando" value={stats.processando} icon={Zap} variant="primary" />
        <StatsCard title="Alertas 2x+" value={stats.bonus_2x_plus} subtitle="Duplicados" icon={Shield} variant="danger" />
      </div>

      {/* Live API data */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Dados ao Vivo (API)</h2>
          </div>
          <Button onClick={fetchLiveData} disabled={loadingLive || !creds.username} variant="outline" className="border-border">
            {loadingLive ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Atualizar
          </Button>
        </div>
        <ApiCredentialsBar onCredentials={(c) => { setCreds(c); }} />

        {siteStatus && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status do Site</p>
            {renderLiveKV(siteStatus)}
          </div>
        )}
        {liveData && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dashboard do Site</p>
            {renderLiveKV(liveData)}
          </div>
        )}
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
