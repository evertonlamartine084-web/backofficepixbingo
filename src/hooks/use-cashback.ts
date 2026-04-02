import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getSavedCredentials } from '@/hooks/use-proxy';
import { logAudit } from '@/hooks/use-audit';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  return headers;
}

export type CashbackGameType = 'bingo' | 'cassino' | 'both';
export type CashbackPeriod = 'daily' | 'weekly';
export type CashbackRuleStatus = 'RASCUNHO' | 'ATIVA' | 'PAUSADA' | 'ENCERRADA';
export type CashbackProcessMode = 'manual' | 'auto';

export const GAME_TYPE_LABELS: Record<CashbackGameType, string> = {
  bingo: 'Bingo',
  cassino: 'Cassino',
  both: 'Ambos',
};

export const PERIOD_LABELS: Record<CashbackPeriod, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
};

export const PROCESS_MODE_LABELS: Record<CashbackProcessMode, string> = {
  manual: 'Manual',
  auto: 'Automático',
};

export const CASHBACK_STATUS_COLORS: Record<CashbackRuleStatus, string> = {
  RASCUNHO: 'bg-muted text-muted-foreground',
  ATIVA: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PAUSADA: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ENCERRADA: 'bg-red-500/15 text-red-400 border-red-500/30',
};

export const ITEM_STATUS_COLORS: Record<string, string> = {
  PENDENTE: 'bg-muted text-muted-foreground',
  PROCESSANDO: 'bg-blue-500/15 text-blue-400',
  SEM_PERDA: 'bg-amber-500/15 text-amber-400',
  AGUARDANDO: 'bg-purple-500/15 text-purple-400',
  CREDITADO: 'bg-emerald-500/15 text-emerald-400',
  ERRO: 'bg-red-500/15 text-red-400',
};

export const EXEC_STATUS_COLORS: Record<string, string> = {
  PROCESSANDO: 'bg-blue-500/15 text-blue-400',
  AGUARDANDO_APROVACAO: 'bg-purple-500/15 text-purple-400',
  CONCLUIDO: 'bg-emerald-500/15 text-emerald-400',
  ERRO: 'bg-red-500/15 text-red-400',
};

export interface CashbackRule {
  id: string;
  name: string;
  game_type: CashbackGameType;
  period: CashbackPeriod;
  percentage: number;
  min_loss: number;
  max_cashback: number | null;
  wallet_type: 'REAL' | 'BONUS';
  segment_id: string | null;
  status: CashbackRuleStatus;
  process_mode: CashbackProcessMode;
  created_at: string;
  updated_at: string;
  segment_name?: string;
}

export interface CashbackExecution {
  id: string;
  rule_id: string;
  period_start: string;
  period_end: string;
  total_players: number;
  eligible_players: number;
  total_credited: number;
  errors: number;
  status: string;
  created_at: string;
}

export interface CashbackItem {
  id: string;
  execution_id: string;
  rule_id: string;
  cpf: string;
  cpf_masked: string;
  uuid: string | null;
  total_bets: number;
  total_wins: number;
  net_loss: number;
  cashback_value: number;
  status: string;
  credit_result: string | null;
  created_at: string;
}

