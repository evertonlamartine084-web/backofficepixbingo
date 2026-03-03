import { AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ItemStatusBadge } from '@/components/StatusBadge';
import { useDuplicates } from '@/hooks/use-supabase-data';
import type { ItemStatus } from '@/types';

export default function Duplicates() {
  const { data: duplicates, isLoading } = useDuplicates();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const items = duplicates || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-destructive" />
            Duplicados (Bônus 2x+)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length} itens com 2 ou mais bônus detectados
          </p>
        </div>
        <Button variant="outline" className="border-border">
          <Download className="w-4 h-4 mr-2" /> Exportar Lista
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhum duplicado encontrado.</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden border-destructive/30">
          <div className="bg-destructive/10 px-4 py-2 border-b border-destructive/20">
            <p className="text-xs font-medium text-destructive">
              ⚠ Atenção: estes usuários receberam bônus múltiplas vezes. Verifique antes de creditar novamente.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">CPF</th>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">UUID</th>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qtd Bônus</th>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datas do Bônus</th>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Última Data</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const datas = (item.datas_bonus || []) as string[];
                return (
                  <tr key={item.id} className="border-b border-border/20 bg-destructive/5 hover:bg-destructive/10 transition-colors">
                    <td className="p-3 font-mono text-xs text-muted-foreground">{item.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</td>
                    <td className="p-3 font-mono text-xs text-foreground">{item.uuid || '—'}</td>
                    <td className="p-3"><ItemStatusBadge status={item.status as ItemStatus} /></td>
                    <td className="p-3 text-center">
                      <span className="text-destructive font-bold text-lg">{item.qtd_bonus}</span>
                    </td>
                    <td className="p-3">
                      <div className="space-y-0.5">
                        {datas.map((d, i) => (
                          <span key={i} className="block text-xs text-muted-foreground font-mono">{d}</span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-xs font-mono text-warning">{item.ultima_data_bonus || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
