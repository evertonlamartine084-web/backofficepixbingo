import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Upload, Play, Pause, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BatchStatusBadge } from '@/components/StatusBadge';
import { mockBatches } from '@/lib/mock-data';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { mockFlows } from '@/lib/mock-data';

export default function Batches() {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = mockBatches.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lotes</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie lotes de crédito e verificação</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary border-0">
              <Plus className="w-4 h-4 mr-2" /> Novo Lote
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-border sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-foreground">Criar Novo Lote</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label className="text-foreground">Nome do Lote</Label>
                <Input placeholder="Ex: Campanha Março 2026" className="mt-1 bg-secondary border-border" />
              </div>
              <div>
                <Label className="text-foreground">Fluxo</Label>
                <Select>
                  <SelectTrigger className="mt-1 bg-secondary border-border">
                    <SelectValue placeholder="Selecione o fluxo" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {mockFlows.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-foreground">Valor do Bônus (R$)</Label>
                <Input type="number" placeholder="10" className="mt-1 bg-secondary border-border" />
              </div>
              <div>
                <Label className="text-foreground">Lista de CPFs/UUIDs</Label>
                <Textarea
                  placeholder="Cole CPFs ou UUIDs (um por linha) ou faça upload de CSV"
                  className="mt-1 bg-secondary border-border min-h-[120px] font-mono text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="flex-1 border-border">
                  <Upload className="w-4 h-4 mr-2" /> Upload CSV/XLSX
                </Button>
              </div>
              <Button className="w-full gradient-primary border-0" onClick={() => setOpen(false)}>
                Criar e Iniciar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar lote..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border"
          />
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome</th>
              <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fluxo</th>
              <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valor</th>
              <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Progresso</th>
              <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stats</th>
              <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                <td className="p-4">
                  <Link to={`/batches/${b.id}`} className="text-foreground hover:text-primary font-medium">
                    {b.name}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">{b.created_at}</p>
                </td>
                <td className="p-4 text-muted-foreground">{b.flow_name}</td>
                <td className="p-4 text-foreground font-mono">R$ {b.bonus_valor}</td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full gradient-primary rounded-full" style={{ width: `${(b.processed / b.total_items) * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{Math.round((b.processed / b.total_items) * 100)}%</span>
                  </div>
                </td>
                <td className="p-4"><BatchStatusBadge status={b.status} /></td>
                <td className="p-4">
                  <div className="flex gap-1.5 text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-success/15 text-success">{b.stats.bonus_1x} 1x</span>
                    {b.stats.bonus_2x_plus > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-semibold">{b.stats.bonus_2x_plus} 2x+</span>
                    )}
                    {b.stats.erro > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-warning/15 text-warning">{b.stats.erro} err</span>
                    )}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-1">
                    {b.status === 'EM_ANDAMENTO' ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Pause className="w-3.5 h-3.5" /></Button>
                    ) : b.status !== 'CONCLUIDO' ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Play className="w-3.5 h-3.5" /></Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
