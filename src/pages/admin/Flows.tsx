import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, GitBranch, Trash2, Edit, ArrowDown, StopCircle, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useFlows, useEndpoints } from '@/hooks/use-supabase-data';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAudit } from '@/hooks/use-audit';

const methodColors: Record<string, string> = {
  GET: 'bg-success/20 text-success',
  POST: 'bg-primary/20 text-primary',
  PUT: 'bg-warning/20 text-warning',
  DELETE: 'bg-destructive/20 text-destructive',
};

interface StepForm {
  endpoint_id: string;
  stop_condition: string;
}

export default function Flows() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [steps, setSteps] = useState<StepForm[]>([{ endpoint_id: '', stop_condition: '' }]);
  const { data: flows, isLoading } = useFlows();
  const { data: endpoints } = useEndpoints();

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error('Preencha o nome do fluxo');
      const validSteps = steps.filter(s => s.endpoint_id);
      if (validSteps.length === 0) throw new Error('Adicione pelo menos um step');
      const flowSteps = validSteps.map((s, i) => ({
        id: crypto.randomUUID(),
        order: i + 1,
        endpoint_id: s.endpoint_id,
        endpoint_name: endpoints?.find(e => e.id === s.endpoint_id)?.name || '',
        description: endpoints?.find(e => e.id === s.endpoint_id)?.name || `Step ${i + 1}`,
        stop_condition: s.stop_condition || undefined,
      }));
      const { error } = await supabase.from('flows').insert({
        name: form.name,
        description: form.description,
        steps: flowSteps,
      } as Record<string, unknown>);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast.success('Fluxo criado');
      logAudit({ action: 'CRIAR', resource_type: 'fluxo', resource_name: form.name });
      setOpen(false);
      setForm({ name: '', description: '' });
      setSteps([{ endpoint_id: '', stop_condition: '' }]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const flow = flows?.find(f => f.id === id);
      const { error } = await supabase.from('flows').delete().eq('id', id);
      if (error) throw error;
      return flow;
    },
    onSuccess: (flow) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast.success('Fluxo excluído');
      logAudit({ action: 'EXCLUIR', resource_type: 'fluxo', resource_name: flow?.name });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const flowItems = flows || [];
  const epList = endpoints || [];

  const addStep = () => setSteps(s => [...s, { endpoint_id: '', stop_condition: '' }]);
  const removeStep = (idx: number) => setSteps(s => s.filter((_, i) => i !== idx));
  const updateStep = (idx: number, field: keyof StepForm, value: string) =>
    setSteps(s => s.map((step, i) => i === idx ? { ...step, [field]: value } : step));

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
                <Input
                  placeholder="Ex: Crédito + Verificação"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 bg-secondary border-border"
                />
              </div>
              <div>
                <Label className="text-foreground">Descrição</Label>
                <Input
                  placeholder="Descrição do pipeline"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="mt-1 bg-secondary border-border"
                />
              </div>
              <div>
                <Label className="text-foreground">Steps</Label>
                <p className="text-xs text-muted-foreground mb-2">Adicione endpoints na ordem de execução</p>
                <div className="space-y-2">
                  {steps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-secondary/50 rounded-lg p-3">
                      <span className="text-xs text-muted-foreground">{idx + 1}.</span>
                      <Select value={step.endpoint_id} onValueChange={v => updateStep(idx, 'endpoint_id', v)}>
                        <SelectTrigger className="flex-1 bg-secondary border-border"><SelectValue placeholder="Selecione o endpoint" /></SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          {epList.map((ep) => (
                            <SelectItem key={ep.id} value={ep.id}>{ep.method} — {ep.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Stop condition"
                        value={step.stop_condition}
                        onChange={e => updateStep(idx, 'stop_condition', e.target.value)}
                        className="w-40 bg-secondary border-border text-xs"
                      />
                      {steps.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => removeStep(idx)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-2 border-border" onClick={addStep}>
                  <Plus className="w-3 h-3 mr-1" /> Adicionar Step
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                className="gradient-primary border-0"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Salvando...' : 'Salvar Fluxo'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {flowItems.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground">Nenhum fluxo configurado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {flowItems.map((flow) => {
            const flowSteps = (flow.steps || []) as Array<{
              id: string; order: number; endpoint_id: string; endpoint_name?: string;
              description: string; stop_condition?: string; stop_status?: string;
            }>;
            return (
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
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                      onClick={() => { if (confirm('Excluir fluxo?')) deleteMutation.mutate(flow.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-0 ml-3">
                  {flowSteps.map((step, idx) => {
                    const ep = epList.find((e) => e.id === step.endpoint_id);
                    return (
                      <div key={step.id}>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
                          <GripVertical className="w-4 h-4 text-muted-foreground/50" />
                          <span className="text-xs text-muted-foreground font-mono w-5">{step.order}</span>
                          {ep && <span className={`status-badge text-[10px] ${methodColors[ep.method] || ''}`}>{ep.method}</span>}
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
                        {idx < flowSteps.length - 1 && (
                          <div className="flex justify-center py-1">
                            <ArrowDown className="w-4 h-4 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
