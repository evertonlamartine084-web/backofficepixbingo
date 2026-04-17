import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Loader2, Clock, Zap, GitBranch,
  ChevronDown, ChevronUp, Pencil, Users, SquareActivity, Send,
  Timer, SplitSquareVertical, Play, Award, Coins, Crosshair,
  MessageSquare, Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/use-audit';

// --- Types ---

interface Journey {
  id: string;
  name: string;
  description: string | null;
  status: string;
  entry_event: string;
  entry_conditions: Condition[];
  entry_match_type: string;
  segment_id: string | null;
  max_entries_per_player: number;
  active: boolean;
  created_at: string;
}

interface JourneyStep {
  id: string;
  journey_id: string;
  step_order: number;
  step_type: string;
  delay_minutes: number;
  action_type: string | null;
  action_config: Record<string, unknown>;
  conditions: Condition[];
  condition_yes_next: number | null;
  condition_no_next: number | null;
  created_at: string;
}

interface Enrollment {
  id: string;
  journey_id: string;
  cpf: string;
  current_step_order: number;
  status: string;
  entered_at: string;
  step_entered_at: string;
  completed_at: string | null;
}

interface LogEntry {
  id: string;
  journey_id: string;
  enrollment_id: string | null;
  cpf: string;
  step_order: number;
  action_type: string;
  result: Record<string, unknown>;
  executed_at: string;
}

interface Condition {
  field: string;
  operator: string;
  value: string;
}

interface SegmentRow {
  id: string;
  name: string;
}

// --- Constants ---

const ENTRY_EVENTS: Record<string, string> = {
  deposit: 'Depósito',
  bet: 'Aposta',
  login: 'Login',
  level_up: 'Subiu de Nível',
  achievement_unlock: 'Conquista Desbloqueada',
  registration: 'Cadastro',
  segment_enter: 'Entrou em Segmento',
  manual: 'Manual',
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: 'bg-gray-500/20 text-gray-400',
  ativa: 'bg-green-500/20 text-green-400',
  pausada: 'bg-amber-500/20 text-amber-400',
  encerrada: 'bg-red-500/20 text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  ativa: 'Ativa',
  pausada: 'Pausada',
  encerrada: 'Encerrada',
};

const ENROLLMENT_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400',
  completed: 'bg-blue-500/20 text-blue-400',
  exited: 'bg-red-500/20 text-red-400',
  paused: 'bg-amber-500/20 text-amber-400',
};

const ACTION_TYPES = [
  { value: 'credit_bonus', label: 'Creditar Bônus (R$)', icon: Coins },
  { value: 'give_coins', label: 'Dar Coins', icon: Coins },
  { value: 'give_xp', label: 'Dar XP', icon: Award },
  { value: 'give_spins', label: 'Dar Giros (Roleta)', icon: Play },
  { value: 'give_mission', label: 'Atribuir Missão', icon: Crosshair },
  { value: 'give_achievement', label: 'Dar Conquista', icon: Award },
  { value: 'add_to_segment', label: 'Adicionar a Segmento', icon: Users },
  { value: 'send_push', label: 'Enviar Push', icon: Bell },
  { value: 'send_inbox', label: 'Enviar Inbox', icon: MessageSquare },
];

