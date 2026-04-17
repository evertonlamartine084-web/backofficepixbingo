import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calculator, Plus, Trash2, Edit, Power, PowerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAudit } from '@/hooks/use-audit';
import FormulaBuilder from '@/components/formulas/FormulaBuilder';
import FormulaTestPanel from '@/components/formulas/FormulaTestPanel';
import { type FormulaNode, type Formula, extractVariables, createEmptyNode } from '@/components/formulas/formula-types';

const CATEGORIES = [
  { value: 'cashback', label: 'Cashback', color: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'bonus', label: 'Bônus', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'xp', label: 'XP', color: 'bg-purple-500/20 text-purple-400' },
  { value: 'reward', label: 'Recompensa', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'custom', label: 'Customizada', color: 'bg-zinc-500/20 text-zinc-400' },
];

function getCategoryBadge(cat: string) {
  const info = CATEGORIES.find(c => c.value === cat) || CATEGORIES[4];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}>{info.label}</span>;
}

const DEFAULT_AST: FormulaNode = createEmptyNode('operation');

interface FormState {
  name: string;
  description: string;
  category: string;
  active: boolean;
  formula_ast: FormulaNode;
}

const emptyForm: FormState = {
  name: '',
  description: '',
  category: 'custom',
  active: true,
  formula_ast: DEFAULT_AST,
};

export default function Formulas() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  // Fetch formulas
  const { data: formulas, isLoading } = useQuery({
    queryKey: ['formulas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('formulas' as 'segments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown) as Formula[];
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error('Preencha o nome da fórmula');
      const variables_used = extractVariables(form.formula_ast);
      const payload = {
        name: form.name,
        description: form.description || null,
        category: form.category,
        active: form.active,
        formula_ast: form.formula_ast,
        variables_used,
      };
      const { error } = await supabase
        .from('formulas' as 'segments')
        .insert(payload as Record<string, unknown>);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formulas'] });
      toast.success('Fórmula criada com sucesso');
      logAudit({ action: 'CRIAR', resource_type: 'formula', resource_name: form.name });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId || !form.name) throw new Error('Preencha o nome da fórmula');
      const variables_used = extractVariables(form.formula_ast);
      const payload = {
        name: form.name,
        description: form.description || null,
        category: form.category,
        active: form.active,
        formula_ast: form.formula_ast,
        variables_used,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('formulas' as 'segments')
        .update(payload as Record<string, unknown>)
        .eq('id', editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formulas'] });
      toast.success('Fórmula atualizada');
      logAudit({ action: 'EDITAR', resource_type: 'formula', resource_name: form.name });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const formula = formulas?.find(f => f.id === id);
      const { error } = await supabase
        .from('formulas' as 'segments')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return formula;
    },
    onSuccess: (formula) => {
      queryClient.invalidateQueries({ queryKey: ['formulas'] });
      toast.success('Fórmula excluída');
      logAudit({ action: 'EXCLUIR', resource_type: 'formula', resource_name: formula?.name });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Toggle active mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('formulas' as 'segments')
        .update({ active, updated_at: new Date().toISOString() } as Record<string, unknown>)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formulas'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeDialog = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (formula: Formula) => {
    setEditingId(formula.id);
    setForm({
      name: formula.name,
      description: formula.description || '',
      category: formula.category,
      active: formula.active,
      formula_ast: formula.formula_ast,
    });
    setOpen(true);
  };

  const handleSave = () => {
    if (editingId) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const items = formulas || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calculator className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Fórmulas Dinâmicas</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Crie e gerencie fórmulas de cálculo para cashback, bônus, XP e recompensas</p>
            </div>
          </div>
        </div>
        <Button className="gradient-primary border-0" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Nova Fórmula
        </Button>
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Calculator className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhuma fórmula cadastrada.</p>
          <Button className="gradient-primary border-0 mt-4" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Criar Primeira Fórmula
          </Button>
        </div>
      ) : (
        <div className="glass-card border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Nome</TableHead>
                <TableHead className="text-muted-foreground">Categoria</TableHead>
                <TableHead className="text-muted-foreground">Variáveis</TableHead>
                <TableHead className="text-muted-foreground">Último Teste</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(formula => (
                <TableRow key={formula.id} className="border-border">
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{formula.name}</p>
                      {formula.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{formula.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getCategoryBadge(formula.category)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-48">
                      {(formula.variables_used || []).slice(0, 3).map(v => (
                        <span key={v} className="px-1.5 py-0.5 rounded bg-secondary text-[10px] font-mono text-muted-foreground">
                          {v.split('.').pop()}
                        </span>
                      ))}
                      {(formula.variables_used || []).length > 3 && (
                        <span className="px-1.5 py-0.5 rounded bg-secondary text-[10px] text-muted-foreground">
                          +{formula.variables_used.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {formula.test_output !== null && formula.test_output !== undefined ? (
                      <span className="font-mono text-sm text-foreground">
                        {Number(formula.test_output).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleMutation.mutate({ id: formula.id, active: !formula.active })}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                        formula.active
                          ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                          : 'bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30'
                      }`}
                    >
                      {formula.active ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                      {formula.active ? 'Ativa' : 'Inativa'}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(formula)}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => { if (confirm('Excluir esta fórmula?')) deleteMutation.mutate(formula.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={v => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="glass-card border-border sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingId ? 'Editar Fórmula' : 'Nova Fórmula'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-foreground">Nome</Label>
                <Input
                  placeholder="Ex: Cashback Progressivo"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 bg-secondary border-border"
                />
              </div>
              <div>
                <Label className="text-foreground">Categoria</Label>
                <Select value={form.category} onValueChange={category => setForm(f => ({ ...f, category }))}>
                  <SelectTrigger className="mt-1 bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-foreground">Descrição</Label>
              <Textarea
                placeholder="Descreva o objetivo desta fórmula..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="mt-1 bg-secondary border-border resize-none"
                rows={2}
              />
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3">
              <Switch
                checked={form.active}
                onCheckedChange={active => setForm(f => ({ ...f, active }))}
              />
              <Label className="text-foreground">{form.active ? 'Ativa' : 'Inativa'}</Label>
            </div>

            {/* Formula Builder */}
            <div>
              <Label className="text-foreground text-base font-semibold mb-3 block">Construtor de Fórmula</Label>
              <FormulaBuilder
                value={form.formula_ast}
                onChange={formula_ast => setForm(f => ({ ...f, formula_ast }))}
              />
            </div>

            {/* Test Panel */}
            <div>
              <Label className="text-foreground text-base font-semibold mb-3 block">Teste</Label>
              <FormulaTestPanel formulaAst={form.formula_ast} />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button
              className="gradient-primary border-0"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Fórmula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
