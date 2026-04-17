export type UserRole = 'ADMIN' | 'OPERADOR' | 'VISUALIZADOR';

export type BatchStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'PAUSADO' | 'CONCLUIDO' | 'ERRO';

export type ItemStatus =
  | 'PENDENTE'
  | 'PROCESSANDO'
  | 'SEM_BONUS'
  | 'BONUS_1X'
  | 'BONUS_2X+'
  | 'ERRO'
  | 'TIMEOUT';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey' | 'cookie';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface Credential {
  id: string;
  name: string;
  type: AuthType;
  value_masked: string;
  created_at: string;
  updated_at: string;
}

export interface EndpointConfig {
  id: string;
  name: string;
  description: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  auth_type: AuthType;
  credential_id?: string;
  body_template?: string;
  query_params: Record<string, string>;
  timeout_ms: number;
  retry_max: number;
  retry_codes: number[];
  retry_backoff_ms: number;
  rate_limit_rps: number;
  rate_limit_concurrency: number;
  response_mapping?: Record<string, string>;
  created_at: string;
}

export interface FlowStep {
  id: string;
  order: number;
  endpoint_id: string;
  endpoint_name?: string;
  stop_condition?: string;
  stop_status?: ItemStatus;
  description: string;
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  steps: FlowStep[];
  created_at: string;
}

export interface Batch {
  id: string;
  name: string;
  flow_id: string;
  flow_name?: string;
  total_items: number;
  processed: number;
  status: BatchStatus;
  bonus_valor: number;
  created_at: string;
  updated_at: string;
  stats: {
    pendente: number;
    processando: number;
    sem_bonus: number;
    bonus_1x: number;
    bonus_2x_plus: number;
    erro: number;
  };
}

export interface BatchItem {
  id: string;
  batch_id: string;
  cpf: string;
  cpf_masked: string;
  uuid: string;
  status: ItemStatus;
  tentativas: number;
  qtd_bonus: number;
  datas_bonus: string[];
  ultima_data_bonus?: string;
  log: string[];
  created_at: string;
  updated_at: string;
}

export interface BonusRule {
  id: string;
  name: string;
  field_candidates: string[];
  keywords: string[];
  valor_fixo?: number;
  valor_positivo: boolean;
  date_fields: string[];
  active: boolean;
}

export interface DashboardStats {
  total_batches: number;
  total_items: number;
  pendente: number;
  processando: number;
  sem_bonus: number;
  bonus_1x: number;
  bonus_2x_plus: number;
  erro: number;
  avg_time_ms: number;
  rate_limit_alerts: number;
}

// --- Customer Journey Engine ---

export type JourneyStatus = 'rascunho' | 'ativa' | 'pausada' | 'encerrada';
export type JourneyEntryEvent = 'deposit' | 'bet' | 'login' | 'level_up' | 'achievement_unlock' | 'registration' | 'segment_enter' | 'manual';
export type JourneyStepType = 'action' | 'delay' | 'condition_split';
export type JourneyEnrollmentStatus = 'active' | 'completed' | 'exited' | 'paused';

export interface Journey {
  id: string;
  name: string;
  description: string | null;
  status: JourneyStatus;
  entry_event: JourneyEntryEvent;
  entry_conditions: Array<{ field: string; operator: string; value: string }>;
  entry_match_type: string;
  segment_id: string | null;
  max_entries_per_player: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JourneyStep {
  id: string;
  journey_id: string;
  step_order: number;
  step_type: JourneyStepType;
  delay_minutes: number;
  action_type: string | null;
  action_config: Record<string, unknown>;
  conditions: Array<{ field: string; operator: string; value: string }>;
  condition_yes_next: number | null;
  condition_no_next: number | null;
  created_at: string;
}

export interface JourneyEnrollment {
  id: string;
  journey_id: string;
  cpf: string;
  current_step_order: number;
  status: JourneyEnrollmentStatus;
  entered_at: string;
  step_entered_at: string;
  completed_at: string | null;
}

// --- Dynamic Formulas ---

export type FormulaCategory = 'cashback' | 'bonus' | 'xp' | 'reward' | 'custom';

export interface Formula {
  id: string;
  name: string;
  description: string | null;
  category: FormulaCategory;
  formula_ast: Record<string, unknown>;
  variables_used: string[];
  test_input: Record<string, number>;
  test_output: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// --- Mini Game Skins ---

export interface SkinData {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    accent: string;
    text: string;
    text_secondary: string;
    success: string;
    card_bg: string;
  };
  images: {
    background_url: string;
    logo_url: string;
    prize_icon_url: string;
    scratch_overlay_url: string;
  };
  fonts: {
    primary: string;
    secondary: string;
  };
  border_radius: string;
  animation_speed: string;
  custom_css: string;
}

export interface MiniGameSkin {
  id: string;
  name: string;
  description: string | null;
  game_type: string;
  is_template: boolean;
  skin_data: SkinData;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
}

// --- Quiz & Match X ---

export interface QuizQuestion {
  id: string;
  game_id: string;
  question: string;
  options: Array<{ text: string; is_correct: boolean }>;
  time_limit_seconds: number;
  points: number;
  explanation: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface MatchXItem {
  id: string;
  game_id: string;
  label: string;
  image_url: string | null;
  pair_group: number;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface PlayerMiniGameResult {
  id: string;
  cpf: string;
  game_id: string;
  game_type: string;
  score: number;
  correct_answers: number;
  pairs_found: number;
  prizes_caught: number;
  time_taken_ms: number;
  reward_type: string | null;
  reward_value: number;
  played_at: string;
}