const STEP_TYPES = [
  { value: 'action', label: 'Ação', icon: Zap },
  { value: 'delay', label: 'Atraso', icon: Timer },
  { value: 'condition_split', label: 'Condição', icon: SplitSquareVertical },
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

// --- Step form state ---

interface StepFormData {
  step_type: string;
  delay_minutes: string;
  action_type: string;
  action_config: Record<string, string>;
  conditions: Condition[];
  condition_yes_next: string;
  condition_no_next: string;
}

const INITIAL_STEP_FORM: StepFormData = {
  step_type: 'action',
  delay_minutes: '60',
  action_type: 'credit_bonus',
  action_config: {},
  conditions: [],
  condition_yes_next: '',
  condition_no_next: '',
};

// --- Component ---

export default function JourneyBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [journey, setJourney] = useState<Journey | null>(null);
  const [steps, setSteps] = useState<JourneyStep[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepForm, setStepForm] = useState<StepFormData>(INITIAL_STEP_FORM);
  const [tab, setTab] = useState('steps');

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);
    const [journeyRes, stepsRes, enrollRes, logsRes, segRes] = await Promise.all([
      supabase.from('journeys' as never).select('*').eq('id', id).single(),
      supabase.from('journey_steps' as never).select('*').eq('journey_id', id).order('step_order', { ascending: true }),
      supabase.from('journey_enrollments' as never).select('*').eq('journey_id', id).order('entered_at', { ascending: false }).limit(200),
      supabase.from('journey_log' as never).select('*').eq('journey_id', id).order('executed_at', { ascending: false }).limit(200),
      supabase.from('segments' as never).select('id, name').order('name'),
    ]);

    if (journeyRes.data) setJourney(journeyRes.data as unknown as Journey);
    if (stepsRes.data) setSteps(stepsRes.data as unknown as JourneyStep[]);
    if (enrollRes.data) setEnrollments(enrollRes.data as unknown as Enrollment[]);
    if (logsRes.data) setLogs(logsRes.data as unknown as LogEntry[]);
    if (segRes.data) setSegments(segRes.data as unknown as SegmentRow[]);
    setLoading(false);
  }

  // Step form helpers
  function openAddStep() {
    setEditingStepId(null);
    const nextOrder = steps.length > 0 ? Math.max(...steps.map(s => s.step_order)) + 1 : 0;
    setStepForm({ ...INITIAL_STEP_FORM });
    setStepDialogOpen(true);
  }

  function openEditStep(step: JourneyStep) {
    setEditingStepId(step.id);
    const configAsStrings: Record<string, string> = {};
    for (const [k, v] of Object.entries(step.action_config || {})) {
      configAsStrings[k] = String(v ?? '');
    }
    setStepForm({
      step_type: step.step_type,
      delay_minutes: String(step.delay_minutes || 60),
      action_type: step.action_type || 'credit_bonus',
      action_config: configAsStrings,
      conditions: step.conditions || [],
      condition_yes_next: step.condition_yes_next != null ? String(step.condition_yes_next) : '',
      condition_no_next: step.condition_no_next != null ? String(step.condition_no_next) : '',
    });
    setStepDialogOpen(true);
  }

  async function handleSaveStep() {
    const nextOrder = editingStepId
      ? steps.find(s => s.id === editingStepId)?.step_order ?? steps.length
      : steps.length > 0 ? Math.max(...steps.map(s => s.step_order)) + 1 : 0;

    const payload: Record<string, unknown> = {
      journey_id: id,
      step_order: nextOrder,
      step_type: stepForm.step_type,
      delay_minutes: stepForm.step_type === 'delay' ? parseInt(stepForm.delay_minutes) || 60 : 0,
      action_type: stepForm.step_type === 'action' ? stepForm.action_type : null,
      action_config: stepForm.step_type === 'action' ? stepForm.action_config : {},
      conditions: stepForm.step_type === 'condition_split' ? stepForm.conditions : [],
      condition_yes_next: stepForm.step_type === 'condition_split' && stepForm.condition_yes_next
        ? parseInt(stepForm.condition_yes_next) : null,
      condition_no_next: stepForm.step_type === 'condition_split' && stepForm.condition_no_next
        ? parseInt(stepForm.condition_no_next) : null,
    };

    if (editingStepId) {
      const { error } = await supabase.from('journey_steps' as never).update(payload as never).eq('id', editingStepId);
      if (error) {
        toast.error('Erro ao atualizar passo: ' + error.message);
        return;
      }
      toast.success('Passo atualizado');
    } else {
      const { error } = await supabase.from('journey_steps' as never).insert(payload as never);
      if (error) {
        toast.error('Erro ao criar passo: ' + error.message);
        return;
      }
      toast.success('Passo adicionado');
    }

    logAudit({
      action: editingStepId ? 'update_step' : 'create_step',
      resource_type: 'journey_step',
      resource_id: id,
      resource_name: journey?.name,
      details: { step_type: stepForm.step_type, action_type: stepForm.action_type },
    });

    setStepDialogOpen(false);
    setEditingStepId(null);
    loadData();
  }

  async function deleteStep(step: JourneyStep) {
    if (!window.confirm(`Deletar passo #${step.step_order}?`)) return;

    const { error } = await supabase.from('journey_steps' as never).delete().eq('id', step.id);
    if (error) {
      toast.error('Erro ao deletar: ' + error.message);
      return;
    }

    toast.success('Passo removido');
    logAudit({
      action: 'delete_step',
      resource_type: 'journey_step',
      resource_id: step.id,
      resource_name: journey?.name,
    });
    loadData();
  }

  async function moveStep(step: JourneyStep, direction: 'up' | 'down') {
    const idx = steps.findIndex(s => s.id === step.id);
    if (direction === 'up' && idx <= 0) return;
    if (direction === 'down' && idx >= steps.length - 1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const other = steps[swapIdx];

    await Promise.all([
      supabase.from('journey_steps' as never).update({ step_order: other.step_order } as never).eq('id', step.id),
      supabase.from('journey_steps' as never).update({ step_order: step.step_order } as never).eq('id', other.id),
    ]);

    loadData();
  }

  // Step action config helpers
  function updateStepConfig(key: string, val: string) {
    setStepForm(f => ({ ...f, action_config: { ...f.action_config, [key]: val } }));
  }

  function addStepCondition() {
    setStepForm(f => ({
      ...f,
      conditions: [...f.conditions, { field: 'engagement_score', operator: 'gte', value: '' }],
    }));
  }

  function removeStepCondition(idx: number) {
    setStepForm(f => ({
      ...f,
      conditions: f.conditions.filter((_, i) => i !== idx),
    }));
  }

  function updateStepCondition(idx: number, updates: Partial<Condition>) {
    setStepForm(f => ({
      ...f,
      conditions: f.conditions.map((c, i) => (i === idx ? { ...c, ...updates } : c)),
    }));
  }

  // Helper: format delay for display
  function formatDelay(minutes: number): string {
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
  }

  // Helper: summarize step
  function stepSummary(step: JourneyStep): string {
    if (step.step_type === 'delay') {
      return `Aguardar ${formatDelay(step.delay_minutes)}`;
    }
    if (step.step_type === 'condition_split') {
      const condStr = (step.conditions || []).map(c => `${c.field} ${c.operator} ${c.value}`).join(', ');
      return condStr || 'Condição sem critérios';
    }
    if (step.step_type === 'action') {
      const actionLabel = ACTION_TYPES.find(a => a.value === step.action_type)?.label || step.action_type;
      const configStr = Object.entries(step.action_config || {})
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      return `${actionLabel}${configStr ? ` (${configStr})` : ''}`;
    }
    return step.step_type;
  }

  function stepIcon(step: JourneyStep) {
    if (step.step_type === 'delay') return <Timer className="w-4 h-4 text-amber-400" />;
    if (step.step_type === 'condition_split') return <SplitSquareVertical className="w-4 h-4 text-blue-400" />;
    const ActionIcon = ACTION_TYPES.find(a => a.value === step.action_type)?.icon || Zap;
    return <ActionIcon className="w-4 h-4 text-primary" />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  if (!journey) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Jornada não encontrada</p>
        <Button variant="outline" onClick={() => navigate('/journeys')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/journeys')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{journey.name}</h1>
          {journey.description && (
            <p className="text-sm text-muted-foreground">{journey.description}</p>
          )}
        </div>
        <Badge className={`${STATUS_COLORS[journey.status]} text-xs`}>
          {STATUS_LABELS[journey.status]}
        </Badge>
      </div>

      {/* Journey info card */}
      <Card className="glass-card border-border">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Evento de Entrada</span>
              <div className="font-medium">{ENTRY_EVENTS[journey.entry_event] || journey.entry_event}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Máx. Entradas/Jogador</span>
              <div className="font-medium">{journey.max_entries_per_player}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Passos</span>
              <div className="font-medium">{steps.length}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Jogadores Inscritos</span>
              <div className="font-medium">{enrollments.length}</div>
            </div>
          </div>
          {journey.entry_conditions && journey.entry_conditions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <span className="text-muted-foreground text-xs">Condições de Entrada ({journey.entry_match_type === 'all' ? 'TODAS' : 'QUALQUER'}):</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {journey.entry_conditions.map((c, i) => (
                  <span key={i} className="text-[11px] font-mono bg-secondary/50 px-1.5 py-0.5 rounded">
                    {c.field} {c.operator} {c.value}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="steps">Passos ({steps.length})</TabsTrigger>
          <TabsTrigger value="enrollments">Inscrições ({enrollments.length})</TabsTrigger>
          <TabsTrigger value="log">Log ({logs.length})</TabsTrigger>
        </TabsList>

        {/* Steps tab */}
        <TabsContent value="steps">
          <div className="space-y-3">
            {steps.map((step, idx) => (
              <Card key={step.id} className="glass-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={idx === 0}
                        onClick={() => moveStep(step, 'up')}
                      >
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                      <span className="text-xs font-mono text-muted-foreground">#{step.step_order}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={idx === steps.length - 1}
                        onClick={() => moveStep(step, 'down')}
                      >
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {stepIcon(step)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {STEP_TYPES.find(t => t.value === step.step_type)?.label || step.step_type}
                          </Badge>
                          {step.step_type === 'condition_split' && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              Sim: #{step.condition_yes_next ?? '?'} | Não: #{step.condition_no_next ?? '?'}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{stepSummary(step)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditStep(step)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteStep(step)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {steps.length === 0 && (
              <Card className="glass-card border-border">
                <CardContent className="p-8 text-center text-muted-foreground">
                  Nenhum passo configurado. Adicione o primeiro passo abaixo.
                </CardContent>
              </Card>
            )}

            <Button onClick={openAddStep} className="w-full border-dashed" variant="outline">
              <Plus className="w-4 h-4 mr-2" /> Adicionar Passo
            </Button>
          </div>
        </TabsContent>

        {/* Enrollments tab */}
        <TabsContent value="enrollments">
          <Card className="glass-card border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CPF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Passo Atual</TableHead>
                  <TableHead>Inscrito em</TableHead>
                  <TableHead>Entrou no Passo</TableHead>
                  <TableHead>Concluído em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map(enr => (
                  <TableRow key={enr.id}>
                    <TableCell className="font-mono text-xs">
                      {enr.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4')}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${ENROLLMENT_STATUS_COLORS[enr.status] || 'bg-secondary'}`}>
                        {enr.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs">#{enr.current_step_order}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(enr.entered_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(enr.step_entered_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {enr.completed_at
                        ? new Date(enr.completed_at).toLocaleString('pt-BR', {
                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                          })
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {enrollments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum jogador inscrito nesta jornada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Log tab */}
        <TabsContent value="log">
          <Card className="glass-card border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead className="text-center">Passo</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {new Date(log.executed_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4')}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs">#{log.step_order}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px]">
                        {ACTION_TYPES.find(a => a.value === log.action_type)?.label || log.action_type || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(log.result as Record<string, unknown>)?.success ? (
                        <Badge className="bg-green-500/20 text-green-400 text-[10px]">OK</Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-400 text-[10px]">ERRO</Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-1 font-mono">
                        {JSON.stringify(log.result).slice(0, 60)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhuma execução registrada para esta jornada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Step edit dialog */}
      <Dialog open={stepDialogOpen} onOpenChange={setStepDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStepId ? 'Editar Passo' : 'Novo Passo'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Step type */}
            <div>
              <Label>Tipo do Passo</Label>
              <Select
                value={stepForm.step_type}
                onValueChange={v => setStepForm(f => ({ ...f, step_type: v, action_config: {} }))}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEP_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Delay config */}
            {stepForm.step_type === 'delay' && (
              <div>
                <Label>Tempo de Atraso</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Horas</Label>
                    <Input
                      className="bg-secondary border-border"
                      type="number"
                      min="0"
                      value={Math.floor(parseInt(stepForm.delay_minutes || '0') / 60)}
                      onChange={e => {
                        const hours = parseInt(e.target.value) || 0;
                        const mins = parseInt(stepForm.delay_minutes || '0') % 60;
                        setStepForm(f => ({ ...f, delay_minutes: String(hours * 60 + mins) }));
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Minutos</Label>
                    <Input
                      className="bg-secondary border-border"
                      type="number"
                      min="0"
                      max="59"
                      value={parseInt(stepForm.delay_minutes || '0') % 60}
                      onChange={e => {
                        const hours = Math.floor(parseInt(stepForm.delay_minutes || '0') / 60);
                        const mins = parseInt(e.target.value) || 0;
                        setStepForm(f => ({ ...f, delay_minutes: String(hours * 60 + mins) }));
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total: {formatDelay(parseInt(stepForm.delay_minutes) || 0)}
                </p>
              </div>
            )}

            {/* Action config */}
            {stepForm.step_type === 'action' && (
              <>
                <div>
                  <Label>Tipo de Ação</Label>
                  <Select
                    value={stepForm.action_type}
                    onValueChange={v => setStepForm(f => ({ ...f, action_type: v, action_config: {} }))}
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map(a => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  {stepForm.action_type === 'credit_bonus' && (
                    <>
                      <Input
                        className="bg-secondary border-border"
                        placeholder="Valor (R$)"
                        value={stepForm.action_config.amount || ''}
                        onChange={e => updateStepConfig('amount', e.target.value)}
                      />
                      <Input
                        className="bg-secondary border-border"
                        placeholder="Descrição do bônus"
                        value={stepForm.action_config.description || ''}
                        onChange={e => updateStepConfig('description', e.target.value)}
                      />
                    </>
                  )}

                  {stepForm.action_type === 'give_coins' && (
                    <Input
                      className="bg-secondary border-border"
                      type="number"
                      placeholder="Quantidade de coins"
                      value={stepForm.action_config.amount || ''}
                      onChange={e => updateStepConfig('amount', e.target.value)}
                    />
                  )}

                  {stepForm.action_type === 'give_xp' && (
                    <Input
                      className="bg-secondary border-border"
                      type="number"
                      placeholder="Quantidade de XP"
                      value={stepForm.action_config.amount || ''}
                      onChange={e => updateStepConfig('amount', e.target.value)}
                    />
                  )}

                  {stepForm.action_type === 'give_spins' && (
                    <Input
                      className="bg-secondary border-border"
                      type="number"
                      placeholder="Quantidade de giros"
                      value={stepForm.action_config.amount || ''}
                      onChange={e => updateStepConfig('amount', e.target.value)}
                    />
                  )}

                  {stepForm.action_type === 'give_mission' && (
                    <Input
                      className="bg-secondary border-border"
                      placeholder="Mission ID (UUID)"
                      value={stepForm.action_config.mission_id || ''}
                      onChange={e => updateStepConfig('mission_id', e.target.value)}
                    />
                  )}

                  {stepForm.action_type === 'give_achievement' && (
                    <Input
                      className="bg-secondary border-border"
                      placeholder="Achievement ID (UUID)"
                      value={stepForm.action_config.achievement_id || ''}
                      onChange={e => updateStepConfig('achievement_id', e.target.value)}
                    />
                  )}

                  {stepForm.action_type === 'add_to_segment' && (
                    <Select
                      value={stepForm.action_config.segment_id || ''}
                      onValueChange={v => updateStepConfig('segment_id', v)}
                    >
                      <SelectTrigger className="bg-secondary border-border">
                        <SelectValue placeholder="Selecionar segmento" />
                      </SelectTrigger>
                      <SelectContent>
                        {segments.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {stepForm.action_type === 'send_push' && (
                    <>
                      <Input
                        className="bg-secondary border-border"
                        placeholder="Título da notificação"
                        value={stepForm.action_config.title || ''}
                        onChange={e => updateStepConfig('title', e.target.value)}
                      />
                      <Textarea
                        className="bg-secondary border-border"
                        placeholder="Corpo da notificação"
                        value={stepForm.action_config.body || ''}
                        onChange={e => updateStepConfig('body', e.target.value)}
                        rows={2}
                      />
                      <Input
                        className="bg-secondary border-border"
                        placeholder="URL de destino (opcional)"
                        value={stepForm.action_config.url || ''}
                        onChange={e => updateStepConfig('url', e.target.value)}
                      />
                    </>
                  )}

                  {stepForm.action_type === 'send_inbox' && (
                    <>
                      <Input
                        className="bg-secondary border-border"
                        placeholder="Título da mensagem"
                        value={stepForm.action_config.title || ''}
                        onChange={e => updateStepConfig('title', e.target.value)}
                      />
                      <Textarea
                        className="bg-secondary border-border"
                        placeholder="Conteúdo da mensagem"
                        value={stepForm.action_config.body || ''}
                        onChange={e => updateStepConfig('body', e.target.value)}
                        rows={3}
                      />
                      <Input
                        className="bg-secondary border-border"
                        placeholder="URL de ação (opcional)"
                        value={stepForm.action_config.action_url || ''}
                        onChange={e => updateStepConfig('action_url', e.target.value)}
                      />
                    </>
                  )}

                </div>
              </>
            )}

            {/* Condition split config */}
            {stepForm.step_type === 'condition_split' && (
              <>
                <div>
                  <Label className="text-sm font-semibold">Condições</Label>
                  {stepForm.conditions.map((cond, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-2 mt-2">
                      <Select value={cond.field} onValueChange={v => updateStepCondition(idx, { field: v })}>
                        <SelectTrigger className="h-8 w-44 text-xs bg-secondary border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITION_FIELDS.map(f => (
                            <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={cond.operator} onValueChange={v => updateStepCondition(idx, { operator: v })}>
                        <SelectTrigger className="h-8 w-20 text-xs bg-secondary border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPERATORS.map(op => (
                            <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={cond.value}
                        onChange={e => updateStepCondition(idx, { value: e.target.value })}
                        placeholder="valor"
                        className="h-8 w-24 text-xs font-mono bg-secondary border-border"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeStepCondition(idx)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addStepCondition} className="text-xs border-dashed mt-1">
                    <Plus className="w-3 h-3 mr-1" /> Condição
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Se SIM, ir para passo #</Label>
                    <Input
                      className="bg-secondary border-border"
                      type="number"
                      min="0"
                      value={stepForm.condition_yes_next}
                      onChange={e => setStepForm(f => ({ ...f, condition_yes_next: e.target.value }))}
                      placeholder="Nº do passo"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Se NÃO, ir para passo #</Label>
                    <Input
                      className="bg-secondary border-border"
                      type="number"
                      min="0"
                      value={stepForm.condition_no_next}
                      onChange={e => setStepForm(f => ({ ...f, condition_no_next: e.target.value }))}
                      placeholder="Nº do passo"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStepDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveStep}>
              {editingStepId ? 'Salvar Passo' : 'Adicionar Passo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
