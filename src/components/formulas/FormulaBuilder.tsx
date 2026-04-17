import { Code, Variable } from 'lucide-react';
import { type FormulaNode, formulaToString, extractVariables, FORMULA_VARIABLES } from './formula-types';
import FormulaNodeComponent from './FormulaNodeComponent';

interface FormulaBuilderProps {
  value: FormulaNode;
  onChange: (node: FormulaNode) => void;
}

export default function FormulaBuilder({ value, onChange }: FormulaBuilderProps) {
  const formulaText = formulaToString(value);
  const usedVars = extractVariables(value);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Editor Visual</label>
        <div className="p-3 rounded-lg bg-secondary/30 border border-border">
          <FormulaNodeComponent node={value} onChange={onChange} depth={0} />
        </div>
      </div>

      {/* Human-readable formula */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3">
        <div className="flex items-center gap-2 mb-1">
          <Code className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fórmula</span>
        </div>
        <p className="font-mono text-sm text-foreground break-all">{formulaText}</p>
      </div>

      {/* Variables used */}
      {usedVars.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Variable className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Variáveis Utilizadas</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {usedVars.map(v => {
              const info = FORMULA_VARIABLES.find(fv => fv.name === v);
              return (
                <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-mono">
                  {info ? info.label : v}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
