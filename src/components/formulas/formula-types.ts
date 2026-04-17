// FormulaNode types - AST structure
export type FormulaNode =
  | { type: 'literal'; value: number }
  | { type: 'variable'; name: string }
  | { type: 'operation'; op: '+' | '-' | '*' | '/' | '%'; left: FormulaNode; right: FormulaNode }
  | { type: 'function'; fn: 'min' | 'max' | 'round' | 'floor' | 'ceil' | 'abs'; args: FormulaNode[] }
  | { type: 'conditional'; condition: FormulaCondition; then: FormulaNode; else: FormulaNode };

export interface FormulaCondition {
  left: FormulaNode;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  right: FormulaNode;
}

export interface Formula {
  id: string;
  name: string;
  description: string | null;
  category: 'cashback' | 'bonus' | 'xp' | 'reward' | 'custom';
  formula_ast: FormulaNode;
  variables_used: string[];
  test_input: Record<string, number>;
  test_output: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// Available variables that can be referenced in formulas
export const FORMULA_VARIABLES = [
  { name: 'player.total_deposit', label: 'Total Depósitos (R$)', category: 'Financeiro' },
  { name: 'player.total_bet', label: 'Total Apostas (R$)', category: 'Financeiro' },
  { name: 'player.total_withdraw', label: 'Total Saques (R$)', category: 'Financeiro' },
  { name: 'player.ggr', label: 'GGR (R$)', category: 'Financeiro' },
  { name: 'player.total_deposit_7d', label: 'Depósitos 7d (R$)', category: 'Financeiro' },
  { name: 'player.total_bet_7d', label: 'Apostas 7d (R$)', category: 'Financeiro' },
  { name: 'player.total_deposit_30d', label: 'Depósitos 30d (R$)', category: 'Financeiro' },
  { name: 'player.total_bet_30d', label: 'Apostas 30d (R$)', category: 'Financeiro' },
  { name: 'player.level', label: 'Nível', category: 'Gamificação' },
  { name: 'player.xp', label: 'XP Atual', category: 'Gamificação' },
  { name: 'player.coins', label: 'Moedas', category: 'Gamificação' },
  { name: 'player.engagement_score', label: 'Score Engajamento', category: 'Comportamento' },
  { name: 'player.churn_risk', label: 'Risco de Churn', category: 'Comportamento' },
  { name: 'player.active_days_7d', label: 'Dias Ativos 7d', category: 'Comportamento' },
  { name: 'player.active_days_30d', label: 'Dias Ativos 30d', category: 'Comportamento' },
  { name: 'player.avg_bet_value', label: 'Aposta Média (R$)', category: 'Comportamento' },
  { name: 'input.amount', label: 'Valor de Entrada', category: 'Input' },
  { name: 'input.count', label: 'Quantidade de Entrada', category: 'Input' },
];

// Extract all variable names used in a formula AST
export function extractVariables(node: FormulaNode): string[] {
  const vars = new Set<string>();

  function walk(n: FormulaNode) {
    switch (n.type) {
      case 'literal':
        break;
      case 'variable':
        vars.add(n.name);
        break;
      case 'operation':
        walk(n.left);
        walk(n.right);
        break;
      case 'function':
        n.args.forEach(walk);
        break;
      case 'conditional':
        walk(n.condition.left);
        walk(n.condition.right);
        walk(n.then);
        walk(n.else);
        break;
    }
  }

  walk(node);
  return Array.from(vars);
}

// Evaluate a condition
function evaluateCondition(cond: FormulaCondition, variables: Record<string, number>): boolean {
  const left = evaluateFormula(cond.left, variables);
  const right = evaluateFormula(cond.right, variables);
  switch (cond.operator) {
    case '>': return left > right;
    case '<': return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '==': return left === right;
    case '!=': return left !== right;
    default: return false;
  }
}

// Evaluate formula AST with given variable values
export function evaluateFormula(node: FormulaNode, variables: Record<string, number>): number {
  switch (node.type) {
    case 'literal':
      return node.value;

    case 'variable':
      return variables[node.name] ?? 0;

    case 'operation': {
      const left = evaluateFormula(node.left, variables);
      const right = evaluateFormula(node.right, variables);
      switch (node.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return right === 0 ? 0 : left / right;
        case '%': return right === 0 ? 0 : left % right;
        default: return 0;
      }
    }

    case 'function': {
      const evaluatedArgs = node.args.map(a => evaluateFormula(a, variables));
      switch (node.fn) {
        case 'min': return Math.min(...evaluatedArgs);
        case 'max': return Math.max(...evaluatedArgs);
        case 'round': return Math.round(evaluatedArgs[0] ?? 0);
        case 'floor': return Math.floor(evaluatedArgs[0] ?? 0);
        case 'ceil': return Math.ceil(evaluatedArgs[0] ?? 0);
        case 'abs': return Math.abs(evaluatedArgs[0] ?? 0);
        default: return 0;
      }
    }

    case 'conditional':
      return evaluateCondition(node.condition, variables)
        ? evaluateFormula(node.then, variables)
        : evaluateFormula(node.else, variables);

    default:
      return 0;
  }
}

// Convert AST to human-readable string
export function formulaToString(node: FormulaNode): string {
  switch (node.type) {
    case 'literal':
      return String(node.value);

    case 'variable':
      return node.name;

    case 'operation': {
      const left = formulaToString(node.left);
      const right = formulaToString(node.right);
      // Wrap child operations in parens for clarity
      const wrapLeft = node.left.type === 'operation' ? `(${left})` : left;
      const wrapRight = node.right.type === 'operation' ? `(${right})` : right;
      return `${wrapLeft} ${node.op} ${wrapRight}`;
    }

    case 'function': {
      const argsStr = node.args.map(a => formulaToString(a)).join(', ');
      return `${node.fn}(${argsStr})`;
    }

    case 'conditional': {
      const condLeft = formulaToString(node.condition.left);
      const condRight = formulaToString(node.condition.right);
      const thenStr = formulaToString(node.then);
      const elseStr = formulaToString(node.else);
      return `SE ${condLeft} ${node.condition.operator} ${condRight} ENTÃO ${thenStr} SENÃO ${elseStr}`;
    }

    default:
      return '?';
  }
}

// Create empty nodes for each type
export function createEmptyNode(type: FormulaNode['type']): FormulaNode {
  switch (type) {
    case 'literal':
      return { type: 'literal', value: 0 };
    case 'variable':
      return { type: 'variable', name: 'input.amount' };
    case 'operation':
      return {
        type: 'operation',
        op: '*',
        left: { type: 'literal', value: 0 },
        right: { type: 'literal', value: 0 },
      };
    case 'function':
      return {
        type: 'function',
        fn: 'min',
        args: [{ type: 'literal', value: 0 }],
      };
    case 'conditional':
      return {
        type: 'conditional',
        condition: {
          left: { type: 'variable', name: 'input.amount' },
          operator: '>',
          right: { type: 'literal', value: 0 },
        },
        then: { type: 'literal', value: 0 },
        else: { type: 'literal', value: 0 },
      };
    default:
      return { type: 'literal', value: 0 };
  }
}
