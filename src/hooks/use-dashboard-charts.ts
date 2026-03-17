import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DailyMetric {
  date: string;       // "dd/MM"
  dateISO: string;    // "2026-03-16"
  depositos: number;
  saques: number;
  ggr: number;
  bonus_creditado: number;
  cashback_creditado: number;
  campanhas_creditado: number;
  novos_usuarios: number;
}

function getDaysArray(days: number): { dateISO: string; label: string }[] {
  const result: { dateISO: string; label: string }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    result.push({ dateISO: iso, label });
  }
  return result;
}

// Aggregate Supabase data by day for charts
export function useDashboardCharts(days: number = 7) {
  const queryClient = useQueryClient();
  const daysArray = getDaysArray(days);
  const startDate = daysArray[0].dateISO;

  // Bonus credited from batch_items
  const { data: batchData } = useQuery({
    queryKey: ['chart-batch-credits', startDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_items')
        .select('created_at, status')
        .gte('created_at', `${startDate}T00:00:00`)
        .in('status', ['BONUS_1X', 'BONUS_2X+']);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Cashback credited
  const { data: cashbackData } = useQuery({
    queryKey: ['chart-cashback-credits', startDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cashback_items')
        .select('created_at, cashback_value, status')
        .gte('created_at', `${startDate}T00:00:00`)
        .eq('status', 'CREDITADO');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Campaign participants credited
  const { data: campaignData } = useQuery({
    queryKey: ['chart-campaign-credits', startDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_participants')
        .select('created_at, total_value, status')
        .gte('created_at', `${startDate}T00:00:00`)
        .eq('status', 'CREDITADO');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Audit log activity + manual credits
  const { data: auditData } = useQuery({
    queryKey: ['chart-audit-activity', startDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('created_at, action, resource_type, details')
        .gte('created_at', `${startDate}T00:00:00`);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Build daily metrics
  const metrics: DailyMetric[] = daysArray.map(({ dateISO, label }) => {
    const dayStart = `${dateISO}T00:00:00`;
    const dayEnd = `${dateISO}T23:59:59`;
    const inDay = (d: string) => d >= dayStart && d <= dayEnd;

    const batchCredits = (batchData || []).filter(b => inDay(b.created_at)).length;
    // Count manual credits from audit_log (bonus_manual)
    const manualCredits = (auditData || []).filter(a =>
      inDay(a.created_at) && a.action === 'CREDITAR' && a.resource_type === 'bonus_manual'
    ).length;
    const cashbackCredits = (cashbackData || []).filter(c => inDay(c.created_at))
      .reduce((sum, c) => sum + Number(c.cashback_value || 0), 0);
    const campaignCredits = (campaignData || []).filter(c => inDay(c.created_at))
      .reduce((sum, c) => sum + Number(c.total_value || 0), 0);

    return {
      date: label,
      dateISO,
      depositos: 0,
      saques: 0,
      ggr: 0,
      bonus_creditado: batchCredits + manualCredits,
      cashback_creditado: cashbackCredits,
      campanhas_creditado: campaignCredits,
      novos_usuarios: 0,
    };
  });

  // Activity by day for the activity chart
  const activityByDay = daysArray.map(({ dateISO, label }) => {
    const dayStart = `${dateISO}T00:00:00`;
    const dayEnd = `${dateISO}T23:59:59`;
    const dayActions = (auditData || []).filter(a => a.created_at >= dayStart && a.created_at <= dayEnd);

    const logins = dayActions.filter(a => a.action === 'LOGIN').length;
    const operations = dayActions.filter(a => !['LOGIN', 'LOGOUT', 'LOGIN_FALHA'].includes(a.action)).length;

    return { date: label, logins, operacoes: operations };
  });

  // Summary totals for the period
  const manualCreditTotal = (auditData || []).filter(a => a.action === 'CREDITAR' && a.resource_type === 'bonus_manual').length;
  const totals = {
    bonus_creditados: (batchData || []).length + manualCreditTotal,
    cashback_total: (cashbackData || []).reduce((s, c) => s + Number(c.cashback_value || 0), 0),
    campanhas_total: (campaignData || []).reduce((s, c) => s + Number(c.total_value || 0), 0),
    acoes_total: (auditData || []).length,
  };

  const refreshCharts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['chart-batch-credits'] });
    queryClient.invalidateQueries({ queryKey: ['chart-cashback-credits'] });
    queryClient.invalidateQueries({ queryKey: ['chart-campaign-credits'] });
    queryClient.invalidateQueries({ queryKey: ['chart-audit-activity'] });
  }, [queryClient]);

  return { metrics, activityByDay, totals, days: daysArray, refreshCharts };
}

// Financial evolution - calls API for each day in the period
export function useFinancialEvolution(
  days: number,
  callProxy: (action: string, creds: any, params?: any) => Promise<any>,
  creds: { username: string; password: string },
) {
  const queryClient = useQueryClient();
  const daysArray = getDaysArray(days);

  const { data: financialDaily = [], isLoading } = useQuery({
    queryKey: ['chart-financial-daily', creds.username, days],
    enabled: !!creds.username && !!creds.password,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const results: { date: string; depositos: number; saques: number; ggr: number; newUsers: number }[] = [];
      const CONCURRENCY = 5;

      for (let i = 0; i < daysArray.length; i += CONCURRENCY) {
        const batch = daysArray.slice(i, i + CONCURRENCY);
        const promises = batch.map(async ({ dateISO, label }) => {
          try {
            const res = await callProxy('financeiro', creds, {
              busca_data_inicio: dateISO,
              busca_data_fim: dateISO,
              length: 100,
            });
            const d = res?.data;
            return {
              date: label,
              depositos: Number(d?.depositos || 0),
              saques: Number(d?.saques || 0),
              ggr: Number(d?.total?.ggr || 0),
              newUsers: Number(d?.newUsers || 0),
            };
          } catch {
            return { date: label, depositos: 0, saques: 0, ggr: 0, newUsers: 0 };
          }
        });
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
      }

      return results;
    },
  });

  const refreshFinancial = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['chart-financial-daily'] });
  }, [queryClient]);

  return { financialDaily, isLoading, refreshFinancial };
}
