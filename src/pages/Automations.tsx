import { useState, useEffect } from 'react';
import { Plus, Trash2, Play, Pause, Eye, Loader2, Zap, Clock, Users, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// --- Types ---

interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  trigger_type: string;
  conditions: Condition[];
  match_type: string;
  segment_id: string | null;
  lifecycle_stages: string[];
  action_type: string;
  action_config: Record<string, unknown>;
  cooldown_hours: number;
  max_executions_per_player: number | null;
  max_executions_total: number | null;
  total_executions: number;
  last_executed_at: string | null;
  created_at: string;
}

interface Condition {
  field: string;
  operator: string;
  value: string;
}

interface LogEntry {
  id: string;
  rule_id: string;
  rule_name: string;
  cpf: string;
  action_type: string;
  action_config: Record<string, unknown>;
  result: Record<string, unknown>;
  executed_at: string;
}

// --- Constants ---

const ACTION_TYPES = [
  { value: 'credit_bonus', label: 'Creditar Bônus (R$)' },
  { value: 'add_marker', label: 'Adicionar Marker' },
  { value: 'remove_marker', label: 'Remover Marker' },
  { value: 'change_lifecycle', label: 'Mudar Lifecycle' },
  { value: 'give_spins', label: 'Dar Giros (Roleta)' },
  { value: 'give_coins', label: 'Dar Coins' },
  { value: 'give_mission', label: 'Atribuir Missão' },
];

const CONDITION_FIELDS = [
  { value: 'engagement_score', label: 'Engagement Score' },
  { value: 'churn_risk', label: 'Risco de Churn' },
  { value: 'days_since_last_login', label: 'Dias sem Login' },
  { value: 'days_since_last_bet', label: 'Dias sem Apostar' },
  { value: 'days_since_last_deposit', label: 'Dias sem Depositar' },
  { value: 'total_bet_7d', label: 'Apostas 7d (R$)' },
  { value: 'total_bet_30d', label: 'Apostas 30d (R$)' },
  { value: 'total_deposit_7d', label: 'Depósitos 7d (R$)' },
  { value: 'total_deposit_30d', label: 'Depósitos 30d (R$)' },
  { value: 'active_days_7d', label: 'Dias Ativos 7d' },
  { value: 'active_days_30d', label: 'Dias Ativos 30d' },
  { value: 'avg_bet_value', label: 'Aposta Média (R$)' },
  { value: 'level', label: 'Nível' },
  { value: 'coins', label: 'Coins' },
  { value: 'favorite_game', label: 'Jogo Favorito' },
  { value: 'favorite_game_category', label: 'Categoria Favorita' },
  { value: 'stage', label: 'Lifecycle Stage' },
];

const OPERATORS = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'eq', label: '=' },
  { value: 'neq', label: '!=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'contains', label: 'contém' },
];

const LIFECYCLE_STAGES = ['new', 'active', 'loyal', 'at_risk', 'churned', 'reactivated'];

const STAGE_COLORS: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-400',
  active: 'bg-green-500/20 text-green-400',
  loyal: 'bg-purple-500/20 text-purple-400',
  at_risk: 'bg-amber-500/20 text-amber-400',
  churned: 'bg-red-500/20 text-red-400',
  reactivated: 'bg-cyan-500/20 text-cyan-400',
};

// --- Form state ---

interface FormData {
  name: string;
  description: string;
  trigger_type: string;
  conditions: Condition[];
  match_type: string;
  action_type: string;
  action_config: Record<string, string>;
  cooldown_hours: string;
  max_executions_per_player: string;
  lifecycle_stages: string[];
}

const INITIAL_FORM: FormData = {
  name: '',
  description: '',
  trigger_type: 'metric_threshold',
  conditions: [{ field: 'churn_risk', operator: 'gte', value: '70' }],
  match_type: 'all',
  action_type: 'credit_bonus',
  action_config: { amount: '15', description: 'Bônus automático' },
  cooldown_hours: '24',
  max_executions_per_player: '',
  lifecycle_stages: [],
};

// --- Component ---

