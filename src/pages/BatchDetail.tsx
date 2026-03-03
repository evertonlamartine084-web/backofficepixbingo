import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, Play, Filter, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { ItemStatusBadge, BatchStatusBadge } from '@/components/StatusBadge';
import { useState } from 'react';
import { useBatch, useBatchItems } from '@/hooks/use-supabase-data';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ItemStatus, BatchStatus } from '@/types';

export default function BatchDetail() {
  const { id } = useParams();
  const { data: batch, isLoading: loadingBatch } = useBatch(id);
  const { data: allItems, isLoading: loadingItems } = useBatchItems(id);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditLoading, setCreditLoading] = useState(false);
  const [apiUsername, setApiUsername] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const queryClient = useQueryClient();

  if (loadingBatch || loadingItems) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Lote não encontrado.</p>
        <Link to="/batches" className="text-primary hover:underline text-sm mt-2 inline-block">← Voltar</Link>
      </div>
    );
  }

  const stats = batch.stats as any;
  const items = (allItems || []).filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch = !search || (item.uuid || '').includes(search) || item.cpf_masked.includes(search) || item.cpf.includes(search);
    return matchStatus && matchSearch;
  });

  const eligibleCount = (allItems || []).filter(i => i.status === 'PENDENTE' || i.status === 'SEM_BONUS').length;

  const handleCreditBatch = async () => {
    if (!apiUsername || !apiPassword) {
      toast.error('Preencha usuário e senha');
      return;
    }
    setCreditLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('pixbingo-proxy', {
        body: {
          action: 'credit_batch',
          site_url: 'https://pixbingobr.com',
          login_url: 'https://pixbingobr.com/api/auth/login',
          username: apiUsername,
          password: apiPassword,
          batch_id: id,
        },
      });
      if (error) throw error;
      if (data?.data) {
        toast.success(`Bônus creditado! ${data.data.credited} sucesso, ${data.data.errors} erros de ${data.data.total} itens`);
        queryClient.invalidateQueries({ queryKey: ['batch', id] });
        queryClient.invalidateQueries({ queryKey: ['batch-items', id] });
        setCreditOpen(false);
      } else {
        toast.error('Erro ao processar lote');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreditLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/batches">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{batch.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <BatchStatusBadge status={batch.status as BatchStatus} />
            <span className="text-sm text-muted-foreground font-mono">R$ {batch.bonus_valor}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-border"><RefreshCw className="w-4 h-4 mr-2" /> Reprocessar Erros</Button>
          <Button variant="outline" className="border-border"><Download className="w-4 h-4 mr-2" /> Exportar</Button>
          
          {/* Credit batch button */}
          <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-success border-0 text-success-foreground" disabled={eligibleCount === 0}>
                <Zap className="w-4 h-4 mr-2" /> Creditar Lote ({eligibleCount})
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-foreground">Creditar Bônus em Lote</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Vai creditar R$ {batch.bonus_valor} para {eligibleCount} jogadores elegíveis (PENDENTE ou SEM_BONUS).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <p className="text-sm text-warning font-medium">⚠️ Atenção</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Esta ação vai creditar bônus para {eligibleCount} jogadores via API. Confirme as credenciais do painel admin.
                  </p>
                </div>
                <div>
                  <Label className="text-foreground">Usuário Admin</Label>
                  <Input value={apiUsername} onChange={e => setApiUsername(e.target.value)} placeholder="admin" className="mt-1 bg-secondary border-border" />
                </div>
                <div>
                  <Label className="text-foreground">Senha</Label>
                  <Input type="password" value={apiPassword} onChange={e => setApiPassword(e.target.value)} placeholder="••••" className="mt-1 bg-secondary border-border" />
                </div>
                <Button onClick={handleCreditBatch} disabled={creditLoading} className="w-full gradient-primary border-0">
                  {creditLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...</>
                  ) : (
                    <><Zap className="w-4 h-4 mr-2" /> Confirmar e Creditar</>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Pendente', value: stats.pendente, cls: 'text-muted-foreground' },
          { label: 'Processando', value: stats.processando, cls: 'text-primary' },
          { label: 'Sem Bônus', value: stats.sem_bonus, cls: 'text-secondary-foreground' },
          { label: 'Bônus 1x', value: stats.bonus_1x, cls: 'text-success' },
          { label: 'Bônus 2x+', value: stats.bonus_2x_plus, cls: 'text-destructive' },
          { label: 'Erros', value: stats.erro, cls: 'text-warning' },
        ].map((s) => (
          <div key={s.label} className="glass-card p-3 text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar UUID ou CPF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 bg-secondary border-border">
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="PENDENTE">Pendente</SelectItem>
            <SelectItem value="SEM_BONUS">Sem Bônus</SelectItem>
            <SelectItem value="BONUS_1X">Bônus 1x</SelectItem>
            <SelectItem value="BONUS_2X+">Bônus 2x+</SelectItem>
            <SelectItem value="ERRO">Erro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card overflow-hidden">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum item encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">CPF</th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">UUID</th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tent.</th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qtd Bônus</th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datas do Bônus</th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Log</th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const datas = (item.datas_bonus || []) as string[];
                  const logs = (item.log || []) as string[];
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-border/20 hover:bg-secondary/20 transition-colors ${
                        item.status === 'BONUS_2X+' ? 'bg-destructive/5' : ''
                      }`}
                    >
                      <td className="p-3 font-mono text-xs text-muted-foreground">{item.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</td>
                      <td className="p-3 font-mono text-xs text-foreground">{item.uuid || '—'}</td>
                      <td className="p-3"><ItemStatusBadge status={item.status as ItemStatus} /></td>
                      <td className="p-3 text-center text-muted-foreground">{item.tentativas}</td>
                      <td className="p-3 text-center">
                        <span className={item.qtd_bonus >= 2 ? 'text-destructive font-bold' : 'text-foreground'}>
                          {item.qtd_bonus}
                        </span>
                      </td>
                      <td className="p-3">
                        {datas.length > 0 ? (
                          <div className="space-y-0.5">
                            {datas.map((d, i) => (
                              <span key={i} className="block text-xs text-muted-foreground font-mono">{d}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 max-w-[200px]">
                        <p className="text-xs text-muted-foreground truncate">{logs[0] || '—'}</p>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
