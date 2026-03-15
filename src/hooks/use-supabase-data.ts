import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BatchStatus, ItemStatus } from '@/types';

// ── Batches ──
export function useBatches() {
  return useQuery({
    queryKey: ['batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Array<{
        id: string; name: string; flow_id: string | null; flow_name: string | null;
        total_items: number; processed: number; status: string; bonus_valor: number;
        stats: { pendente: number; processando: number; sem_bonus: number; bonus_1x: number; bonus_2x_plus: number; erro: number };
        created_at: string; updated_at: string;
      }>;
    },
  });
}

export function useBatch(id: string | undefined) {
  return useQuery({
    queryKey: ['batches', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

// ── Batch Items ──
export function useBatchItems(batchId?: string) {
  return useQuery({
    queryKey: ['batch_items', batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_items')
        .select('*')
        .eq('batch_id', batchId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Array<{
        id: string; batch_id: string; cpf: string; cpf_masked: string; uuid: string | null;
        status: string; tentativas: number; qtd_bonus: number;
        datas_bonus: string[]; ultima_data_bonus: string | null; log: string[];
        created_at: string; updated_at: string;
      }>;
    },
  });
}

export function useDuplicates() {
  return useQuery({
    queryKey: ['duplicates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_items')
        .select('*')
        .eq('status', 'BONUS_2X+')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as Array<{
        id: string; batch_id: string; cpf: string; cpf_masked: string; uuid: string | null;
        status: string; tentativas: number; qtd_bonus: number;
        datas_bonus: string[]; ultima_data_bonus: string | null; log: string[];
        created_at: string; updated_at: string;
      }>;
    },
  });
}

// ── Dashboard Stats ──
export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard_stats'],
    queryFn: async () => {
      const { data: batches, error: bErr } = await supabase.from('batches').select('stats');
      if (bErr) throw bErr;

      const totals = {
        total_batches: batches?.length || 0,
        total_items: 0, pendente: 0, processando: 0, sem_bonus: 0,
        bonus_1x: 0, bonus_2x_plus: 0, erro: 0,
      };

      for (const b of batches || []) {
        const s = b.stats as any;
        if (!s) continue;
        totals.total_items += ((s.pendente || 0) + (s.processando || 0) + (s.sem_bonus || 0) + (s.bonus_1x || 0) + (s.bonus_2x_plus || 0) + (s.erro || 0));
        totals.pendente += (s.pendente || 0);
        totals.processando += (s.processando || 0);
        totals.sem_bonus += (s.sem_bonus || 0);
        totals.bonus_1x += (s.bonus_1x || 0);
        totals.bonus_2x_plus += (s.bonus_2x_plus || 0);
        totals.erro += (s.erro || 0);
      }

      return totals;
    },
  });
}

// ── Endpoints ──
export function useEndpoints() {
  return useQuery({
    queryKey: ['endpoints'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('endpoints')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// ── Credentials ──
export function useCredentials() {
  return useQuery({
    queryKey: ['credentials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credentials')
        .select('id, name, type, value_masked, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// ── Flows ──
export function useFlows() {
  return useQuery({
    queryKey: ['flows'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flows')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// ── Bonus Rules ──
export function useBonusRules() {
  return useQuery({
    queryKey: ['bonus_rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bonus_rules')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
