import { useState } from 'react';
import { Plus, GitBranch, Trash2, Edit, ArrowDown, StopCircle, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { mockFlows, mockEndpoints } from '@/lib/mock-data';

const methodColors: Record<string, string> = {
  GET: 'bg-success/20 text-success',
  POST: 'bg-primary/20 text-primary',
  PUT: 'bg-warning/20 text-warning',
  DELETE: 'bg-destructive/20 text-destructive',
};

export default function Flows() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fluxos (Pipelines)</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure a sequência de execução dos endpoints</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary border-0">
              <Plus className="w-4 h-4 mr-2" /> Novo Fluxo
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-border sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-foreground">Novo Fluxo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label className="text-foreground">Nome</Label>
                <Input placeholder="Ex: Crédito + Verificação" className="mt-1 bg-secondary border-border" />
              </div>
              <div>
                <Label className="text-foreground">Descrição</Label>
                <Input placeholder="Descrição do pipeline" className="mt-1 bg-secondary border-border" />
              </div>
              <div>
                <Label className="text-foreground">Steps</Label>
                <p className="text-xs text-muted-foreground mb-2">Adicione endpoints na ordem de execução</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-3">
                    <span className="text-xs text-muted-foreground">1.</span>
                    <Select>
                      <SelectTrigger className="flex-1 bg-secondary border-border">
                        <SelectValue placeholder="Selecione o endpoint" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {mockEndpoints.map((ep) => (
                          <SelectItem key={ep.id} value={ep.id}>{ep.method} — {ep.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Stop condition" className="w-40 bg-secondary border-border text-xs" />
                  </div>
                </div>
                <Button variant="outline" size="sm" className="mt-2 border-border">
                  <Plus className="w-3 h-3 mr-1" /> Adicionar Step
                </Button>
              </div>
              <Button className="w-full gradient-primary border-0" onClick={() => setOpen(false)}>
                Salvar Fluxo
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {mockFlows.map((flow) => (
          <div key={flow.id} className="glass-card p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <GitBranch className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{flow.name}</h3>
                  <p className="text-xs text-muted-foreground">{flow.description}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>

            <div className="space-y-0 ml-3">
              {flow.steps.map((step, idx) => {
                const ep = mockEndpoints.find((e) => e.id === step.endpoint_id);
                return (
                  <div key={step.id}>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
                      <GripVertical className="w-4 h-4 text-muted-foreground/50" />
                      <span className="text-xs text-muted-foreground font-mono w-5">{step.order}</span>
                      {ep && <span className={`status-badge text-[10px] ${methodColors[ep.method]}`}>{ep.method}</span>}
                      <div className="flex-1">
                        <p className="text-sm text-foreground">{step.endpoint_name || step.description}</p>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      </div>
                      {step.stop_condition && (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-destructive/10 border border-destructive/20">
                          <StopCircle className="w-3 h-3 text-destructive" />
                          <span className="text-[10px] text-destructive font-mono">{step.stop_condition} → {step.stop_status}</span>
                        </div>
                      )}
                    </div>
                    {idx < flow.steps.length - 1 && (
                      <div className="flex justify-center py-1">
                        <ArrowDown className="w-4 h-4 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
