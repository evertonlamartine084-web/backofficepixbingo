/* eslint-disable @typescript-eslint/no-explicit-any */
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

export type CampaignType = 'aposte_e_ganhe' | 'deposite_e_ganhe' | 'ganhou_no_keno';
export type CampaignStatus = 'RASCUNHO' | 'ATIVA' | 'PAUSADA' | 'ENCERRADA';

export const TYPE_LABELS: Record<CampaignType, string> = {
  aposte_e_ganhe: 'Aposte e Ganhe',
  deposite_e_ganhe: 'Deposite e Ganhe',
  ganhou_no_keno: 'Ganhou no Keno',
};

export const STATUS_COLORS: Record<CampaignStatus, string> = {
  RASCUNHO: 'bg-muted text-muted-foreground',
  ATIVA: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PAUSADA: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ENCERRADA: 'bg-red-500/15 text-red-400 border-red-500/30',
};

export const PARTICIPANT_STATUS_COLORS: Record<string, string> = {
  PENDENTE: 'bg-muted text-muted-foreground',
  NAO_ELEGIVEL: 'bg-amber-500/15 text-amber-400',
  CREDITADO: 'bg-emerald-500/15 text-emerald-400',
  ERRO: 'bg-red-500/15 text-red-400',
};

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  description: string;
  segment_id: string | null;
  popup_id: string | null;
  min_value: number;
  prize_value: number;
  prize_description: string;
  start_date: string;
  end_date: string;
  status: CampaignStatus;
  created_at: string;
  wallet_type: 'REAL' | 'BONUS';
  segment_name?: string;
  popup_name?: string;
  game_filter?: string;
  metric?: string;
}

export interface Participant {
  id: string;
  campaign_id: string;
  cpf: string;
  cpf_masked: string;
  uuid: string | null;
  status: string;
  total_value: number;
  prize_credited: boolean;
  credit_result: string | null;
  created_at: string;
}

