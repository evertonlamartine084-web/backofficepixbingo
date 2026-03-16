import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getSavedCredentials } from '@/hooks/use-proxy';

export type CashbackGameType = 'bingo' | 'cassino' | 'both';
export type CashbackPeriod = 'daily' | 'weekly';
export type CashbackRuleStatus = 'RASCUNHO' | 'ATIVA' | 'PAUSADA' | 'ENCERRADA';

export const GAME_TYPE_LABELS: Record<CashbackGameType, string> = {
  bingo: 'Bingo',
  cassino: 'Cassino',
  both: 'Ambos',
};

export const PERIOD_LABELS: Record<CashbackPeriod, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
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
  CREDITADO: 'bg-emerald-500/15 text-emerald-400',
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
      const segmentIds = [...new Set((data as any[]).filter(r => r.segment_id).map(r => r.segment_id))];
      let segmentMap: Record<string, string> = {};
      if (segmentIds.length > 0) {
        const { data: segments } = await supabase.from('segments').select('id, name').in('id', segmentIds);
        if (segments) segmentMap = Object.fromEntries(segments.map(s => [s.id, s.name]));
      }
      return (data as any[]).map(r => ({
        ...r,
        segment_name: r.segment_id ? segmentMap[r.segment_id] || '—' : null,
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
      wallet_type: 'REAL' | 'BONUS'; segment_id: string;
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
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashback-rules'] });
      toast.success('Regra de cashback criada com sucesso');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cashback_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashback-rules'] });
      toast.success('Regra excluída');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CashbackRuleStatus }) => {
      const { error } = await supabase.from('cashback_rules').update({ status } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashback-rules'] });
      toast.success('Status atualizado');
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
    return () => { supabase.removeChannel(channel); };
  }, [executionId]);

  return { items, refetchItems: refetch };
}

export function useCashbackProcessing() {
  const [processing, setProcessing] = useState(false);
  const queryClient = useQueryClient();

  const processCashback = async (rule: CashbackRule, periodStart?: string, periodEnd?: string) => {
    const creds = getSavedCredentials();
    if (!creds.username || !creds.password) {
      toast.error('Configure as credenciais da plataforma primeiro (barra superior)');
      return;
    }
    if (!rule.segment_id) {
      toast.error('Regra sem segmento vinculado');
      return;
    }

    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-cashback', {
        body: {
          rule_id: rule.id,
          username: creds.username,
          password: creds.password,
          period_start: periodStart,
          period_end: periodEnd,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao processar cashback');
      const result = data.data;
      toast.success(
        `Cashback processado: ${result.total_players} jogadores | ${result.eligible} elegíveis | ${result.credited} creditados | R$ ${Number(result.total_credited).toFixed(2)} total`
      );
      queryClient.invalidateQueries({ queryKey: ['cashback-executions'] });
      queryClient.invalidateQueries({ queryKey: ['cashback-items'] });
    } catch (e: any) {
      toast.error(e.message || 'Erro ao processar cashback');
    } finally {
      setProcessing(false);
    }
  };

  return { processing, processCashback };
}
