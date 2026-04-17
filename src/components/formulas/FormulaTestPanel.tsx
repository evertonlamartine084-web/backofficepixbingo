import { useState } from 'react';
import { FlaskConical, Play } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { type FormulaNode, extractVariables, evaluateFormula, formulaToString, FORMULA_VARIABLES } from './formula-types';

interface FormulaTestPanelProps {
  formulaAst: FormulaNode;
}

export default function FormulaTestPanel({ formulaAst }: FormulaTestPanelProps) {
  const usedVars = extractVariables(formulaAst);
  const [values, setValues] = useState<Record<string, number>>({});
  const [result, setResult] = useState<number | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const handleTest = () => {
    try {
      const r = evaluateFormula(formulaAst, values);
      setResult(r);
      setHasRun(true);
    } catch {
      setResult(null);
      setHasRun(true);
    }
  };

  const updateValue = (varName: string, val: string) => {
    setValues(prev => ({ ...prev, [varName]: parseFloat(val) || 0 }));
    setHasRun(false);
  };

  if (usedVars.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-secondary/20 p-4 text-center">
        <FlaskConical className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Adicione variáveis à fórmula para poder testar.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Painel de Teste</span>
      </div>

      {/* Formula text */}
      <div className="rounded bg-secondary/50 p-2">
        <p className="font-mono text-xs text-muted-foreground break-all">{formulaToString(formulaAst)}</p>
      </div>

      {/* Variable inputs */}
      <div className="grid grid-cols-2 gap-3">
        {usedVars.map(varName => {
          const info = FORMULA_VARIABLES.find(fv => fv.name === varName);
          return (
            <div key={varName}>
              <Label className="text-xs text-muted-foreground">{info ? info.label : varName}</Label>
              <Input
                type="number"
                step="any"
                placeholder="0"
                value={values[varName] ?? ''}
                onChange={e => updateValue(varName, e.target.value)}
                className="mt-1 bg-secondary border-border h-8 text-sm"
              />
            </div>
          );
        })}
      </div>

      {/* Test button */}
      <Button onClick={handleTest} className="gradient-primary border-0 w-full" size="sm">
        <Play className="w-4 h-4 mr-2" /> Testar
      </Button>

      {/* Result */}
      {hasRun && (
        <div className={`rounded-lg p-4 text-center ${result !== null ? 'bg-primary/10 border border-primary/30' : 'bg-destructive/10 border border-destructive/30'}`}>
          {result !== null ? (
            <>
              <p className="text-xs text-muted-foreground mb-1">Resultado</p>
              <p className="text-2xl font-bold text-primary font-mono">{result.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</p>
            </>
          ) : (
            <p className="text-sm text-destructive">Erro ao avaliar fórmula</p>
          )}
        </div>
      )}
    </div>
  );
}
