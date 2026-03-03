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
