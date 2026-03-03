import type {
  Batch, BatchItem, EndpointConfig, Flow, BonusRule,
  Credential, DashboardStats, ItemStatus
} from '@/types';

export function maskCpf(cpf: string): string {
  if (!cpf || cpf.length < 5) return '***';
  return `***${cpf.slice(-5, -2)}-${cpf.slice(-2)}`;
}

export const mockCredentials: Credential[] = [
  {
    id: 'cred-1',
    name: 'Token PixBingoBR Produção',
    type: 'bearer',
    value_masked: 'eyJhbG...****',
    created_at: '2025-12-01T10:00:00',
    updated_at: '2026-02-15T14:30:00',
  },
  {
    id: 'cred-2',
    name: 'Cookie Session Admin',
    type: 'cookie',
    value_masked: 'sid=abc...****',
    created_at: '2025-11-20T08:00:00',
    updated_at: '2026-03-01T09:00:00',
  },
];

export const mockEndpoints: EndpointConfig[] = [
  {
    id: 'ep-1',
    name: 'Consultar Transações',
    description: 'Busca transações de um usuário por UUID',
    method: 'GET',
    url: 'https://pixbingobr.com/usuarios/transacoes?id={{uuid}}',
    headers: { 'Accept': 'application/json' },
    cookies: {},
    auth_type: 'bearer',
    credential_id: 'cred-1',
    query_params: {},
    timeout_ms: 10000,
    retry_max: 3,
    retry_codes: [429, 500, 502, 503],
    retry_backoff_ms: 1000,
    rate_limit_rps: 5,
    rate_limit_concurrency: 3,
    response_mapping: { transactions: '$.data.transactions' },
    created_at: '2025-12-01T10:00:00',
  },
  {
    id: 'ep-2',
    name: 'Creditar Bônus',
    description: 'Credita bônus para um usuário',
    method: 'POST',
    url: 'https://pixbingobr.com/bonus/creditar',
    headers: { 'Content-Type': 'application/json' },
    cookies: {},
    auth_type: 'bearer',
    credential_id: 'cred-1',
    body_template: '{"uuid":"{{uuid}}","valor":{{bonus_valor}}}',
    query_params: {},
    timeout_ms: 15000,
    retry_max: 2,
    retry_codes: [429, 500, 502, 503],
    retry_backoff_ms: 2000,
    rate_limit_rps: 3,
    rate_limit_concurrency: 2,
    created_at: '2025-12-05T10:00:00',
  },
  {
    id: 'ep-3',
    name: 'Buscar UUID por CPF',
    description: 'Resolve UUID a partir do CPF',
    method: 'GET',
    url: 'https://pixbingobr.com/usuarios/buscar?cpf={{cpf}}',
    headers: { 'Accept': 'application/json' },
    cookies: {},
    auth_type: 'bearer',
    credential_id: 'cred-1',
    query_params: {},
    timeout_ms: 8000,
    retry_max: 2,
    retry_codes: [429, 500],
    retry_backoff_ms: 1000,
    rate_limit_rps: 10,
    rate_limit_concurrency: 5,
    response_mapping: { uuid: '$.data.uuid' },
    created_at: '2025-12-10T10:00:00',
  },
];

export const mockFlows: Flow[] = [
  {
    id: 'flow-1',
    name: 'Crédito + Verificação',
    description: 'Credita bônus e verifica se foi aplicado',
    steps: [
      { id: 's1', order: 1, endpoint_id: 'ep-3', endpoint_name: 'Buscar UUID por CPF', description: 'Resolver UUID (opcional)' },
      { id: 's2', order: 2, endpoint_id: 'ep-1', endpoint_name: 'Consultar Transações', description: 'Pré-check de bônus', stop_condition: 'qtd_bonus >= 2', stop_status: 'BONUS_2X+' },
      { id: 's3', order: 3, endpoint_id: 'ep-2', endpoint_name: 'Creditar Bônus', description: 'Creditar valor' },
      { id: 's4', order: 4, endpoint_id: 'ep-1', endpoint_name: 'Consultar Transações', description: 'Pós-check de bônus' },
    ],
    created_at: '2025-12-15T10:00:00',
  },
  {
    id: 'flow-2',
    name: 'Somente Verificação',
    description: 'Apenas verifica status de bônus',
    steps: [
      { id: 's5', order: 1, endpoint_id: 'ep-1', endpoint_name: 'Consultar Transações', description: 'Verificar transações e extrair bônus' },
    ],
    created_at: '2025-12-20T10:00:00',
  },
];