export default function Automations() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lifecycleCounts, setLifecycleCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [tab, setTab] = useState('rules');
  const { toast } = useToast();

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [rulesRes, logsRes, lcRes] = await Promise.all([
      supabase.from('automation_rules' as never).select('*').order('created_at', { ascending: false }),
      supabase.from('automation_log' as never).select('*').order('executed_at', { ascending: false }).limit(200),
      supabase.from('player_lifecycle' as never).select('stage'),
    ]);

    if (rulesRes.data) setRules(rulesRes.data as unknown as AutomationRule[]);
    if (logsRes.data) setLogs(logsRes.data as unknown as LogEntry[]);

    // Count lifecycle stages
    if (lcRes.data) {
      const counts: Record<string, number> = {};
      for (const row of lcRes.data as unknown as { stage: string }[]) {
        counts[row.stage] = (counts[row.stage] || 0) + 1;
      }
      setLifecycleCounts(counts);
    }

    setLoading(false);
  }

  async function handleCreate() {
    const payload = {
      name: form.name,
      description: form.description || null,
      trigger_type: form.trigger_type,
      conditions: form.conditions,
      match_type: form.match_type,
      action_type: form.action_type,
      action_config: form.action_config,
      cooldown_hours: parseInt(form.cooldown_hours) || 24,
      max_executions_per_player: form.max_executions_per_player ? parseInt(form.max_executions_per_player) : null,
      lifecycle_stages: form.lifecycle_stages,
      active: true,
    };

    const { error } = await supabase.from('automation_rules' as never).insert(payload as never);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Automação criada' });
    setOpen(false);
    setForm(INITIAL_FORM);
    loadData();
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from('automation_rules' as never).update({ active: !active } as never).eq('id', id);
    loadData();
  }

  async function deleteRule(id: string) {
    await supabase.from('automation_rules' as never).delete().eq('id', id);
    toast({ title: 'Automação removida' });
    loadData();
  }

  // Condition form helpers
  function addCondition() {
    setForm(f => ({ ...f, conditions: [...f.conditions, { field: 'engagement_score', operator: 'gte', value: '' }] }));
  }
  function removeCondition(idx: number) {
    setForm(f => ({ ...f, conditions: f.conditions.filter((_, i) => i !== idx) }));
  }
  function updateCondition(idx: number, updates: Partial<Condition>) {
    setForm(f => ({
      ...f,
      conditions: f.conditions.map((c, i) => i === idx ? { ...c, ...updates } : c),
    }));
  }

  // Action config helper
  function updateActionConfig(key: string, val: string) {
    setForm(f => ({ ...f, action_config: { ...f.action_config, [key]: val } }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  const activeRules = rules.filter(r => r.active).length;
  const totalExecutions = rules.reduce((s, r) => s + r.total_executions, 0);
  const totalPlayers = Object.values(lifecycleCounts).reduce((s, c) => s + c, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" /> Automações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Regras automáticas: quando condição X acontece, executa ação Y
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Nova Automação</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Automação</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Name / Description */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Anti-churn bônus R$15" />
                </div>
                <div>
                  <Label>Cooldown (horas)</Label>
                  <Input type="number" value={form.cooldown_hours} onChange={e => setForm(f => ({ ...f, cooldown_hours: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="O que esta automação faz..." rows={2} />
              </div>

              {/* Conditions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Condições (QUANDO)</Label>
                  <button onClick={() => setForm(f => ({ ...f, match_type: f.match_type === 'all' ? 'any' : 'all' }))}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${form.match_type === 'all' ? 'bg-primary/20 text-primary' : 'bg-amber-500/20 text-amber-400'}`}>
                    {form.match_type === 'all' ? 'TODAS (E)' : 'QUALQUER (OU)'}
                  </button>
                </div>

                {form.conditions.map((cond, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <Select value={cond.field} onValueChange={v => updateCondition(idx, { field: v })}>
                      <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONDITION_FIELDS.map(f => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={cond.operator} onValueChange={v => updateCondition(idx, { operator: v })}>
                      <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map(op => (
                          <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input value={cond.value} onChange={e => updateCondition(idx, { value: e.target.value })}
                      placeholder="valor" className="h-8 w-24 text-xs font-mono" />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeCondition(idx)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addCondition} className="text-xs border-dashed">
                  <Plus className="w-3 h-3 mr-1" /> Condição
                </Button>
              </div>

              {/* Lifecycle filter */}
              <div>
                <Label className="text-sm">Filtrar por Lifecycle (opcional)</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {LIFECYCLE_STAGES.map(stage => (
                    <button key={stage}
                      onClick={() => setForm(f => ({
                        ...f,
                        lifecycle_stages: f.lifecycle_stages.includes(stage)
                          ? f.lifecycle_stages.filter(s => s !== stage)
                          : [...f.lifecycle_stages, stage],
                      }))}
                      className={`px-2 py-1 rounded text-xs font-mono ${
                        form.lifecycle_stages.includes(stage) ? STAGE_COLORS[stage] : 'bg-secondary text-muted-foreground'
                      }`}>
                      {stage}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action */}
              <div>
                <Label className="text-sm font-semibold">Ação (ENTÃO)</Label>
                <Select value={form.action_type} onValueChange={v => setForm(f => ({ ...f, action_type: v, action_config: {} }))}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map(a => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="mt-2 space-y-2">
                  {form.action_type === 'credit_bonus' && (
                    <>
                      <Input placeholder="Valor (R$)" value={form.action_config.amount || ''} onChange={e => updateActionConfig('amount', e.target.value)} />
                      <Input placeholder="Descrição do bônus" value={form.action_config.description || ''} onChange={e => updateActionConfig('description', e.target.value)} />
                    </>
                  )}
                  {(form.action_type === 'add_marker' || form.action_type === 'remove_marker') && (
                    <Input placeholder="Nome do marker" value={form.action_config.marker || ''} onChange={e => updateActionConfig('marker', e.target.value)} />
                  )}
                  {form.action_type === 'change_lifecycle' && (
                    <Select value={form.action_config.stage || ''} onValueChange={v => updateActionConfig('stage', v)}>
                      <SelectTrigger><SelectValue placeholder="Novo stage" /></SelectTrigger>
                      <SelectContent>
                        {LIFECYCLE_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {form.action_type === 'give_spins' && (
                    <Input type="number" placeholder="Quantidade de giros" value={form.action_config.amount || ''} onChange={e => updateActionConfig('amount', e.target.value)} />
                  )}
                  {form.action_type === 'give_coins' && (
                    <Input type="number" placeholder="Quantidade de coins" value={form.action_config.amount || ''} onChange={e => updateActionConfig('amount', e.target.value)} />
                  )}
                  {form.action_type === 'give_mission' && (
                    <Input placeholder="Mission ID (UUID)" value={form.action_config.mission_id || ''} onChange={e => updateActionConfig('mission_id', e.target.value)} />
                  )}
                </div>
              </div>

              <div>
                <Label>Limite por jogador (opcional)</Label>
                <Input type="number" value={form.max_executions_per_player} onChange={e => setForm(f => ({ ...f, max_executions_per_player: e.target.value }))}
                  placeholder="Sem limite" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={!form.name || form.conditions.length === 0}>Criar Automação</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Regras Ativas</div>
            <div className="text-2xl font-bold text-primary">{activeRules}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Execuções Total</div>
            <div className="text-2xl font-bold">{totalExecutions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Jogadores Rastreados</div>
            <div className="text-2xl font-bold">{totalPlayers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Lifecycle Stages</div>
            <div className="flex gap-1 mt-1 flex-wrap">
              {LIFECYCLE_STAGES.map(stage => (
                lifecycleCounts[stage] ? (
                  <span key={stage} className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${STAGE_COLORS[stage]}`}>
                    {stage}: {lifecycleCounts[stage]}
                  </span>
                ) : null
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="rules">Regras ({rules.length})</TabsTrigger>
          <TabsTrigger value="logs">Log de Execuções ({logs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead className="text-center">Execuções</TableHead>
                  <TableHead className="text-center">Cooldown</TableHead>
                  <TableHead>Última Exec.</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(rule => (
                  <TableRow key={rule.id} className={!rule.active ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="font-medium text-sm">{rule.name}</div>
                      {rule.description && <div className="text-[11px] text-muted-foreground">{rule.description}</div>}
                      {rule.lifecycle_stages?.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {rule.lifecycle_stages.map(s => (
                            <span key={s} className={`px-1 py-0.5 rounded text-[9px] font-mono ${STAGE_COLORS[s] || 'bg-secondary'}`}>{s}</span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        {(rule.conditions || []).map((c, i) => (
                          <div key={i} className="text-[11px] font-mono bg-secondary/50 px-1.5 py-0.5 rounded inline-block mr-1">
                            {c.field} {c.operator} {c.value}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px]">
                        {ACTION_TYPES.find(a => a.value === rule.action_type)?.label || rule.action_type}
                      </Badge>
                      <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                        {JSON.stringify(rule.action_config).slice(0, 50)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm">{rule.total_executions}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3" /> {rule.cooldown_hours}h
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {rule.last_executed_at
                        ? new Date(rule.last_executed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => toggleActive(rule.id, rule.active)}>
                        {rule.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => deleteRule(rule.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhuma automação criada. Clique em "Nova Automação" para começar.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Regra</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {new Date(log.executed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-sm">{log.rule_name}</TableCell>
                    <TableCell className="font-mono text-xs">{log.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px]">
                        {ACTION_TYPES.find(a => a.value === log.action_type)?.label || log.action_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(log.result as Record<string, unknown>)?.success
                        ? <Badge className="bg-green-500/20 text-green-400 text-[10px]">OK</Badge>
                        : <Badge className="bg-red-500/20 text-red-400 text-[10px]">ERRO</Badge>}
                      <span className="text-[10px] text-muted-foreground ml-1 font-mono">
                        {JSON.stringify(log.result).slice(0, 60)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhuma execução ainda. As automações rodam a cada 30 minutos.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
