import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Play, Pause, Eye, Loader2, Route, Clock, Users,
  Pencil, GitBranch, SquareActivity, StopCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
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
  updated_at: string;
  created_by: string | null;
}

interface Condition {
  field: string;
  operator: string;
  value: string;
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

interface SegmentRow {
  id: string;
  name: string;
}

// --- Constants ---

const ENTRY_EVENTS = [
  { value: 'deposit', label: 'Depósito' },
  { value: 'bet', label: 'Aposta' },
  { value: 'login', label: 'Login' },
  { value: 'level_up', label: 'Subiu de Nível' },
  { value: 'achievement_unlock', label: 'Conquista Desbloqueada' },
  { value: 'registration', label: 'Cadastro' },
  { value: 'segment_enter', label: 'Entrou em Segmento' },
  { value: 'manual', label: 'Manual' },
];

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

// --- Form state ---

interface FormData {
  name: string;
  description: string;
  entry_event: string;
  entry_conditions: Condition[];
  entry_match_type: string;
  segment_id: string;
  max_entries_per_player: string;
  status: string;
}

const INITIAL_FORM: FormData = {
  name: '',
  description: '',
  entry_event: 'deposit',
  entry_conditions: [],
  entry_match_type: 'all',
  segment_id: '',
  max_entries_per_player: '1',
  status: 'rascunho',
};

// --- Component ---

export default function Journeys() {
  const navigate = useNavigate();
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [stepCounts, setStepCounts] = useState<Record<string, number>>({});
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [tab, setTab] = useState('journeys');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [journeysRes, stepsRes, enrollmentsRes, logsRes, segRes] = await Promise.all([
      supabase.from('journeys' as never).select('*').order('created_at', { ascending: false }),
      supabase.from('journey_steps' as never).select('journey_id'),
      supabase.from('journey_enrollments' as never).select('journey_id, status'),
      supabase.from('journey_log' as never).select('*').order('executed_at', { ascending: false }).limit(200),
      supabase.from('segments' as never).select('id, name').order('name'),
    ]);

    if (journeysRes.data) setJourneys(journeysRes.data as unknown as Journey[]);
    if (segRes.data) setSegments(segRes.data as unknown as SegmentRow[]);
    if (logsRes.data) setLogs(logsRes.data as unknown as LogEntry[]);

    // Count steps per journey
    if (stepsRes.data) {
      const counts: Record<string, number> = {};
      for (const row of stepsRes.data as unknown as { journey_id: string }[]) {
        counts[row.journey_id] = (counts[row.journey_id] || 0) + 1;
      }
      setStepCounts(counts);
    }

    // Count enrollments per journey
    if (enrollmentsRes.data) {
      const counts: Record<string, number> = {};
      for (const row of enrollmentsRes.data as unknown as { journey_id: string; status: string }[]) {
        counts[row.journey_id] = (counts[row.journey_id] || 0) + 1;
      }
      setEnrollmentCounts(counts);
    }

    setLoading(false);
  }

  function openCreate() {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setOpen(true);
  }