export function useCampaigns() {
  const queryClient = useQueryClient();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const segmentIds = [...new Set((data as any[]).filter(c => c.segment_id).map(c => c.segment_id))];
      const popupIds = [...new Set((data as any[]).filter(c => c.popup_id).map(c => c.popup_id))];
      let segmentMap: Record<string, string> = {};
      let popupMap: Record<string, string> = {};
      if (segmentIds.length > 0) {
        const { data: segments } = await supabase.from('segments').select('id, name').in('id', segmentIds);
        if (segments) segmentMap = Object.fromEntries(segments.map(s => [s.id, s.name]));
      }
      if (popupIds.length > 0) {
        const { data: popups } = await supabase.from('popups').select('id, name').in('id', popupIds);
        if (popups) popupMap = Object.fromEntries(popups.map(p => [p.id, p.name]));
      }
      return (data as any[]).map(c => ({
        ...c,
        segment_name: c.segment_id ? segmentMap[c.segment_id] || '—' : null,
        popup_name: c.popup_id ? popupMap[c.popup_id] || '—' : null,
      })) as Campaign[];
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

  const { data: popupsList = [] } = useQuery({
    queryKey: ['popups-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('popups').select('id, name').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: partidas = [] } = useQuery({
    queryKey: ['partidas-list'],
    queryFn: async () => {
      const creds = getSavedCredentials();
      if (!creds.username || !creds.password) return [];
      const res = await fetch('/api/pixbingo-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list_partidas',
          site_url: 'https://pixbingobr.concurso.club',
          login_url: 'https://pixbingobr.concurso.club/login',
          username: creds.username,
          password: creds.password,
        }),
      });
      const data = res.ok ? await res.json() : null;
      if (!data?.success) return [];
      const items = data.data?.aaData || data.data?.data || [];
      const uniqueValues = new Map<string, { valor: string; tipo: string; count: number }>();
      for (const p of items) {
        if (p.ativo !== '1') continue;
        const valor = String(p.valor_dia || '0').replace(',', '.');
        const tipo = String(p.tipo_partida || 'SIMPLES');
        const key = `${valor}_${tipo}`;
        if (uniqueValues.has(key)) {
          uniqueValues.get(key)!.count++;
        } else {
          uniqueValues.set(key, { valor, tipo, count: 1 });
        }
      }
      return Array.from(uniqueValues.entries()).map(([key, v]) => ({
        key,
        label: `R$ ${Number(v.valor).toFixed(2)} - ${v.tipo} (${v.count} rodadas)`,
        valor: v.valor,
        tipo: v.tipo,
      }));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (form: {
      name: string; type: CampaignType; description: string; segment_id: string;
      popup_id: string; min_value: string; prize_value: string; prize_description: string;
      wallet_type: 'REAL' | 'BONUS'; metric: string; game_filter: string;
      start_date?: Date; end_date?: Date;
    }) => {
      if (!form.name || !form.start_date || !form.end_date) throw new Error('Preencha os campos obrigatórios');
      const { error } = await supabase.from('campaigns').insert({
        name: form.name, type: form.type, description: form.description,
        segment_id: form.segment_id || null,
        popup_id: form.popup_id || null,
        min_value: Number(form.min_value) || 0, prize_value: Number(form.prize_value) || 0,
        prize_description: form.prize_description,
        wallet_type: form.wallet_type,
        metric: form.metric,
        game_filter: form.game_filter || null,
        start_date: form.start_date.toISOString(), end_date: form.end_date.toISOString(),
      } as any);
      if (error) throw error;
    },
    onSuccess: (_data, form) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campanha criada com sucesso');
      logAudit({ action: 'CRIAR', resource_type: 'campanha', resource_name: form.name, details: { type: form.type, segment_id: form.segment_id, min_value: form.min_value, prize_value: form.prize_value, wallet_type: form.wallet_type } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const camp = campaigns.find(c => c.id === id);
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) throw error;
      return camp;
    },
    onSuccess: (camp) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campanha excluída');
      logAudit({ action: 'EXCLUIR', resource_type: 'campanha', resource_id: camp?.id, resource_name: camp?.name });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CampaignStatus }) => {
      const camp = campaigns.find(c => c.id === id);
      const oldStatus = camp?.status;
      const updateData: any = { status };
      if (status === 'ATIVA') updateData.activated_at = new Date().toISOString();
      const { error } = await supabase.from('campaigns').update(updateData).eq('id', id);
      if (error) throw error;
      return { id, status, oldStatus, name: camp?.name };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Status atualizado');
      logAudit({ action: 'STATUS', resource_type: 'campanha', resource_id: result.id, resource_name: result.name, details: { from: result.oldStatus, to: result.status } });
    },
  });

  return {
    campaigns, isLoading, segments, popupsList, partidas,
    createMutation, deleteMutation, updateStatusMutation,
  };
}

