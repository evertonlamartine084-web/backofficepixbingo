import {
  TrendingUp, DollarSign, Star, CreditCard, Gamepad2, Target, Layers, ShoppingBag, RotateCw, Calendar,
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
}

export const ALL_USERS_ID = '__all_users__';

export const RULE_FIELDS: RuleFieldDef[] = [
  { value: 'level', label: 'Nivel', icon: TrendingUp, category: 'Carteira', type: 'number' },
  { value: 'coins', label: 'Coins (saldo)', icon: DollarSign, category: 'Carteira', type: 'number' },
  { value: 'xp', label: 'XP (saldo)', icon: Star, category: 'Carteira', type: 'number' },
  { value: 'total_coins_earned', label: 'Total Coins Ganhos', icon: DollarSign, category: 'Carteira', type: 'number' },
  { value: 'total_xp_earned', label: 'Total XP Ganho', icon: Star, category: 'Carteira', type: 'number' },
  { value: 'total_deposits', label: 'Total Depositado (R$)', icon: CreditCard, category: 'Financeiro', type: 'number' },
  { value: 'total_bets', label: 'Total Apostado (R$)', icon: Gamepad2, category: 'Financeiro', type: 'number' },
  { value: 'missions_completed', label: 'Missoes Completas', icon: Target, category: 'Gamificacao', type: 'number' },
  { value: 'achievements_completed', label: 'Conquistas Desbloqueadas', icon: Star, category: 'Gamificacao', type: 'number' },
  { value: 'tournaments_joined', label: 'Torneios Participados', icon: Layers, category: 'Gamificacao', type: 'number' },
  { value: 'store_purchases_count', label: 'Compras na Loja', icon: ShoppingBag, category: 'Gamificacao', type: 'number' },
  { value: 'total_spins', label: 'Total de Giros', icon: RotateCw, category: 'Gamificacao', type: 'number' },
  { value: 'last_activity', label: 'Ultima Atividade', icon: Calendar, category: 'Comportamento', type: 'days' },
  { value: 'registration_date', label: 'Data de Cadastro', icon: Calendar, category: 'Comportamento', type: 'days' },
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
