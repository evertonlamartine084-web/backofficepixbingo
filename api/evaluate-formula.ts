import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse, verifyAuth } from './_cors.js';

export const config = { runtime: 'edge' };

// ── Formula AST Types (mirrored from frontend) ──

type FormulaNode =
  | { type: 'literal'; value: number }
  | { type: 'variable'; name: string }
  | { type: 'operation'; op: '+' | '-' | '*' | '/' | '%'; left: FormulaNode; right: FormulaNode }
  | { type: 'function'; fn: 'min' | 'max' | 'round' | 'floor' | 'ceil' | 'abs'; args: FormulaNode[] }
  | { type: 'conditional'; condition: FormulaCondition; then: FormulaNode; else: FormulaNode };

interface FormulaCondition {
  left: FormulaNode;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  right: FormulaNode;
}

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

function evaluateFormula(node: FormulaNode, variables: Record<string, number>): number {
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
      const args = node.args.map(a => evaluateFormula(a, variables));
      switch (node.fn) {
        case 'min': return Math.min(...args);
        case 'max': return Math.max(...args);
        case 'round': return Math.round(args[0] ?? 0);
        case 'floor': return Math.floor(args[0] ?? 0);
        case 'ceil': return Math.ceil(args[0] ?? 0);
        case 'abs': return Math.abs(args[0] ?? 0);
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

function extractVariables(node: FormulaNode): string[] {
  const vars = new Set<string>();
  function walk(n: FormulaNode) {
    switch (n.type) {
      case 'literal': break;
      case 'variable': vars.add(n.name); break;
      case 'operation': walk(n.left); walk(n.right); break;
      case 'function': n.args.forEach(walk); break;
      case 'conditional': walk(n.condition.left); walk(n.condition.right); walk(n.then); walk(n.else); break;
    }
  }
  walk(node);
  return Array.from(vars);
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  const cors = getCorsHeaders(req);
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Auth check
  const auth = await verifyAuth(req);
  if (!auth) return json({ error: 'Não autorizado' }, 401);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Config missing' }, 500);
  const supabase = createClient(supabaseUrl, supabaseKey);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const formulaId = body.formula_id as string;
  const providedVars = (body.variables as Record<string, number>) || {};
  const cpf = body.cpf as string | undefined;

  if (!formulaId) return json({ error: 'formula_id é obrigatório' }, 400);

  // Fetch formula
  const { data: formulaRow, error: formulaError } = await supabase
    .from('formulas')
    .select('*')
    .eq('id', formulaId)
    .single();

  if (formulaError || !formulaRow) return json({ error: 'Fórmula não encontrada' }, 404);

  const formulaAst = formulaRow.formula_ast as FormulaNode;
  const formulaName = formulaRow.name as string;

  // Build variables map
  let variables: Record<string, number> = { ...providedVars };

  // If CPF provided, fetch player data and merge
  if (cpf) {
    try {
      // Fetch from player_computed_metrics
      const { data: metrics } = await supabase
        .from('player_computed_metrics')
        .select('*')
        .eq('cpf', cpf)
        .single();

      if (metrics) {
        const m = metrics as Record<string, unknown>;
        variables = {
          ...variables,
          'player.total_deposit': Number(m.total_deposit) || 0,
          'player.total_bet': Number(m.total_bet) || 0,
          'player.total_withdraw': Number(m.total_withdraw) || 0,
          'player.ggr': Number(m.ggr) || 0,
          'player.total_deposit_7d': Number(m.total_deposit_7d) || 0,
          'player.total_bet_7d': Number(m.total_bet_7d) || 0,
          'player.total_deposit_30d': Number(m.total_deposit_30d) || 0,
          'player.total_bet_30d': Number(m.total_bet_30d) || 0,
          'player.engagement_score': Number(m.engagement_score) || 0,
          'player.churn_risk': Number(m.churn_risk) || 0,
          'player.active_days_7d': Number(m.active_days_7d) || 0,
          'player.active_days_30d': Number(m.active_days_30d) || 0,
          'player.avg_bet_value': Number(m.avg_bet_value) || 0,
        };
      }

      // Fetch from player_wallets for gamification data
      const { data: wallet } = await supabase
        .from('player_wallets')
        .select('*')
        .eq('cpf', cpf)
        .single();

      if (wallet) {
        const w = wallet as Record<string, unknown>;
        variables = {
          ...variables,
          'player.level': Number(w.level) || 0,
          'player.xp': Number(w.xp) || 0,
          'player.coins': Number(w.coins) || 0,
        };
      }
    } catch {
      // Player data fetch failed — continue with provided variables only
    }
  }

  try {
    const result = evaluateFormula(formulaAst, variables);
    const variablesUsed = extractVariables(formulaAst);

    return json({
      result,
      variables_used: variablesUsed,
      formula_name: formulaName,
    });
  } catch {
    return json({ error: 'Erro ao avaliar fórmula' }, 500);
  }
}
