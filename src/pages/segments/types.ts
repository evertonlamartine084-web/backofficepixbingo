import {
  TrendingUp, DollarSign, Star, CreditCard, Gamepad2, Target, Layers, ShoppingBag, RotateCw, Calendar,
  Activity, Brain, AlertTriangle, Heart, Dice5,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface SegmentRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  segment_type?: 'manual' | 'automatic';
  rules?: SegmentRule[];
  match_type?: string;
  auto_refresh?: boolean;
  color?: string;
  icon?: string;
  member_count?: number;
  last_evaluated_at?: string;
  segment_items?: { count: number }[];
  item_count?: number;
}

export interface SegmentItemRow {
  id: string;
  cpf: string;
  cpf_masked: string;
  created_at: string;
  segment_id: string;
  source?: string;
  uuid?: string;
  username?: string;
}

export interface AllUserItem {
  id: string;
  cpf: string;
  cpf_masked: string;
  created_at: string;
  username: string;
  uuid: string;
}

export interface ProxyUserRecord {
  cpf?: string;
  username?: string;
  name?: string;
  uuid?: string;
  created_at?: string;
}

export interface WalletEntry {
  nome?: string;
  name?: string;
  tipo?: string;
  carteira?: string;
  descricao?: string;
  saldo?: unknown;
  valor?: unknown;
  value?: unknown;
  balance?: unknown;
}

export interface TransactionEntry {
  tipo?: string;
  type?: string;
  descricao?: string;
  created_at?: string;
  data?: string;
  date?: string;
}

export interface SegmentRule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

export interface RuleFieldDef {
  value: string;
  label: string;
  icon: LucideIcon;
  category: string;
  type: string;
  /** Para campos de texto com valores fixos → renderiza dropdown em vez de input livre. */
  options?: { value: string; label: string }[];
}

export const ALL_USERS_ID = '__all_users__';

export const RULE_FIELDS: RuleFieldDef[] = [
  { value: 'level', label: 'Nivel', icon: TrendingUp, category: 'Carteira', type: 'number' },
  { value: 'coins', label: 'Coins (saldo)', icon: DollarSign, category: 'Carteira', type: 'number' },
  { value: 'xp', label: 'XP (saldo)', icon: Star, category: 'Carteira', type: 'number' },
  { value: 'total_coins_earned', label: 'Total Coins Ganhos', icon: DollarSign, category: 'Carteira', type: 'number' },
  { value: 'total_xp_earned', label: 'Total XP Ganho', icon: Star, category: 'Carteira', type: 'number' },
  { value: 'total_deposits', label: 'Total Depositado (R$)', icon: CreditCard, category: 'Financeiro', type: 'number' },
  { value: 'total_saques', label: 'Total Sacado (R$)', icon: CreditCard, category: 'Financeiro', type: 'number' },
  { value: 'fez_ftd', label: 'Fez 1o Deposito (FTD)', icon: CreditCard, category: 'Financeiro', type: 'yesno' },
  { value: 'total_bets', label: 'Total Apostado (R$)', icon: Gamepad2, category: 'Financeiro', type: 'number' },
  { value: 'missions_completed', label: 'Missoes Completas', icon: Target, category: 'Gamificacao', type: 'number' },
  { value: 'mission_completed', label: 'Completou a Missao', icon: Target, category: 'Gamificacao', type: 'mission' },
  { value: 'achievements_completed', label: 'Conquistas Desbloqueadas', icon: Star, category: 'Gamificacao', type: 'number' },
  { value: 'tournaments_joined', label: 'Torneios Participados', icon: Layers, category: 'Gamificacao', type: 'number' },
  { value: 'store_purchases_count', label: 'Compras na Loja', icon: ShoppingBag, category: 'Gamificacao', type: 'number' },
  { value: 'total_spins', label: 'Total de Giros', icon: RotateCw, category: 'Gamificacao', type: 'number' },
  { value: 'last_activity', label: 'Ultima Atividade', icon: Calendar, category: 'Comportamento', type: 'days' },
  { value: 'registration_date', label: 'Data de Cadastro', icon: Calendar, category: 'Comportamento', type: 'days' },
  // Métricas computadas
  { value: 'favorite_game', label: 'Jogo Favorito', icon: Dice5, category: 'Métricas', type: 'text' },
  { value: 'favorite_game_category', label: 'Categoria Favorita', icon: Dice5, category: 'Métricas', type: 'text', options: [
    { value: 'keno', label: 'Keno / Bingo' },
    { value: 'cassino', label: 'Cassino' },
  ] },
  { value: 'total_bet_7d', label: 'Apostas 7 dias (R$)', icon: Gamepad2, category: 'Métricas', type: 'number' },
  { value: 'total_bet_30d', label: 'Apostas 30 dias (R$)', icon: Gamepad2, category: 'Métricas', type: 'number' },
  { value: 'bet_count_7d', label: 'Qtd Apostas 7 dias', icon: Gamepad2, category: 'Métricas', type: 'number' },
  { value: 'bet_count_30d', label: 'Qtd Apostas 30 dias', icon: Gamepad2, category: 'Métricas', type: 'number' },
  { value: 'avg_bet_value', label: 'Aposta Média (R$)', icon: DollarSign, category: 'Métricas', type: 'number' },
  { value: 'total_deposit_7d', label: 'Depósitos 7 dias (R$)', icon: CreditCard, category: 'Métricas', type: 'number' },
  { value: 'total_deposit_30d', label: 'Depósitos 30 dias (R$)', icon: CreditCard, category: 'Métricas', type: 'number' },
  { value: 'deposit_count_7d', label: 'Qtd Depósitos 7 dias', icon: CreditCard, category: 'Métricas', type: 'number' },
  { value: 'deposit_count_30d', label: 'Qtd Depósitos 30 dias', icon: CreditCard, category: 'Métricas', type: 'number' },
  { value: 'days_since_last_bet', label: 'Dias sem Apostar', icon: Calendar, category: 'Métricas', type: 'number' },
  { value: 'days_since_last_deposit', label: 'Dias sem Depositar', icon: Calendar, category: 'Métricas', type: 'number' },
  { value: 'days_since_last_login', label: 'Dias sem Login', icon: Calendar, category: 'Métricas', type: 'number' },
  { value: 'active_days_7d', label: 'Dias Ativos (7d)', icon: Activity, category: 'Métricas', type: 'number' },
  { value: 'active_days_30d', label: 'Dias Ativos (30d)', icon: Activity, category: 'Métricas', type: 'number' },
  { value: 'engagement_score', label: 'Score Engajamento (0-100)', icon: Heart, category: 'Métricas', type: 'number' },
  { value: 'churn_risk', label: 'Risco de Churn (0-100)', icon: AlertTriangle, category: 'Métricas', type: 'number' },
];

