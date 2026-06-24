import { Plus, X, Filter, ChevronDown } from 'lucide-react';
import type { SetStateAction } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RULE_FIELDS, OPERATORS_NUMBER, OPERATORS_DAYS, OPERATORS_TEXT, OPERATORS_MEMBERSHIP, OPERATORS_MULTI, OPERATORS_DEFINED, OPERATORS_YESNO, generateId } from './types';
import type { SegmentRule, RuleFieldDef } from './types';

interface LevelRow { level: number; name: string }
interface MissionRow { id: string; name: string }
type Opt = { value: string; label: string };

/** Operadores disponíveis por campo (compõe os conjuntos conforme o tipo). */
function getOperators(fieldDef: RuleFieldDef | undefined, hasOptions: boolean): Opt[] {
  if (!fieldDef) return OPERATORS_NUMBER;
  if (fieldDef.type === 'days') return OPERATORS_DAYS;
  if (fieldDef.type === 'yesno') return OPERATORS_YESNO;
  if (fieldDef.type === 'mission') return [...OPERATORS_MEMBERSHIP, ...OPERATORS_MULTI];
  if (fieldDef.type === 'text') return [...OPERATORS_TEXT, ...OPERATORS_MULTI, ...OPERATORS_DEFINED];
  return hasOptions ? [...OPERATORS_NUMBER, ...OPERATORS_MULTI] : OPERATORS_NUMBER; // number
}

