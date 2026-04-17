import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { type FormulaNode, type FormulaCondition, FORMULA_VARIABLES, createEmptyNode } from './formula-types';

const NODE_TYPES: { value: FormulaNode['type']; label: string }[] = [
  { value: 'literal', label: 'Número' },
  { value: 'variable', label: 'Variável' },
  { value: 'operation', label: 'Operação' },
  { value: 'function', label: 'Função' },
  { value: 'conditional', label: 'Condicional' },
];

const OPERATORS: { value: string; label: string }[] = [
  { value: '+', label: '+' },
  { value: '-', label: '-' },
  { value: '*', label: '*' },
  { value: '/', label: '/' },
  { value: '%', label: '%' },
];

const FUNCTIONS = [
  { value: 'min', label: 'min' },
  { value: 'max', label: 'max' },
  { value: 'round', label: 'round' },
  { value: 'floor', label: 'floor' },
  { value: 'ceil', label: 'ceil' },
  { value: 'abs', label: 'abs' },
];

const CONDITION_OPERATORS: { value: FormulaCondition['operator']; label: string }[] = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '==', label: '==' },
  { value: '!=', label: '!=' },
];

// Group variables by category
const groupedVariables = FORMULA_VARIABLES.reduce<Record<string, typeof FORMULA_VARIABLES>>((acc, v) => {
  if (!acc[v.category]) acc[v.category] = [];
  acc[v.category].push(v);
  return acc;
}, {});

const depthColors = [
  'border-primary/30 bg-primary/5',
  'border-blue-500/30 bg-blue-500/5',
  'border-purple-500/30 bg-purple-500/5',
  'border-amber-500/30 bg-amber-500/5',
  'border-emerald-500/30 bg-emerald-500/5',
];

interface FormulaNodeProps {
  node: FormulaNode;
  onChange: (node: FormulaNode) => void;
  depth: number;
}

export default function FormulaNodeComponent({ node, onChange, depth }: FormulaNodeProps) {
  const colorClass = depthColors[depth % depthColors.length];

  const handleTypeChange = (newType: string) => {
    onChange(createEmptyNode(newType as FormulaNode['type']));
  };

  const renderNodeContent = () => {
    switch (node.type) {
      case 'literal':
        return (
          <Input
            type="number"
            step="any"
            value={node.value}
            onChange={e => onChange({ ...node, value: parseFloat(e.target.value) || 0 })}
            className="w-28 bg-secondary border-border h-8 text-sm"
          />
        );

      case 'variable':
        return (
          <Select value={node.name} onValueChange={name => onChange({ ...node, name })}>
            <SelectTrigger className="w-56 bg-secondary border-border h-8 text-sm">
              <SelectValue placeholder="Selecione variável" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border max-h-64">
              {Object.entries(groupedVariables).map(([category, vars]) => (
                <SelectGroup key={category}>
                  <SelectLabel className="text-xs text-muted-foreground">{category}</SelectLabel>
                  {vars.map(v => (
                    <SelectItem key={v.name} value={v.name} className="text-sm">{v.label}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        );

      case 'operation':
        return (
          <div className="flex flex-wrap items-center gap-2">
            <FormulaNodeComponent node={node.left} onChange={left => onChange({ ...node, left })} depth={depth + 1} />
            <Select value={node.op} onValueChange={op => onChange({ ...node, op: op as typeof node.op })}>
              <SelectTrigger className="w-16 bg-secondary border-border h-8 text-sm font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {OPERATORS.map(o => (
                  <SelectItem key={o.value} value={o.value} className="font-mono">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormulaNodeComponent node={node.right} onChange={right => onChange({ ...node, right })} depth={depth + 1} />
          </div>
        );

      case 'function': {
        const addArg = () => onChange({ ...node, args: [...node.args, { type: 'literal', value: 0 }] });
        const removeArg = (idx: number) => {
          if (node.args.length <= 1) return;
          onChange({ ...node, args: node.args.filter((_, i) => i !== idx) });
        };
        const updateArg = (idx: number, newArg: FormulaNode) => {
          onChange({ ...node, args: node.args.map((a, i) => i === idx ? newArg : a) });
        };

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Select value={node.fn} onValueChange={fn => onChange({ ...node, fn: fn as typeof node.fn })}>
                <SelectTrigger className="w-28 bg-secondary border-border h-8 text-sm font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {FUNCTIONS.map(f => (
                    <SelectItem key={f.value} value={f.value} className="font-mono">{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground font-mono text-sm">(</span>
            </div>
            <div className="ml-4 space-y-2">
              {node.args.map((arg, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <FormulaNodeComponent node={arg} onChange={n => updateArg(idx, n)} depth={depth + 1} />
                  {node.args.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeArg(idx)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                  {idx < node.args.length - 1 && <span className="text-muted-foreground font-mono text-sm">,</span>}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-mono text-sm">)</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={addArg}>
                <Plus className="w-3 h-3 mr-1" /> Argumento
              </Button>
            </div>
          </div>
        );
      }

      case 'conditional':
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-primary uppercase tracking-wide">SE</span>
              <FormulaNodeComponent
                node={node.condition.left}
                onChange={left => onChange({ ...node, condition: { ...node.condition, left } })}
                depth={depth + 1}
              />
              <Select
                value={node.condition.operator}
                onValueChange={operator => onChange({ ...node, condition: { ...node.condition, operator: operator as FormulaCondition['operator'] } })}
              >
                <SelectTrigger className="w-16 bg-secondary border-border h-8 text-sm font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {CONDITION_OPERATORS.map(o => (
                    <SelectItem key={o.value} value={o.value} className="font-mono">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormulaNodeComponent
                node={node.condition.right}
                onChange={right => onChange({ ...node, condition: { ...node.condition, right } })}
                depth={depth + 1}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 ml-4">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">ENTÃO</span>
              <FormulaNodeComponent node={node.then} onChange={thenNode => onChange({ ...node, then: thenNode })} depth={depth + 1} />
            </div>
            <div className="flex flex-wrap items-center gap-2 ml-4">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">SENÃO</span>
              <FormulaNodeComponent node={node.else} onChange={elseNode => onChange({ ...node, else: elseNode })} depth={depth + 1} />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`rounded-lg border p-2 ${colorClass}`}>
      <div className="flex items-center gap-2 mb-1">
        <Select value={node.type} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-32 bg-secondary border-border h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {NODE_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {renderNodeContent()}
    </div>
  );
}
