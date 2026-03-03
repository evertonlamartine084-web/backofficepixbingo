import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, Play, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ItemStatusBadge, BatchStatusBadge } from '@/components/StatusBadge';
import { mockBatches, mockBatchItems } from '@/lib/mock-data';
import { useState } from 'react';
import type { ItemStatus } from '@/types';

export default function BatchDetail() {
  const { id } = useParams();
  const batch = mockBatches.find((b) => b.id === id) || mockBatches[0];
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const items = mockBatchItems.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch = !search || item.uuid.includes(search) || item.cpf_masked.includes(search);
    return matchStatus && matchSearch;
  });

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
            <BatchStatusBadge status={batch.status} />
            <span className="text-sm text-muted-foreground">{batch.flow_name}</span>
            <span className="text-sm text-muted-foreground">•</span>
            <span className="text-sm text-muted-foreground font-mono">R$ {batch.bonus_valor}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-border"><RefreshCw className="w-4 h-4 mr-2" /> Reprocessar Erros</Button>
          <Button variant="outline" className="border-border"><Download className="w-4 h-4 mr-2" /> Exportar</Button>
          {batch.status !== 'CONCLUIDO' && (
            <Button className="gradient-primary border-0"><Play className="w-4 h-4 mr-2" /> Retomar</Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Pendente', value: batch.stats.pendente, cls: 'text-muted-foreground' },
          { label: 'Processando', value: batch.stats.processando, cls: 'text-primary' },
          { label: 'Sem Bônus', value: batch.stats.sem_bonus, cls: 'text-secondary-foreground' },
          { label: 'Bônus 1x', value: batch.stats.bonus_1x, cls: 'text-success' },
          { label: 'Bônus 2x+', value: batch.stats.bonus_2x_plus, cls: 'text-destructive' },
          { label: 'Erros', value: batch.stats.erro, cls: 'text-warning' },
        ].map((s) => (
          <div key={s.label} className="glass-card p-3 text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
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

      {/* Items table */}
      <div className="glass-card overflow-hidden">
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
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-border/20 hover:bg-secondary/20 transition-colors ${
                    item.status === 'BONUS_2X+' ? 'bg-destructive/5' : ''
                  }`}
                >
                  <td className="p-3 font-mono text-xs text-muted-foreground">{item.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</td>
                  <td className="p-3 font-mono text-xs text-foreground">{item.uuid}</td>
                  <td className="p-3"><ItemStatusBadge status={item.status} /></td>
                  <td className="p-3 text-center text-muted-foreground">{item.tentativas}</td>
                  <td className="p-3 text-center">
                    <span className={item.qtd_bonus >= 2 ? 'text-destructive font-bold' : 'text-foreground'}>
                      {item.qtd_bonus}
                    </span>
                  </td>
                  <td className="p-3">
                    {item.datas_bonus.length > 0 ? (
                      <div className="space-y-0.5">
                        {item.datas_bonus.map((d, i) => (
                          <span key={i} className="block text-xs text-muted-foreground font-mono">{d}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 max-w-[200px]">
                    <p className="text-xs text-muted-foreground truncate">{item.log[0] || '—'}</p>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs">
                        <RefreshCw className="w-3 h-3" />
                      </Button>
                    </div>
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