/** Multi-seleção (checkboxes) pro operador "é um de / não é um de". value = lista por vírgula. */
function MultiSelectValue({ options, value, onChange }: { options: Opt[]; value: string; onChange: (v: string) => void }) {
  const selected = value ? value.split(',').filter(Boolean) : [];
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v];
    onChange(next.join(','));
  };
  const label = selected.length === 0 ? 'selecione...'
    : selected.length === 1 ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
    : `${selected.length} selecionados`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-8 w-44 justify-between text-xs bg-background border-border font-normal">
          <span className="truncate">{label}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1 max-h-72 overflow-auto" align="start">
        {options.map(o => (
          <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-secondary rounded cursor-pointer">
            <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

interface SegmentRuleBuilderProps {
  rules: SegmentRule[];
  setRules: (r: SetStateAction<SegmentRule[]>) => void;
  matchType: 'all' | 'any';
  setMatchType: (m: 'all' | 'any') => void;
}

export function SegmentRuleBuilder({ rules, setRules, matchType, setMatchType }: SegmentRuleBuilderProps) {
  const addRule = () => setRules(prev => [...prev, { id: generateId(), field: 'level', operator: 'gte', value: '' }]);
  const removeRule = (id: string) => setRules(prev => prev.filter(r => r.id !== id));
  const updateRule = (id: string, updates: Partial<SegmentRule>) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const categories = [...new Set(RULE_FIELDS.map(f => f.category))];

  // Níveis vêm do banco (são dinâmicos) → dropdown no campo "Nivel" com nome do nível.
  const { data: levels } = useQuery({
    queryKey: ['levels_for_rules'],
    queryFn: async () => {
      const { data } = await supabase.from('levels').select('level, name').order('level', { ascending: true });
      return (data || []) as LevelRow[];
    },
    staleTime: 30 * 60 * 1000,
  });
  // Missões (id + nome) → dropdown no campo "Completou a Missao".
  const { data: missions } = useQuery({
    queryKey: ['missions_for_rules'],
    queryFn: async () => {
      const { data } = await supabase.from('missions').select('id, name').order('created_at', { ascending: false });
      return (data || []) as MissionRow[];
    },
    staleTime: 30 * 60 * 1000,
  });
  // Opções dinâmicas por campo (carregadas do banco). Estáticas ficam em RULE_FIELDS.options.
  const dynamicOptions: Record<string, { value: string; label: string }[]> = {
    level: (levels || []).map(l => ({ value: String(l.level), label: `${l.level} — ${l.name}` })),
    mission_completed: (missions || []).map(m => ({ value: m.id, label: m.name })),
  };

  return (
    <div className="space-y-3">
      {/* Match type toggle */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Jogadores que correspondem a</span>
        <button
          onClick={() => setMatchType(matchType === 'all' ? 'any' : 'all')}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            matchType === 'all'
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}
        >
          {matchType === 'all' ? 'TODAS' : 'QUALQUER'}
        </button>
        <span className="text-muted-foreground">as regras</span>
      </div>

      {/* Rules */}
      <div className="space-y-2">
        {rules.map((rule, idx) => {
          const fieldDef = RULE_FIELDS.find(f => f.value === rule.field);
          const FieldIcon = fieldDef?.icon || Filter;
          const valueOptions = fieldDef?.options ?? dynamicOptions[rule.field];
          const operators = getOperators(fieldDef, !!(valueOptions && valueOptions.length));
          const isMulti = rule.operator === 'in' || rule.operator === 'not_in';
          const isDefined = rule.operator === 'defined' || rule.operator === 'not_defined' || fieldDef?.type === 'yesno';

          return (
            <div key={rule.id} className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-border group">
              {idx > 0 && (
                <span className={`text-[10px] font-bold uppercase mr-1 ${matchType === 'all' ? 'text-primary' : 'text-amber-400'}`}>
                  {matchType === 'all' ? 'E' : 'OU'}
                </span>
              )}
              <FieldIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />

              <Select value={rule.field} onValueChange={v => {
                const newField = RULE_FIELDS.find(f => f.value === v);
                const defaultOp = newField?.type === 'days' ? 'within' : (newField?.type === 'text' || newField?.type === 'mission' || newField?.type === 'yesno') ? 'eq' : 'gte';
                updateRule(rule.id, { field: v, operator: defaultOp, value: '' });
              }}>
                <SelectTrigger className="h-8 w-44 text-xs bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <div key={cat}>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{cat}</div>
                      {RULE_FIELDS.filter(f => f.category === cat).map(f => (
                        <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>

              <Select value={rule.operator} onValueChange={v => updateRule(rule.id, { operator: v })}>
                <SelectTrigger className="h-8 w-40 text-xs bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operators.map(op => (
                    <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {isDefined ? (
                <span className="text-xs text-muted-foreground italic w-44 px-2">(sem valor)</span>
              ) : isMulti && valueOptions && valueOptions.length > 0 ? (
                <MultiSelectValue options={valueOptions} value={String(rule.value)} onChange={v => updateRule(rule.id, { value: v })} />
              ) : isMulti ? (
                <Input
                  type="text"
                  value={rule.value}
                  onChange={e => updateRule(rule.id, { value: e.target.value })}
                  placeholder="valor1, valor2, ..."
                  className="h-8 text-xs bg-background border-border font-mono w-44"
                />
              ) : valueOptions && valueOptions.length > 0 ? (
                <Select value={String(rule.value)} onValueChange={v => updateRule(rule.id, { value: v })}>
                  <SelectTrigger className="h-8 w-44 text-xs bg-background border-border">
                    <SelectValue placeholder="selecione..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {valueOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={fieldDef?.type === 'text' ? 'text' : 'number'}
                  value={rule.value}
                  onChange={e => updateRule(rule.id, { value: e.target.value })}
                  placeholder={fieldDef?.type === 'days' ? 'dias' : fieldDef?.type === 'text' ? 'nome...' : '0'}
                  className={`h-8 text-xs bg-background border-border font-mono ${fieldDef?.type === 'text' ? 'w-40' : 'w-24'}`}
                />
              )}

              {fieldDef?.type === 'days' && <span className="text-xs text-muted-foreground">dias</span>}

              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive"
                onClick={() => removeRule(rule.id)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button variant="outline" size="sm" onClick={addRule} className="border-dashed border-border text-xs">
        <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar Regra
      </Button>
    </div>
  );
}