export function useCashbackRules() {
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['cashback-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cashback_rules').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data as Array<Record<string, unknown>>;
      const segmentIds = [...new Set(rows.filter(r => r.segment_id).map(r => r.segment_id as string))];
      let segmentMap: Record<string, string> = {};
      if (segmentIds.length > 0) {
        const { data: segments } = await supabase.from('segments').select('id, name').in('id', segmentIds);
        if (segments) segmentMap = Object.fromEntries(segments.map(s => [s.id, s.name]));
      }
      return rows.map(r => ({
        ...r,
        segment_name: r.segment_id ? segmentMap[r.segment_id as string] || '—' : null,
      })) as CashbackRule[];
    },
  });

  const { data: segments = [] } = useQuery({
    queryKey: ['segments-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('segments').select('id, name').order('name');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (form: {
      name: string; game_type: CashbackGameType; period: CashbackPeriod;
      percentage: string; min_loss: string; max_cashback: string;
      wallet_type: 'REAL' | 'BONUS'; segment_id: string; process_mode: CashbackProcessMode;
    }) => {
      if (!form.name || !form.percentage) throw new Error('Preencha os campos obrigatórios');
      const { error } = await supabase.from('cashback_rules').insert({
        name: form.name,
        game_type: form.game_type,
        period: form.period,
        percentage: Number(form.percentage),
        min_loss: Number(form.min_loss) || 0,
        max_cashback: form.max_cashback ? Number(form.max_cashback) : null,
        wallet_type: form.wallet_type,
        segment_id: form.segment_id || null,
        process_mode: form.process_mode,
      } as Record<string, unknown>);
      if (error) throw error;
    },
    onSuccess: (_data, form) => {
      queryClient.invalidateQueries({ queryKey: ['cashback-rules'] });
      toast.success('Regra de cashback criada com sucesso');
      logAudit({ action: 'CRIAR', resource_type: 'cashback', resource_name: form.name, details: { game_type: form.game_type, period: form.period, percentage: form.percentage, process_mode: form.process_mode, wallet_type: form.wallet_type } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const rule = rules.find(r => r.id === id);
      const { error } = await supabase.from('cashback_rules').delete().eq('id', id);
      if (error) throw error;
      return rule;
    },
    onSuccess: (rule) => {
      queryClient.invalidateQueries({ queryKey: ['cashback-rules'] });
      toast.success('Regra excluída');
      logAudit({ action: 'EXCLUIR', resource_type: 'cashback', resource_id: rule?.id, resource_name: rule?.name });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CashbackRuleStatus }) => {
      const rule = rules.find(r => r.id === id);
      const oldStatus = rule?.status;
      const { error } = await supabase.from('cashback_rules').update({ status } as Record<string, unknown>).eq('id', id);
      if (error) throw error;
      return { id, status, oldStatus, name: rule?.name };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['cashback-rules'] });
      toast.success('Status atualizado');
      logAudit({ action: 'STATUS', resource_type: 'cashback', resource_id: result.id, resource_name: result.name, details: { from: result.oldStatus, to: result.status } });
    },
  });

  return { rules, isLoading, segments, createMutation, deleteMutation, updateStatusMutation };
}

export function useCashbackExecutions(ruleId: string | undefined) {
  const { data: executions = [], refetch } = useQuery({
    queryKey: ['cashback-executions', ruleId],
    enabled: !!ruleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cashback_executions').select('*')
        .eq('rule_id', ruleId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as CashbackExecution[];
    },
  });

  return { executions, refetchExecutions: refetch };
}