  function openEdit(journey: Journey) {
    setEditingId(journey.id);
    setForm({
      name: journey.name,
      description: journey.description || '',
      entry_event: journey.entry_event,
      entry_conditions: journey.entry_conditions || [],
      entry_match_type: journey.entry_match_type || 'all',
      segment_id: journey.segment_id || '',
      max_entries_per_player: String(journey.max_entries_per_player || 1),
      status: journey.status,
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      entry_event: form.entry_event,
      entry_conditions: form.entry_conditions,
      entry_match_type: form.entry_match_type,
      segment_id: form.segment_id || null,
      max_entries_per_player: parseInt(form.max_entries_per_player) || 1,
      status: form.status,
      active: form.status === 'ativa',
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      const { error } = await supabase.from('journeys' as never).update(payload as never).eq('id', editingId);
      if (error) {
        toast.error('Erro ao atualizar: ' + error.message);
        return;
      }
      toast.success('Jornada atualizada');
      logAudit({ action: 'update', resource_type: 'journey', resource_id: editingId, resource_name: form.name });
    } else {
      const { error } = await supabase.from('journeys' as never).insert(payload as never);
      if (error) {
        toast.error('Erro ao criar: ' + error.message);
        return;
      }
      toast.success('Jornada criada');
      logAudit({ action: 'create', resource_type: 'journey', resource_name: form.name });
    }

    setOpen(false);
    setForm(INITIAL_FORM);
    setEditingId(null);
    loadData();
  }

  async function toggleStatus(journey: Journey) {
    let newStatus: string;
    if (journey.status === 'ativa') {
      newStatus = 'pausada';
    } else if (journey.status === 'pausada' || journey.status === 'rascunho') {
      newStatus = 'ativa';
    } else {
      return; // encerrada cannot be toggled
    }

    const { error } = await supabase.from('journeys' as never).update({
      status: newStatus,
      active: newStatus === 'ativa',
      updated_at: new Date().toISOString(),
    } as never).eq('id', journey.id);

    if (error) {
      toast.error('Erro ao alterar status: ' + error.message);
      return;
    }

    toast.success(`Jornada ${newStatus === 'ativa' ? 'ativada' : 'pausada'}`);
    logAudit({
      action: 'toggle_status',
      resource_type: 'journey',
      resource_id: journey.id,
      resource_name: journey.name,
      details: { from: journey.status, to: newStatus },
    });
    loadData();
  }

  async function deleteJourney(journey: Journey) {
    if (!window.confirm(`Deletar jornada "${journey.name}"? Isso removerá todos os passos e inscrições.`)) return;

    const { error } = await supabase.from('journeys' as never).delete().eq('id', journey.id);
    if (error) {
      toast.error('Erro ao deletar: ' + error.message);
      return;
    }

    toast.success('Jornada removida');
    logAudit({ action: 'delete', resource_type: 'journey', resource_id: journey.id, resource_name: journey.name });
    loadData();
  }

  // Condition form helpers
  function addCondition() {
    setForm(f => ({
      ...f,
      entry_conditions: [...f.entry_conditions, { field: 'engagement_score', operator: 'gte', value: '' }],
    }));
  }

  function removeCondition(idx: number) {
    setForm(f => ({
      ...f,
      entry_conditions: f.entry_conditions.filter((_, i) => i !== idx),
    }));
  }

  function updateCondition(idx: number, updates: Partial<Condition>) {
    setForm(f => ({
      ...f,
      entry_conditions: f.entry_conditions.map((c, i) => (i === idx ? { ...c, ...updates } : c)),
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  const totalJourneys = journeys.length;
  const activeJourneys = journeys.filter(j => j.status === 'ativa').length;
  const pausedJourneys = journeys.filter(j => j.status === 'pausada').length;
  const totalEnrollments = Object.values(enrollmentCounts).reduce((s, c) => s + c, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Route className="h-6 w-6 text-primary" /> Jornadas do Jogador
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie fluxos multi-passo: evento de entrada, atrasos, ações e condições
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" /> Nova Jornada
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Jornada' : 'Nova Jornada'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Name / Description */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome</Label>
                  <Input
                    className="bg-secondary border-border"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Onboarding Novo Jogador"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="ativa">Ativa</SelectItem>
                      <SelectItem value="pausada">Pausada</SelectItem>
                      <SelectItem value="encerrada">Encerrada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Descrição</Label>
                <Textarea
                  className="bg-secondary border-border"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Descreva o objetivo desta jornada..."
                  rows={2}
                />
              </div>

              {/* Entry event */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Evento de Entrada</Label>
                  <Select value={form.entry_event} onValueChange={v => setForm(f => ({ ...f, entry_event: v }))}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTRY_EVENTS.map(e => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Máx. entradas por jogador</Label>
                  <Input
                    className="bg-secondary border-border"
                    type="number"
                    min="1"
                    value={form.max_entries_per_player}
                    onChange={e => setForm(f => ({ ...f, max_entries_per_player: e.target.value }))}
                  />
                </div>
              </div>

              {/* Segment filter */}
              <div>
                <Label>Filtrar por Segmento (opcional)</Label>
                <Select value={form.segment_id || '__none__'} onValueChange={v => setForm(f => ({ ...f, segment_id: v === '__none__' ? '' : v }))}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Todos os jogadores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Todos os jogadores</SelectItem>
                    {segments.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Entry conditions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Condições de Entrada (opcional)</Label>
                  <button
                    onClick={() => setForm(f => ({ ...f, entry_match_type: f.entry_match_type === 'all' ? 'any' : 'all' }))}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      form.entry_match_type === 'all' ? 'bg-primary/20 text-primary' : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {form.entry_match_type === 'all' ? 'TODAS (E)' : 'QUALQUER (OU)'}
                  </button>
                </div>

                {form.entry_conditions.map((cond, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <Select value={cond.field} onValueChange={v => updateCondition(idx, { field: v })}>
                      <SelectTrigger className="h-8 w-44 text-xs bg-secondary border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITION_FIELDS.map(f => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={cond.operator} onValueChange={v => updateCondition(idx, { operator: v })}>
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
                      onChange={e => updateCondition(idx, { value: e.target.value })}
                      placeholder="valor"
                      className="h-8 w-24 text-xs font-mono bg-secondary border-border"
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeCondition(idx)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addCondition} className="text-xs border-dashed">
                  <Plus className="w-3 h-3 mr-1" /> Condição
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={!form.name.trim()}>
                {editingId ? 'Salvar' : 'Criar Jornada'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="glass-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total Jornadas</div>
            <div className="text-2xl font-bold">{totalJourneys}</div>
          </CardContent>
        </Card>
        <Card className="glass-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Ativas</div>
            <div className="text-2xl font-bold text-green-400">{activeJourneys}</div>
          </CardContent>
        </Card>
        <Card className="glass-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Pausadas</div>
            <div className="text-2xl font-bold text-amber-400">{pausedJourneys}</div>
          </CardContent>
        </Card>
        <Card className="glass-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total Inscrições</div>
            <div className="text-2xl font-bold text-primary">{totalEnrollments}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="journeys">Jornadas ({journeys.length})</TabsTrigger>
          <TabsTrigger value="logs">Log de Execuções ({logs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="journeys">
          <Card className="glass-card border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Evento Entrada</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Passos</TableHead>
                  <TableHead className="text-center">Inscrições</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journeys.map(journey => (
                  <TableRow key={journey.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{journey.name}</div>
                      {journey.description && (
                        <div className="text-[11px] text-muted-foreground truncate max-w-[250px]">{journey.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px]">
                        {ENTRY_EVENTS.find(e => e.value === journey.entry_event)?.label || journey.entry_event}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[11px] ${STATUS_COLORS[journey.status] || 'bg-secondary'}`}>
                        {STATUS_LABELS[journey.status] || journey.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm">
                      {stepCounts[journey.id] || 0}
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm">
                      {enrollmentCounts[journey.id] || 0}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Editar"
                        onClick={() => openEdit(journey)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Abrir Builder"
                        onClick={() => navigate(`/journeys/${journey.id}`)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      {journey.status !== 'encerrada' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={journey.status === 'ativa' ? 'Pausar' : 'Ativar'}
                          onClick={() => toggleStatus(journey)}
                        >
                          {journey.status === 'ativa' ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        title="Deletar"
                        onClick={() => deleteJourney(journey)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {journeys.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhuma jornada criada. Clique em "Nova Jornada" para começar.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="glass-card border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Jornada</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead className="text-center">Passo</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => {
                  const journey = journeys.find(j => j.id === log.journey_id);
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {new Date(log.executed_at).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className="text-sm">{journey?.name || log.journey_id.slice(0, 8)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4')}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">#{log.step_order}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">{log.action_type || '—'}</Badge>
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
                  );
                })}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhuma execução ainda. Ative uma jornada e inscreva jogadores.
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