const statuses: ItemStatus[] = ['SEM_BONUS', 'BONUS_1X', 'BONUS_2X+', 'ERRO', 'PENDENTE'];

function randomDate(): string {
  const d = new Date(2026, 1, Math.floor(Math.random() * 28) + 1, Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
  return d.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' });
}

export const mockBatchItems: BatchItem[] = Array.from({ length: 30 }, (_, i) => {
  const status = statuses[i % statuses.length];
  const cpf = `${String(Math.floor(Math.random() * 999)).padStart(3, '0')}${String(Math.floor(Math.random() * 999)).padStart(3, '0')}${String(Math.floor(Math.random() * 999)).padStart(3, '0')}${String(Math.floor(Math.random() * 99)).padStart(2, '0')}`;
  const qtd = status === 'SEM_BONUS' ? 0 : status === 'BONUS_1X' ? 1 : status === 'BONUS_2X+' ? 2 + Math.floor(Math.random() * 3) : 0;
  return {
    id: `item-${i + 1}`,
    batch_id: 'batch-1',
    cpf,
    cpf_masked: maskCpf(cpf),
    uuid: `uuid-${String(i + 1).padStart(4, '0')}`,
    status,
    tentativas: Math.floor(Math.random() * 4) + 1,
    qtd_bonus: qtd,
    datas_bonus: qtd > 0 ? Array.from({ length: qtd }, () => randomDate()) : [],
    ultima_data_bonus: qtd > 0 ? randomDate() : undefined,
    log: [`[${randomDate()}] Processado com status ${status}`],
    created_at: '2026-02-28T10:00:00',
    updated_at: '2026-03-01T14:30:00',
  };
});

export const mockBatches: Batch[] = [
  {
    id: 'batch-1',
    name: 'Lote Março 2026 - Campanha Aniversário',
    flow_id: 'flow-1',
    flow_name: 'Crédito + Verificação',
    total_items: 30,
    processed: 24,
    status: 'EM_ANDAMENTO',
    bonus_valor: 10,
    created_at: '2026-03-01T08:00:00',
    updated_at: '2026-03-01T14:30:00',
    stats: { pendente: 6, processando: 0, sem_bonus: 8, bonus_1x: 6, bonus_2x_plus: 6, erro: 4 },
  },
  {
    id: 'batch-2',
    name: 'Verificação Diária 02/03',
    flow_id: 'flow-2',
    flow_name: 'Somente Verificação',
    total_items: 150,
    processed: 150,
    status: 'CONCLUIDO',
    bonus_valor: 0,
    created_at: '2026-03-02T09:00:00',
    updated_at: '2026-03-02T11:00:00',
    stats: { pendente: 0, processando: 0, sem_bonus: 90, bonus_1x: 40, bonus_2x_plus: 15, erro: 5 },
  },
  {
    id: 'batch-3',
    name: 'Lote Teste',
    flow_id: 'flow-1',
    flow_name: 'Crédito + Verificação',
    total_items: 5,
    processed: 5,
    status: 'CONCLUIDO',
    bonus_valor: 5,
    created_at: '2026-02-28T16:00:00',
    updated_at: '2026-02-28T16:30:00',
    stats: { pendente: 0, processando: 0, sem_bonus: 2, bonus_1x: 2, bonus_2x_plus: 1, erro: 0 },
  },
];

export const mockBonusRules: BonusRule[] = [
  {
    id: 'rule-1',
    name: 'Regra Padrão PixBingoBR',
    field_candidates: ['tipo', 'type', 'descricao', 'description'],
    keywords: ['bonus', 'bônus', 'credito', 'crédito'],
    valor_fixo: 10,
    valor_positivo: true,
    date_fields: ['created_at', 'data_criacao', 'timestamp'],
    active: true,
  },
];

export const mockDashboardStats: DashboardStats = {
  total_batches: 3,
  total_items: 185,
  pendente: 6,
  processando: 0,
  sem_bonus: 100,
  bonus_1x: 48,
  bonus_2x_plus: 22,
  erro: 9,
  avg_time_ms: 1250,
  rate_limit_alerts: 3,
};