export const OPERATORS_NUMBER = [
  { value: 'gt', label: 'maior que' },
  { value: 'gte', label: 'maior ou igual a' },
  { value: 'eq', label: 'igual a' },
  { value: 'neq', label: 'diferente de' },
  { value: 'lt', label: 'menor que' },
  { value: 'lte', label: 'menor ou igual a' },
];

export const OPERATORS_DAYS = [
  { value: 'within', label: 'nos ultimos' },
  { value: 'not_within', label: 'nao ativo ha mais de' },
];

export const OPERATORS_TEXT = [
  { value: 'eq', label: 'igual a' },
  { value: 'neq', label: 'diferente de' },
  { value: 'contains', label: 'contém' },
];

export const OPERATORS_MEMBERSHIP = [
  { value: 'eq', label: 'completou' },
  { value: 'neq', label: 'não completou' },
];

// "é um de / não é um de" — seleciona vários valores (value = lista separada por vírgula).
export const OPERATORS_MULTI = [
  { value: 'in', label: 'é um de' },
  { value: 'not_in', label: 'não é um de' },
];

// "definido / não definido" — campo preenchido ou vazio (não usa valor).
export const OPERATORS_DEFINED = [
  { value: 'defined', label: 'definido' },
  { value: 'not_defined', label: 'não definido' },
];

// Sim / Não (não usa valor) — pra campos booleanos (ex.: fez FTD).
export const OPERATORS_YESNO = [
  { value: 'eq', label: 'sim' },
  { value: 'neq', label: 'não' },
];

export const SEGMENT_COLORS = [
  '#6d28d9', '#2563eb', '#059669', '#d97706', '#dc2626',
  '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316',
];

export const SEGMENT_ICONS = [
  'users', 'star', 'zap', 'target', 'crown', 'diamond', 'fire', 'shield', 'trophy', 'gift',
];

export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export interface VerifyResult {
  hasBonus: boolean;
  lastBonusDate?: string;
  bonusCount: number;
  bonusBalance?: number;
}