export function useCampaignParticipants(campaignId: string | undefined) {
  const { data: participants = [], refetch } = useQuery({
    queryKey: ['campaign-participants', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_participants').select('*')
        .eq('campaign_id', campaignId!)
        .order('status', { ascending: true });
      if (error) throw error;
      return (data || []) as Participant[];
    },
  });

  useEffect(() => {
    if (!campaignId) return;
    const channel = supabase
      .channel(`campaign-${campaignId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'campaign_participants',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => { refetch(); })
      .subscribe();
    return () => { channel.unsubscribe(); supabase.removeChannel(channel); };
  }, [campaignId, refetch]);

  return { participants, refetchParticipants: refetch };
}

export function useCampaignProcessing(campaigns: Campaign[]) {
  const [processing, setProcessing] = useState(false);
  const [autoProcessing, setAutoProcessing] = useState<Set<string>>(new Set());
  const autoProcessRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const doStop = (campaignId: string) => {
    const timer = autoProcessRef.current.get(campaignId);
    if (timer) clearTimeout(timer);
    autoProcessRef.current.delete(campaignId);
    setAutoProcessing(prev => {
      const next = new Set(prev);
      next.delete(campaignId);
      return next;
    });
  };

  const stopAutoProcess = useCallback((campaignId: string) => {
    doStop(campaignId);
  }, []);

  const startAutoProcess = useCallback((campaign: Campaign, silent = false) => {
    const creds = getSavedCredentials();
    if (!creds.username || !creds.password) {
      if (!silent) toast.error('Configure as credenciais da plataforma primeiro (barra superior)');
      return;
    }
    if (!campaign.segment_id) {
      if (!silent) toast.error('Campanha sem segmento vinculado');
      return;
    }
    if (autoProcessRef.current.has(campaign.id)) return;

    if (!silent) toast.info(`Processamento automático iniciado para "${campaign.name}"`);
    setAutoProcessing(prev => new Set(prev).add(campaign.id));

    let totalCredited = 0;
    let totalErrors = 0;
    let consecutiveErrors = 0;

    const runIteration = async () => {
      try {
        const authHeaders = await getAuthHeaders();
        const _res = await fetch('/api/process-campaign', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ campaign_id: campaign.id, username: creds.username, password: creds.password }),
        });
        const data = await _res.json();
        if (!data?.success) throw new Error(data?.error || 'Erro');

        consecutiveErrors = 0;
        const result = data.data;
        totalCredited += result.credited || 0;
        totalErrors += result.errors || 0;

        const { data: campData } = await supabase
          .from('campaigns').select('status, popup_id').eq('id', campaign.id).single();

        if (campData?.status !== 'ATIVA') {
          doStop(campaign.id);
          toast.success(`Processamento concluído: ${totalCredited} creditados, ${totalErrors} erros`);
          return;
        }

        // If there are remaining participants, continue immediately (small delay to avoid hammering)
        if (result.remaining > 0) {
          const timer = setTimeout(runIteration, 1500);
          autoProcessRef.current.set(campaign.id, timer);
        } else {
          // All done for now
          doStop(campaign.id);
          if (totalCredited > 0 || totalErrors > 0) {
            toast.success(`Lote concluído: ${totalCredited} creditados, ${totalErrors} erros`);
          }
        }
      } catch (e: any) {
        console.error('Erro no processamento automático:', e.message);
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          doStop(campaign.id);
          toast.error(`Processamento parado após 5 erros seguidos: ${e.message}`);
          return;
        }
        // Retry with backoff
        const delay = Math.min(5000 * consecutiveErrors, 30000);
        const timer = setTimeout(runIteration, delay);
        autoProcessRef.current.set(campaign.id, timer);
      }
    };

    runIteration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processCampaign = async (campaign: Campaign, onDone?: () => void) => {
    if (processing || autoProcessing.has(campaign.id)) {
      toast.warning('Processamento já em andamento para esta campanha');
      return;
    }
    const creds = getSavedCredentials();
    if (!creds.username || !creds.password) {
      toast.error('Configure as credenciais da plataforma primeiro (barra superior)');
      return;
    }
    if (!campaign.segment_id) {
      toast.error('Campanha sem segmento vinculado');
      return;
    }
    setProcessing(true);
    let totalProcessed = 0, totalCredited = 0, totalErrors = 0;
    try {
      let remaining = 1;
      while (remaining > 0) {
        const authHeaders = await getAuthHeaders();
        const _res = await fetch('/api/process-campaign', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ campaign_id: campaign.id, username: creds.username, password: creds.password }),
        });
        const data = await _res.json();
        if (!data?.success) throw new Error(data?.error || 'Erro ao processar campanha');
        const result = data.data;
        totalProcessed += result.processed || 0;
        totalCredited += result.credited || 0;
        totalErrors += result.errors || 0;
        remaining = result.remaining || 0;

        if (remaining > 0) {
          toast.info(`Processando... ${totalProcessed} feitos, ${remaining} restantes`);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      toast.success(`Concluído: ${totalProcessed} processados | ${totalCredited} creditados | ${totalErrors} erros`);
      onDone?.();
    } catch (e: any) {
      if (totalProcessed > 0) {
        toast.warning(`Parcial: ${totalProcessed} processados, ${totalCredited} creditados antes do erro: ${e.message}`);
      } else {
        toast.error(e.message || 'Erro ao processar');
      }
    } finally {
      setProcessing(false);
    }
  };

  // Auto-resume processing for all ATIVA campaigns on page load
  useEffect(() => {
    const creds = getSavedCredentials();
    if (!creds.username || !creds.password) return;

    const activeCampaigns = campaigns.filter(c => c.status === 'ATIVA' && c.segment_id);
    for (const campaign of activeCampaigns) {
      if (!autoProcessRef.current.has(campaign.id)) {
        startAutoProcess(campaign, true);
      }
    }
  }, [campaigns, startAutoProcess]);

  useEffect(() => {
    const ref = autoProcessRef.current;
    return () => {
      ref.forEach(timer => clearTimeout(timer));
      ref.clear();
    };
  }, []);

  return { processing, autoProcessing, startAutoProcess, stopAutoProcess, processCampaign };
}
