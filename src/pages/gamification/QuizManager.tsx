import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Trash2, Edit2, Loader2, HelpCircle, Clock, Star,
  CheckCircle2, XCircle, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { logAudit } from '@/hooks/use-audit';

interface QuizQuestion {
  id: string;
  game_id: string;
  question: string;
  options: QuizOption[];
  time_limit_seconds: number;
  points: number;
  explanation: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
}

interface QuizOption {
  text: string;
  is_correct: boolean;
}

interface MiniGame {
  id: string;
  name: string;
  type: string;
}

interface PlayerResult {
  id: string;
  cpf: string;
  score: number;
  correct_answers: number;
  time_taken_ms: number;
  reward_type: string | null;
  reward_value: number;
  played_at: string;
}

const emptyOption = (): QuizOption => ({ text: '', is_correct: false });

const emptyForm = {
  question: '',
  options: [emptyOption(), emptyOption()] as QuizOption[],
  time_limit_seconds: '30',
  points: '10',
  explanation: '',
  sort_order: '0',
};

export default function QuizManager() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const gameId = searchParams.get('gameId') || '';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Fetch game info
  const { data: game } = useQuery({
    queryKey: ['mini_game', gameId],
    enabled: !!gameId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mini_games' as 'segments')
        .select('id, name, type')
        .eq('id', gameId)
        .single();
      if (error) throw error;
      return data as unknown as MiniGame;
    },
  });

  // Fetch questions
  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['quiz_questions', gameId],
    enabled: !!gameId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quiz_questions' as 'segments')
        .select('*')
        .eq('game_id', gameId)
        .order('sort_order');
      if (error) throw error;
      return data as unknown as QuizQuestion[];
    },
  });

  // Fetch results
  const { data: results = [] } = useQuery({
    queryKey: ['quiz_results', gameId],
    enabled: !!gameId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_mini_game_results' as 'segments')
        .select('*')
        .eq('game_id', gameId)
        .eq('game_type', 'quiz')
        .order('played_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as PlayerResult[];
    },
  });

  // Stats
  const activeQuestions = questions.filter(q => q.active);
  const totalPoints = activeQuestions.reduce((s, q) => s + (q.points || 0), 0);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const hasCorrect = form.options.some(o => o.is_correct);
      if (!hasCorrect) throw new Error('Selecione pelo menos uma opção correta');
      if (form.options.some(o => !o.text.trim())) throw new Error('Todas as opções devem ter texto');

      const payload = {
        game_id: gameId,
        question: form.question,
        options: form.options,
        time_limit_seconds: parseInt(form.time_limit_seconds) || 30,
        points: parseInt(form.points) || 10,
        explanation: form.explanation || null,
        sort_order: parseInt(form.sort_order) || 0,
      };

      if (editId) {
        const { error } = await supabase
          .from('quiz_questions' as 'segments')
          .update(payload as Record<string, unknown>)
          .eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('quiz_questions' as 'segments')
          .insert(payload as Record<string, unknown>);
        if (error) throw error;
      }
      await logAudit({
        action: editId ? 'EDITAR' : 'CRIAR',
        resource_type: 'quiz_question',
        resource_name: form.question.slice(0, 60),
      });
    },
    onSuccess: () => {
      toast.success(editId ? 'Pergunta atualizada!' : 'Pergunta criada!');
      qc.invalidateQueries({ queryKey: ['quiz_questions', gameId] });
      setDialogOpen(false);
      setEditId(null);
      setForm(emptyForm);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('quiz_questions' as 'segments')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await logAudit({ action: 'EXCLUIR', resource_type: 'quiz_question', resource_id: id });
    },
    onSuccess: () => {
      toast.success('Pergunta excluída!');
      qc.invalidateQueries({ queryKey: ['quiz_questions', gameId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('quiz_questions' as 'segments')
        .update({ active } as Record<string, unknown>)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quiz_questions', gameId] }),
  });

  const openEdit = (q: QuizQuestion) => {
    setEditId(q.id);
    setForm({
      question: q.question,
      options: q.options && q.options.length > 0 ? q.options : [emptyOption(), emptyOption()],
      time_limit_seconds: String(q.time_limit_seconds || 30),
      points: String(q.points || 10),
      explanation: q.explanation || '',
      sort_order: String(q.sort_order || 0),
    });
    setDialogOpen(true);
  };

  const addOption = () => {
    if (form.options.length >= 6) return;
    setForm(f => ({ ...f, options: [...f.options, emptyOption()] }));
  };

  const removeOption = (idx: number) => {
    if (form.options.length <= 2) return;
    setForm(f => ({ ...f, options: f.options.filter((_, i) => i !== idx) }));
  };

  const setOptionText = (idx: number, text: string) => {
    setForm(f => ({
      ...f,
      options: f.options.map((o, i) => i === idx ? { ...o, text } : o),
    }));
  };

  const setCorrectOption = (idx: number) => {
    setForm(f => ({
      ...f,
      options: f.options.map((o, i) => ({ ...o, is_correct: i === idx })),
    }));
  };

  if (!gameId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <p>Nenhum gameId fornecido. Volte para Mini Games.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/gamification/mini-games')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <HelpCircle className="w-6 h-6 text-primary" /> Gerenciar Quiz
            </h1>
            {game && <p className="text-sm text-muted-foreground mt-0.5">{game.name}</p>}
          </div>
        </div>
        <Button
          onClick={() => { setEditId(null); setForm(emptyForm); setDialogOpen(true); }}
          className="gradient-primary border-0"
        >
          <Plus className="w-4 h-4 mr-2" /> Nova Pergunta
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="glass-card border-border">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{questions.length}</div>
            <div className="text-xs text-muted-foreground">Total de Perguntas</div>
          </CardContent>
        </Card>
        <Card className="glass-card border-border">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{activeQuestions.length}</div>
            <div className="text-xs text-muted-foreground">Perguntas Ativas</div>
          </CardContent>
        </Card>
        <Card className="glass-card border-border">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{totalPoints}</div>
            <div className="text-xs text-muted-foreground">Pontos Possíveis</div>
          </CardContent>
        </Card>
      </div>

      {/* Questions List */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : questions.length === 0 ? (
        <Card className="glass-card border-border">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Nenhuma pergunta criada. Clique em "Nova Pergunta" para adicionar.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => {
            const correctIdx = q.options.findIndex(o => o.is_correct);
            return (
              <Card key={q.id} className={`glass-card border-border ${!q.active ? 'opacity-50' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px]">#{q.sort_order}</Badge>
                        <span className="font-semibold text-foreground truncate">{q.question}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {q.options.length} opções
                        </Badge>
                        {correctIdx >= 0 && (
                          <Badge className="bg-green-500/20 text-green-400 text-[10px]">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Correta: opção {correctIdx + 1}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          <Clock className="w-3 h-3 mr-1" /> {q.time_limit_seconds}s
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          <Star className="w-3 h-3 mr-1" /> {q.points} pts
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={q.active}
                        onCheckedChange={(v) => toggleActiveMutation.mutate({ id: q.id, active: v })}
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(q)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => { if (confirm('Excluir esta pergunta?')) deleteMutation.mutate(q.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Resultados Recentes
          </h3>
          <Card className="glass-card border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-xs">CPF</TableHead>
                  <TableHead className="text-xs text-right">Pontuação</TableHead>
                  <TableHead className="text-xs text-right">Acertos</TableHead>
                  <TableHead className="text-xs text-right">Tempo</TableHead>
                  <TableHead className="text-xs">Recompensa</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map(r => (
                  <TableRow key={r.id} className="border-border">
                    <TableCell className="text-sm font-mono">{r.cpf}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{r.score}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{r.correct_answers}</TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {r.time_taken_ms > 0 ? `${(r.time_taken_ms / 1000).toFixed(1)}s` : '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.reward_type ? `${r.reward_type}: ${r.reward_value}` : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.played_at).toLocaleString('pt-BR')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Add/Edit Question Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-background border-border max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Pergunta' : 'Nova Pergunta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Pergunta</Label>
              <Textarea
                className="bg-secondary border-border"
                rows={3}
                value={form.question}
                onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                placeholder="Digite a pergunta..."
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Opções (selecione a correta)</Label>
              {form.options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct_option"
                    checked={opt.is_correct}
                    onChange={() => setCorrectOption(idx)}
                    className="accent-primary"
                  />
                  <Input
                    className="bg-secondary border-border flex-1"
                    value={opt.text}
                    onChange={e => setOptionText(idx, e.target.value)}
                    placeholder={`Opção ${idx + 1}`}
                  />
                  {form.options.length > 2 && (
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0"
                      onClick={() => removeOption(idx)}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              {form.options.length < 6 && (
                <Button variant="outline" size="sm" onClick={addOption}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Opção
                </Button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Tempo limite (s)</Label>
                <Input
                  type="number" min="5" max="120"
                  className="bg-secondary border-border"
                  value={form.time_limit_seconds}
                  onChange={e => setForm(f => ({ ...f, time_limit_seconds: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Pontos</Label>
                <Input
                  type="number" min="1"
                  className="bg-secondary border-border"
                  value={form.points}
                  onChange={e => setForm(f => ({ ...f, points: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Ordem</Label>
                <Input
                  type="number" min="0"
                  className="bg-secondary border-border"
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Explicação (opcional)</Label>
              <Textarea
                className="bg-secondary border-border"
                rows={2}
                value={form.explanation}
                onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))}
                placeholder="Exibida após o jogador responder..."
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.question.trim() || saveMutation.isPending}
              className="gradient-primary border-0"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
