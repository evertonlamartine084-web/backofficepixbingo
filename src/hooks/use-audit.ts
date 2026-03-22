/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuditEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_name: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

// Fire-and-forget audit log — never blocks the caller
export async function logAudit(params: {
  action: string;
  resource_type: string;
  resource_id?: string;
  resource_name?: string;
  details?: Record<string, any>;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('audit_log').insert({
      user_id: user?.id || null,
      user_email: user?.email || null,
      action: params.action,
      resource_type: params.resource_type,
      resource_id: params.resource_id || null,
      resource_name: params.resource_name || null,
      details: params.details || null,
    } as any);
  } catch (err) {
    // Never let audit failure break the app, but log for debugging
    console.warn('[Audit] Failed to log action:', params.action, err);
  }
}

export function useAuditLog(filters?: {
  action?: string;
  resource_type?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const { data: entries = [], isLoading, refetch } = useQuery({
    queryKey: ['audit-log', filters?.action, filters?.resource_type, limit, offset],
    queryFn: async () => {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (filters?.action) query = query.eq('action', filters.action);
      if (filters?.resource_type) query = query.eq('resource_type', filters.resource_type);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AuditEntry[];
    },
  });

  const { data: totalCount = 0 } = useQuery({
    queryKey: ['audit-log-count', filters?.action, filters?.resource_type],
    queryFn: async () => {
      let query = supabase
        .from('audit_log')
        .select('id', { count: 'exact', head: true });

      if (filters?.action) query = query.eq('action', filters.action);
      if (filters?.resource_type) query = query.eq('resource_type', filters.resource_type);

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
  });

  return { entries, totalCount, isLoading, refetch };
}