export function useCashbackItems(executionId: string | undefined) {
  const { data: items = [], refetch } = useQuery({
    queryKey: ['cashback-items', executionId],
    enabled: !!executionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cashback_items').select('*')
        .eq('execution_id', executionId!)
        .order('status', { ascending: true });
      if (error) throw error;
      return (data || []) as CashbackItem[];
    },
  });

  useEffect(() => {
    if (!executionId) return;
    const channel = supabase
      .channel(`cashback-${executionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'cashback_items',
        filter: `execution_id=eq.${executionId}`,
      }, () => { refetch(); })
      .subscribe();
    return () => { channel.unsubscribe(); supabase.removeChannel(channel); };
  }, [executionId, refetch]);

  return { items, refetchItems: refetch };
}

export function useCashbackProcessing(rules: CashbackRule[]) {
  const [processing, setProcessing] = useState(false);
  const [autoProcessing, setAutoProcessing] = useState<Set<string>>(new Set());
  const autoProcessRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const queryClient = useQueryClient();

  const processCashback = async (rule: CashbackRule, periodStart?: string, periodEnd?: string) => {
    if (processing || autoProcessing.has(rule.id)) {
      toast.warning('Processamento já em andamento para esta regra');
      return;
    }
    const creds = getSavedCredentials();
    if (!creds.username || !creds.password) {
      toast.error('Configure as credenciais da plataforma primeiro (barra superior)');
      return;
    }
    if (!rule.segment_id) {
      toast.error('Regra sem segmento vinculado');
      return;
    }

    const isManual = rule.process_mode === 'manual';

    setProcessing(true);
    try {
      const authHeaders = await getAuthHeaders();
      const _res = await fetch('/api/process-cashback', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          rule_id: rule.id,
          username: creds.username,
          password: creds.password,
          period_start: periodStart,
          period_end: periodEnd,
          action: isManual ? 'calculate' : undefined,
        }),
      });
      const data = await _res.json();
      if (!data?.success) throw new Error(data?.error || 'Erro ao processar cashback');
      const result = data.data;
      if (result.awaiting_approval) {
        toast.success(
          `Cálculo concluído: ${result.eligible} elegíveis | R$ ${Number(result.estimated_total).toFixed(2)} estimado. Revise e aprove para creditar.`
        );
        logAudit({ action: 'CALCULAR', resource_type: 'cashback', resource_id: rule.id, resource_name: rule.name, details: { eligible: result.eligible, estimated_total: result.estimated_total, execution_id: result.execution_id } });
      } else {
        toast.success(
          `Cashback processado: ${result.eligible} elegíveis | ${result.credited} creditados | R$ ${Number(result.total_credited).toFixed(2)} total`
        );
        logAudit({ action: 'PROCESSAR', resource_type: 'cashback', resource_id: rule.id, resource_name: rule.name, details: { eligible: result.eligible, credited: result.credited, total_credited: result.total_credited, execution_id: result.execution_id } });
      }
      queryClient.invalidateQueries({ queryKey: ['cashback-executions'] });
      queryClient.invalidateQueries({ queryKey: ['cashback-items'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao processar cashback');
    } finally {
      setProcessing(false);
    }
  };

  const approveCashback = async (rule: CashbackRule, executionId: string) => {
    const creds = getSavedCredentials();
    if (!creds.username || !creds.password) {
      toast.error('Configure as credenciais da plataforma primeiro (barra superior)');
      return;
    }

    setProcessing(true);
    try {
      const authHeaders = await getAuthHeaders();
      const _res = await fetch('/api/process-cashback', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          rule_id: rule.id,
          username: creds.username,
          password: creds.password,
          action: 'credit',
          execution_id: executionId,
        }),
      });
      const data = await _res.json();
      if (!data?.success) throw new Error(data?.error || 'Erro ao creditar cashback');
      const result = data.data;
      toast.success(`Cashback creditado: ${result.credited} jogadores | R$ ${Number(result.total_credited).toFixed(2)} total`);
      logAudit({ action: 'APROVAR', resource_type: 'cashback', resource_id: rule.id, resource_name: rule.name, details: { credited: result.credited, total_credited: result.total_credited, execution_id: executionId } });
      queryClient.invalidateQueries({ queryKey: ['cashback-executions'] });
      queryClient.invalidateQueries({ queryKey: ['cashback-items'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao creditar');
    } finally {
      setProcessing(false);
    }
  };

  const doStop = (ruleId: string) => {
    const timer = autoProcessRef.current.get(ruleId);
    if (timer) clearTimeout(timer);
    autoProcessRef.current.delete(ruleId);
    setAutoProcessing(prev => {
      const next = new Set(prev);
      next.delete(ruleId);
      return next;
    });
  };

  const stopAutoProcess = useCallback((ruleId: string) => {
    doStop(ruleId);
  }, []);

  const startAutoProcess = useCallback((rule: CashbackRule, silent = false) => {
    const creds = getSavedCredentials();
    if (!creds.username || !creds.password) {
      if (!silent) toast.error('Configure as credenciais da plataforma primeiro (barra superior)');
      return;
    }
    if (!rule.segment_id) {
      if (!silent) toast.error('Regra sem segmento vinculado');
      return;
    }
    if (autoProcessRef.current.has(rule.id)) return;

    if (!silent) toast.info(`Processamento automático iniciado para "${rule.name}"`);
    setAutoProcessing(prev => new Set(prev).add(rule.id));

    const runIteration = async () => {
      try {
        const _res = await fetch('/api/process-cashback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rule_id: rule.id, username: creds.username, password: creds.password }),
        });
        const data = await _res.json();
        if (!data?.success) throw new Error(data?.error || 'Erro');

        queryClient.invalidateQueries({ queryKey: ['cashback-executions'] });
        queryClient.invalidateQueries({ queryKey: ['cashback-items'] });

        // Check if rule is still ATIVA
        const { data: ruleData } = await supabase
          .from('cashback_rules').select('status').eq('id', rule.id).single();

        if (ruleData?.status !== 'ATIVA') {
          doStop(rule.id);
          return;
        }

        // For daily: check again in 1 hour; for weekly: check again in 6 hours
        const interval = rule.period === 'daily' ? 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
        const timer = setTimeout(runIteration, interval);
        autoProcessRef.current.set(rule.id, timer);
      } catch (e: unknown) {
        console.error('Erro no cashback automático:', e instanceof Error ? e.message : e);
        // Retry in 5 minutes on error
        const timer = setTimeout(runIteration, 5 * 60 * 1000);
        autoProcessRef.current.set(rule.id, timer);
      }
    };

    runIteration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  // Auto-resume for ATIVA + auto rules on load
  useEffect(() => {
    const creds = getSavedCredentials();
    if (!creds.username || !creds.password) return;

    const autoRules = rules.filter(r => r.status === 'ATIVA' && r.process_mode === 'auto' && r.segment_id);
    for (const rule of autoRules) {
      if (!autoProcessRef.current.has(rule.id)) {
        startAutoProcess(rule, true);
      }
    }
  }, [rules, startAutoProcess]);

  // Cleanup on unmount
  useEffect(() => {
    const ref = autoProcessRef.current;
    return () => {
      ref.forEach(timer => clearTimeout(timer));
      ref.clear();
    };
  }, []);

  return { processing, autoProcessing, startAutoProcess, stopAutoProcess, processCashback, approveCashback };
}
