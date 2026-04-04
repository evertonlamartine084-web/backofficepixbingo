import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { ApiCredentialsBar } from '@/components/ApiCredentialsBar';
import { useProxy } from '@/hooks/use-proxy';
import { maskCPF, parseCPFList } from '@/lib/formatters';
import { logAudit } from '@/hooks/use-audit';

import { SegmentForm } from './segments/SegmentForm';
import { SegmentFilters } from './segments/SegmentFilters';
import { SegmentPlayerList } from './segments/SegmentPlayerList';
import type {
  SegmentRow, SegmentItemRow, AllUserItem, ProxyUserRecord,
  WalletEntry, TransactionEntry, SegmentRule, VerifyResult,
} from './segments/types';
import { ALL_USERS_ID } from './segments/types';

export default function Segments() {
  const qc = useQueryClient();
  const { callProxy } = useProxy();
  const [creds, setCreds] = useState({ username: 'auto', password: 'auto' });
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [addCpfOpen, setAddCpfOpen] = useState(false);
  const [cpfInput, setCpfInput] = useState('');
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState('10');
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditProgress, setCreditProgress] = useState({ current: 0, total: 0, credited: 0, errors: 0 });

  // Create segment form
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<'manual' | 'automatic'>('manual');
  const [newRules, setNewRules] = useState<SegmentRule[]>([]);
  const [newMatchType, setNewMatchType] = useState<'all' | 'any'>('all');
  const [newAutoRefresh, setNewAutoRefresh] = useState(false);
  const [newColor, setNewColor] = useState('#6d28d9');
  const [newIcon, setNewIcon] = useState('users');

  // Edit rules state
  const [editRulesOpen, setEditRulesOpen] = useState(false);
  const [editRules, setEditRules] = useState<SegmentRule[]>([]);
  const [editMatchType, setEditMatchType] = useState<'all' | 'any'>('all');
  const [editAutoRefresh, setEditAutoRefresh] = useState(false);

  // Preview
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewSample, setPreviewSample] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Evaluation
  const [evaluating, setEvaluating] = useState(false);

  // Verification state
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyDays, setVerifyDays] = useState('7');
  const [verifyConcurrency, setVerifyConcurrency] = useState('15');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState({ current: 0, total: 0 });
  const [verifyResults, setVerifyResults] = useState<Record<string, VerifyResult>>({});
  const [verifyDone, setVerifyDone] = useState(false);
  const [verifyMode, setVerifyMode] = useState<'received' | 'balance'>('received');

  // Abort refs
  const verifyCancelRef = useRef(false);
  const creditCancelRef = useRef(false);

  // ── Queries ──
  const { data: segments, isLoading } = useQuery({
    queryKey: ['segments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('segments')
        .select('*, segment_items(count)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((s: SegmentRow) => ({
        ...s,
        item_count: s.segment_items?.[0]?.count || 0,
      }));
    },
  });

  const [allUsersFetchProgress, setAllUsersFetchProgress] = useState({ loaded: 0, total: 0 });
  const { data: allUsersItems, isLoading: allUsersQueryLoading } = useQuery({
    queryKey: ['all_users_segment', creds.username],
    enabled: selectedSegment === ALL_USERS_ID && !!creds.username,
    queryFn: async () => {
      setAllUsersLoading(true);
      setAllUsersFetchProgress({ loaded: 0, total: 0 });
      try {
        const PAGE_SIZE = 1000;
        let totalRecords = 0;
        const allUsers: ProxyUserRecord[] = [];
        const firstRes = await callProxy('list_users', creds, { start: 0, length: PAGE_SIZE });
        const firstData = firstRes?.data;
        totalRecords = parseInt(firstData?.iTotalRecords || firstData?.iTotalDisplayRecords || firstData?.recordsTotal || firstData?.recordsFiltered || '0', 10);
        const firstBatch = firstData?.aaData || [];
        allUsers.push(...firstBatch);
        setAllUsersFetchProgress({ loaded: allUsers.length, total: totalRecords });
        const CONCURRENCY = 5;
        const remainingPages: number[] = [];
        for (let s = PAGE_SIZE; s < totalRecords; s += PAGE_SIZE) remainingPages.push(s);
        for (let i = 0; i < remainingPages.length; i += CONCURRENCY) {
          const batch = remainingPages.slice(i, i + CONCURRENCY);
          const results = await Promise.all(batch.map(s => callProxy('list_users', creds, { start: s, length: PAGE_SIZE })));
          for (const res of results) {
            const items = res?.data?.aaData || [];
            allUsers.push(...items);
          }
          setAllUsersFetchProgress({ loaded: allUsers.length, total: totalRecords });
        }
        return allUsers.map((u: ProxyUserRecord, i: number): AllUserItem => ({
          id: `all-user-${i}`, cpf: u.cpf || '', cpf_masked: maskCPF(u.cpf || ''),
          created_at: u.created_at || '', username: u.username || u.name || '', uuid: u.uuid || '',
        }));
      } finally { setAllUsersLoading(false); }
    },
    staleTime: 10 * 60 * 1000,
  });

  // Pagination
  const [tablePage, setTablePage] = useState(0);
  const [tablePageSize, setTablePageSize] = useState(25);

  const { data: itemsPage, isLoading: itemsLoading } = useQuery({
    queryKey: ['segment_items', selectedSegment, tablePage, tablePageSize],
    enabled: !!selectedSegment && selectedSegment !== ALL_USERS_ID,
    queryFn: async () => {
      const from = tablePage * tablePageSize;
      const to = from + tablePageSize - 1;
      const { data, error } = await supabase
        .from('segment_items').select('*')
        .eq('segment_id', selectedSegment!)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: itemsTotalCount = 0 } = useQuery({
    queryKey: ['segment_items_count', selectedSegment],
    enabled: !!selectedSegment && selectedSegment !== ALL_USERS_ID,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('segment_items').select('id', { count: 'exact', head: true })
        .eq('segment_id', selectedSegment!);
      if (error) throw error;
      return count || 0;
    },
  });

  const fetchAllSegmentItems = async () => {
    if (!selectedSegment || selectedSegment === ALL_USERS_ID) return [];
    const allItems: SegmentItemRow[] = [];
    const batchSize = 1000;
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from('segment_items').select('*')
        .eq('segment_id', selectedSegment)
        .order('created_at', { ascending: false })
        .range(offset, offset + batchSize - 1);
      if (error) throw error;
      if (data && data.length > 0) {
        allItems.push(...(data as SegmentItemRow[]));
        offset += batchSize;
        hasMore = data.length === batchSize;
      } else { hasMore = false; }
    }
    return allItems;
  };

  const isAllUsers = selectedSegment === ALL_USERS_ID;
  const effectiveItemsLoading = isAllUsers ? (allUsersQueryLoading || allUsersLoading) : itemsLoading;
  const effectiveItemsCount = isAllUsers ? (allUsersItems?.length || 0) : itemsTotalCount;
  const tableTotalPages = Math.max(1, Math.ceil(effectiveItemsCount / tablePageSize));
  const tableStart = tablePage * tablePageSize;
  const pagedItems = isAllUsers
    ? (allUsersItems?.slice(tableStart, tableStart + tablePageSize) || [])
    : (itemsPage || []);

  const prevSegRef = useRef(selectedSegment);
  if (prevSegRef.current !== selectedSegment) {
    prevSegRef.current = selectedSegment;
    setTablePage(0);
  }

  // ── Mutations ──
  const createMut = useMutation({
    mutationFn: async () => {
      const insertData: Record<string, unknown> = { name: newName, description: newDesc };
      if (newType === 'automatic') {
        insertData.segment_type = 'automatic';
        insertData.rules = newRules;
        insertData.match_type = newMatchType;
        insertData.auto_refresh = newAutoRefresh;
        insertData.color = newColor;
        insertData.icon = newIcon;
      } else {
        insertData.segment_type = 'manual';
        insertData.color = newColor;
        insertData.icon = newIcon;
      }
      const { data, error } = await supabase.from('segments').insert(insertData).select().single();
      if (error) throw error;

      // If automatic, evaluate immediately
      if (newType === 'automatic' && newRules.length > 0 && data) {
        await evaluateSegmentRules(data.id, newRules, newMatchType);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments'] });
      resetCreateForm();
      setCreateOpen(false);
      toast.success('Segmento criado!');
      logAudit({ action: 'CRIAR', resource_type: 'segmento', resource_name: newName });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('segments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      const seg = segments?.find((s: SegmentRow) => s.id === id);
      qc.invalidateQueries({ queryKey: ['segments'] });
      if (selectedSegment) setSelectedSegment(null);
      toast.success('Segmento excluido!');
      logAudit({ action: 'EXCLUIR', resource_type: 'segmento', resource_id: id, resource_name: seg?.name });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  const addCpfsMut = useMutation({
    mutationFn: async () => {
      const cpfs = parseCPFList(cpfInput);
      if (cpfs.length === 0) throw new Error('Nenhum CPF valido encontrado');
      const rows = cpfs.map(cpf => ({ segment_id: selectedSegment!, cpf, cpf_masked: maskCPF(cpf), source: 'manual' }));
      const { error } = await supabase.from('segment_items').upsert(rows, { onConflict: 'segment_id,cpf', ignoreDuplicates: true });
      if (error) throw error;
      return cpfs.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['segment_items', selectedSegment] });
      qc.invalidateQueries({ queryKey: ['segment_items_count', selectedSegment] });
      qc.invalidateQueries({ queryKey: ['segments'] });
      setCpfInput(''); setAddCpfOpen(false);
      toast.success(`${count} CPF(s) adicionado(s)!`);
      const seg = segments?.find((s: SegmentRow) => s.id === selectedSegment);
      logAudit({ action: 'EDITAR', resource_type: 'segmento', resource_id: selectedSegment || undefined, resource_name: seg?.name, details: { cpfs_added: count } });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  const removeCpfMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('segment_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segment_items', selectedSegment] });
      qc.invalidateQueries({ queryKey: ['segment_items_count', selectedSegment] });
      qc.invalidateQueries({ queryKey: ['segments'] });
      toast.success('CPF removido');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  // ── Helpers ──
  const resetCreateForm = () => {
    setNewName(''); setNewDesc(''); setNewType('manual'); setNewRules([]);
    setNewMatchType('all'); setNewAutoRefresh(false); setNewColor('#6d28d9'); setNewIcon('users');
    setPreviewCount(null); setPreviewSample([]);
  };

  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const evaluateSegmentRules = async (segmentId: string, rules: SegmentRule[], matchType: string) => {
    const token = await getAuthToken();
    const baseUrl = window.location.origin;
    const res = await fetch(`${baseUrl}/api/segment-evaluate?action=evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ segment_id: segmentId, rules, match_type: matchType }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao avaliar regras');
    }
    return res.json();
  };

  const previewRules = async (rules: SegmentRule[], matchType: string) => {
    if (rules.length === 0) { setPreviewCount(null); setPreviewSample([]); return; }
    setPreviewLoading(true);
    try {
      const token = await getAuthToken();
      const baseUrl = window.location.origin;
      const res = await fetch(`${baseUrl}/api/segment-evaluate?action=preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ rules, match_type: matchType }),
      });
      if (!res.ok) throw new Error('Erro no preview');
      const data = await res.json();
      setPreviewCount(data.count);
      setPreviewSample(data.sample || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro');
    } finally { setPreviewLoading(false); }
  };

  const selectedSeg = selectedSegment === ALL_USERS_ID
    ? { id: ALL_USERS_ID, name: 'All Users', description: 'Todos os jogadores cadastrados na plataforma', item_count: allUsersItems?.length || 0, segment_type: 'manual' as const, rules: [] as SegmentRule[], match_type: 'all' } as SegmentRow
    : segments?.find((s: SegmentRow) => s.id === selectedSegment);

  const handleReEvaluate = async () => {
    if (!selectedSeg || selectedSeg.segment_type !== 'automatic') return;
    setEvaluating(true);
    try {
      const result = await evaluateSegmentRules(selectedSeg.id, selectedSeg.rules || [], selectedSeg.match_type || 'all');
      toast.success(`Segmento reavaliado: ${result.count} jogadores encontrados`);
      qc.invalidateQueries({ queryKey: ['segments'] });
      qc.invalidateQueries({ queryKey: ['segment_items', selectedSegment] });
      qc.invalidateQueries({ queryKey: ['segment_items_count', selectedSegment] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro');
    } finally { setEvaluating(false); }
  };

  const handleSaveRules = async () => {
    if (!selectedSeg) return;
    try {
      const { error } = await supabase.from('segments').update({
        rules: editRules,
        match_type: editMatchType,
        auto_refresh: editAutoRefresh,
      }).eq('id', selectedSeg.id);
      if (error) throw error;

      // Re-evaluate
      if (editRules.length > 0) {
        setEvaluating(true);
        await evaluateSegmentRules(selectedSeg.id, editRules, editMatchType);
        setEvaluating(false);
      }

      qc.invalidateQueries({ queryKey: ['segments'] });
      qc.invalidateQueries({ queryKey: ['segment_items', selectedSegment] });
      qc.invalidateQueries({ queryKey: ['segment_items_count', selectedSegment] });
      setEditRulesOpen(false);
      toast.success('Regras atualizadas e segmento reavaliado!');
    } catch (err: unknown) {
      setEvaluating(false);
      toast.error(err instanceof Error ? err.message : 'Erro');
    }
  };

  // ── Mass credit ──
  const handleMassCredit = async () => {
    if (!creds.username || !creds.password) { toast.error('Conecte-se primeiro com suas credenciais'); return; }
    if (!selectedSegment || effectiveItemsCount === 0) { toast.error('Segmento sem CPFs'); return; }
    setCreditLoading(true);
    creditCancelRef.current = false;
    const allItems = isAllUsers ? (allUsersItems || []) : await fetchAllSegmentItems();
    if (allItems.length === 0) { toast.error('Segmento sem CPFs'); setCreditLoading(false); return; }
    setCreditProgress({ current: 0, total: allItems.length, credited: 0, errors: 0 });
    try {
      const batchName = `${selectedSeg?.name || 'Segmento'} - Credito ${new Date().toLocaleDateString('pt-BR')}`;
      const { data: batch, error: batchErr } = await supabase.from('batches').insert({
        name: batchName, bonus_valor: parseFloat(creditAmount) || 0, total_items: allItems.length, status: 'EM_ANDAMENTO',
      }).select().single();
      if (batchErr || !batch) throw new Error(batchErr?.message || 'Erro ao criar lote');
      if (creditCancelRef.current) { toast.info('Creditacao cancelada'); setCreditLoading(false); return; }
      const batchItems = allItems.map((item: SegmentItemRow | AllUserItem) => ({
        batch_id: batch.id, cpf: item.cpf, cpf_masked: item.cpf_masked, status: 'PENDENTE',
      }));
      const { error: itemsErr } = await supabase.from('batch_items').insert(batchItems);
      if (itemsErr) throw new Error(itemsErr.message);
      if (creditCancelRef.current) { toast.info('Creditacao cancelada'); setCreditLoading(false); return; }
      const res = await callProxy('credit_batch', creds, { batch_id: batch.id, bonus_amount: parseFloat(creditAmount) });
      const result = res?.data;
      setCreditProgress({ current: allItems.length, total: allItems.length, credited: result?.credited || 0, errors: result?.errors || 0 });
      if (result?.credited > 0) toast.success(`${result.credited} bonus creditados com sucesso!`);
      if (result?.errors > 0) toast.warning(`${result.errors} erros durante o processamento`);
      const seg = segments?.find((s: SegmentRow) => s.id === selectedSegment);
      logAudit({ action: 'CREDITAR', resource_type: 'batch', resource_name: seg?.name, details: { segment_id: selectedSegment, amount: creditAmount, total: allItems.length, credited: result?.credited || 0, errors: result?.errors || 0 } });
      qc.invalidateQueries({ queryKey: ['batches'] });
    } catch (err: unknown) {
      if (!creditCancelRef.current) toast.error(err instanceof Error ? err.message : 'Erro na creditacao em massa');
    } finally { setCreditLoading(false); }
  };

  // ── Export CSV ──
  const exportVerifyCSV = (filter?: 'all' | 'with' | 'without') => {
    const entries = Object.entries(verifyResults);
    if (entries.length === 0) return;
    let filtered = entries;
    let filename = 'verificacao';
    const fmtCpf = (cpf: string) => `="${cpf.replace(/\D/g, '').padStart(11, '0')}"`;
    if (verifyMode === 'balance') {
      if (filter === 'with') { filtered = entries.filter(([, r]) => (r.bonusBalance || 0) > 0); filename = 'com_saldo_bonus'; }
      else if (filter === 'without') { filtered = entries.filter(([, r]) => (r.bonusBalance || 0) === 0); filename = 'sem_saldo_bonus'; }
      else { filename = 'saldo_bonus_todos'; }
      const header = 'CPF,Saldo Bonus\n';
      const rows = filtered.map(([cpf, r]) => `${fmtCpf(cpf)},${(r.bonusBalance || 0).toFixed(2)}`).join('\n');
      downloadCSV(header + rows, filename);
    } else {
      if (filter === 'with') { filtered = entries.filter(([, r]) => r.hasBonus); filename = 'com_bonus'; }
      else if (filter === 'without') { filtered = entries.filter(([, r]) => !r.hasBonus); filename = 'sem_bonus'; }
      else { filename = 'bonus_todos'; }
      const header = 'CPF,Tem Bonus,Qtd Bonus,Ultimo Bonus\n';
      const rows = filtered.map(([cpf, r]) => `${fmtCpf(cpf)},${r.hasBonus ? 'Sim' : 'Nao'},${r.bonusCount},${r.lastBonusDate || ''}`).join('\n');
      downloadCSV(header + rows, filename);
    }
  };

  const downloadCSV = (content: string, filename: string) => {
    const bom = '\uFEFF';
    const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('CSV exportado!');
  };

  // ── Verify bonus ──
  const handleVerifyBonus = async () => {
    if (!creds.username || !creds.password) { toast.error('Conecte-se primeiro com suas credenciais'); return; }
    if (effectiveItemsCount === 0) return;
    const days = parseInt(verifyDays) || 7;
    const cutoffDate = new Date(); cutoffDate.setDate(cutoffDate.getDate() - days);
    setVerifyLoading(true); setVerifyDone(false); setVerifyResults({});
    verifyCancelRef.current = false;
    const allItems = isAllUsers ? (allUsersItems || []) : await fetchAllSegmentItems();
    setVerifyProgress({ current: 0, total: allItems.length });
    const concurrency = Math.max(1, Math.min(50, parseInt(verifyConcurrency) || 15));
    const results: Record<string, VerifyResult> = {};
    let processed = 0;
    const uuidCache: Record<string, string> = {};
    const parseBRL = (v: unknown): number => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') { const clean = v.replace(/[R$\s.]/g, '').replace(',', '.'); return parseFloat(clean) || 0; }
      return 0;
    };
    const verifySingleCPF = async (item: SegmentItemRow | AllUserItem) => {
      if (verifyCancelRef.current) return;
      try {
        let uuid = item.uuid || uuidCache[item.cpf] || null;
        if (!uuid) {
          const searchRes = await callProxy('search_player', creds, { cpf: item.cpf });
          const foundPlayer = searchRes?.data?.aaData?.[0];
          uuid = foundPlayer?.uuid || null;
          if (uuid) {
            uuidCache[item.cpf] = uuid;
            if (item.id) supabase.from('segment_items').update({ uuid } as Record<string, unknown>).eq('id', item.id).then(() => {});
          }
        }
        if (!uuid) { results[item.cpf] = { hasBonus: false, bonusCount: 0, bonusBalance: 0 }; }
        else {
          const txRes = await callProxy('player_transactions', creds, { uuid, player_id: uuid, cpf: item.cpf });
          if (verifyMode === 'balance') {
            const carteiras = txRes?.data?.carteiras as WalletEntry[] | Record<string, unknown> | undefined;
            let bonusBalance = 0;
            if (Array.isArray(carteiras)) {
              for (const c of carteiras as WalletEntry[]) {
                const name = (c.nome || c.name || c.tipo || c.carteira || c.descricao || '').toString().toLowerCase();
                if (name.includes('bonus') || name.includes('bônus')) bonusBalance += parseBRL(c.saldo ?? c.valor ?? c.value ?? c.balance ?? 0);
              }
            } else if (carteiras && typeof carteiras === 'object') {
              for (const [key, val] of Object.entries(carteiras as Record<string, unknown>)) {
                if (key.toLowerCase().includes('bonus') || key.toLowerCase().includes('bônus')) bonusBalance += parseBRL(val);
              }
            }
            results[item.cpf] = { hasBonus: bonusBalance > 0, bonusCount: 0, bonusBalance };
          } else {
            const movimentacoes = txRes?.data?.movimentacoes || txRes?.data?.historico || [];
            const txList: TransactionEntry[] = Array.isArray(movimentacoes) ? movimentacoes : [];
            let bonusCount = 0; let lastBonusDate: string | undefined;
            for (const tx of txList) {
              const tipo = (tx.tipo || tx.type || tx.descricao || '').toString().toLowerCase();
              const isBonus = tipo.includes('bonus') || tipo.includes('bônus') || tipo.includes('credito') || tipo.includes('crédito');
              if (!isBonus) continue;
              const dateStr = tx.created_at || tx.data || tx.date || '';
              if (!dateStr) { bonusCount++; continue; }
              const txDate = new Date(dateStr);
              if (txDate >= cutoffDate) {
                bonusCount++;
                if (!lastBonusDate || txDate > new Date(lastBonusDate)) lastBonusDate = dateStr;
              }
            }
            results[item.cpf] = { hasBonus: bonusCount > 0, lastBonusDate, bonusCount };
          }
        }
      } catch { results[item.cpf] = { hasBonus: false, bonusCount: 0, bonusBalance: 0 }; }
      processed++;
      setVerifyProgress({ current: processed, total: allItems.length });
      if (processed % concurrency === 0 || processed === allItems.length) setVerifyResults({ ...results });
    };
    for (let i = 0; i < allItems.length; i += concurrency) {
      if (verifyCancelRef.current) { toast.info('Verificacao cancelada'); break; }
      const batch = allItems.slice(i, i + concurrency);
      await Promise.all(batch.map(verifySingleCPF));
    }
    setVerifyResults({ ...results }); setVerifyLoading(false); setVerifyDone(true);
    if (verifyMode === 'balance') {
      const withBalance = Object.values(results).filter(r => (r.bonusBalance || 0) > 0).length;
      const usedAll = Object.values(results).filter(r => (r.bonusBalance || 0) === 0).length;
      toast.info(`${usedAll} ja usaram o bonus · ${withBalance} ainda tem saldo`);
    } else {
      const withBonus = Object.values(results).filter(r => r.hasBonus).length;
      if (withBonus > 0) toast.warning(`${withBonus} jogador(es) ja receberam bonus nos ultimos ${days} dias`);
      else toast.success('Nenhum jogador recebeu bonus no periodo!');
    }
  };

  const handleRemoveWithBonus = async () => {
    const cpfsWithBonus = Object.entries(verifyResults).filter(([, r]) => r.hasBonus).map(([cpf]) => cpf);
    if (cpfsWithBonus.length === 0) { toast.info('Nenhum CPF com bonus para remover'); return; }
    if (isAllUsers) { toast.info('Remocao nao disponivel para "All Users"'); return; }
    for (let i = 0; i < cpfsWithBonus.length; i += 100) {
      const batch = cpfsWithBonus.slice(i, i + 100);
      const { error } = await supabase.from('segment_items').delete().eq('segment_id', selectedSegment!).in('cpf', batch);
      if (error) { toast.error(error.message); return; }
    }
    const newResults = { ...verifyResults };
    cpfsWithBonus.forEach(cpf => delete newResults[cpf]);
    setVerifyResults(newResults);
    qc.invalidateQueries({ queryKey: ['segment_items', selectedSegment] });
    qc.invalidateQueries({ queryKey: ['segment_items_count', selectedSegment] });
    qc.invalidateQueries({ queryKey: ['segments'] });
    toast.success(`${cpfsWithBonus.length} CPF(s) removidos do segmento!`);
  };

  // ── Render ──
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Segmentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Crie segmentos manuais ou dinamicos baseados em regras comportamentais</p>
        </div>
        <SegmentForm
          createOpen={createOpen} setCreateOpen={setCreateOpen}
          newName={newName} setNewName={setNewName}
          newDesc={newDesc} setNewDesc={setNewDesc}
          newType={newType} setNewType={setNewType}
          newRules={newRules} setNewRules={setNewRules}
          newMatchType={newMatchType} setNewMatchType={setNewMatchType}
          newAutoRefresh={newAutoRefresh} setNewAutoRefresh={setNewAutoRefresh}
          newColor={newColor} setNewColor={setNewColor}
          newIcon={newIcon} setNewIcon={setNewIcon}
          previewCount={previewCount} previewSample={previewSample}
          previewLoading={previewLoading} previewRules={previewRules}
          createMut={createMut} resetCreateForm={resetCreateForm}
        />
      </div>

      <div className="hidden"><ApiCredentialsBar onCredentials={setCreds} /></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Segments List */}
        <SegmentFilters
          segments={segments}
          isLoading={isLoading}
          selectedSegment={selectedSegment}
          setSelectedSegment={setSelectedSegment}
          allUsersItems={allUsersItems}
          deleteMut={deleteMut}
        />

        {/* Segment Detail */}
        <div className="lg:col-span-2">
          {selectedSegment && selectedSeg ? (
            <SegmentPlayerList
              selectedSeg={selectedSeg}
              isAllUsers={isAllUsers}
              effectiveItemsLoading={effectiveItemsLoading}
              effectiveItemsCount={effectiveItemsCount}
              pagedItems={pagedItems}
              allUsersFetchProgress={allUsersFetchProgress}
              creds={creds}
              tablePage={tablePage} setTablePage={setTablePage}
              tablePageSize={tablePageSize} setTablePageSize={setTablePageSize}
              tableTotalPages={tableTotalPages} tableStart={tableStart}
              addCpfOpen={addCpfOpen} setAddCpfOpen={setAddCpfOpen}
              cpfInput={cpfInput} setCpfInput={setCpfInput}
              addCpfsMut={addCpfsMut} removeCpfMut={removeCpfMut}
              creditOpen={creditOpen} setCreditOpen={setCreditOpen}
              creditAmount={creditAmount} setCreditAmount={setCreditAmount}
              creditLoading={creditLoading} creditProgress={creditProgress}
              handleMassCredit={handleMassCredit} creditCancelRef={creditCancelRef}
              verifyOpen={verifyOpen} setVerifyOpen={setVerifyOpen}
              verifyDays={verifyDays} setVerifyDays={setVerifyDays}
              verifyConcurrency={verifyConcurrency} setVerifyConcurrency={setVerifyConcurrency}
              verifyLoading={verifyLoading} verifyProgress={verifyProgress}
              verifyResults={verifyResults} verifyDone={verifyDone} setVerifyDone={setVerifyDone}
              verifyMode={verifyMode} setVerifyMode={setVerifyMode}
              handleVerifyBonus={handleVerifyBonus} verifyCancelRef={verifyCancelRef}
              handleRemoveWithBonus={handleRemoveWithBonus} exportVerifyCSV={exportVerifyCSV}
              evaluating={evaluating} handleReEvaluate={handleReEvaluate}
              editRulesOpen={editRulesOpen} setEditRulesOpen={setEditRulesOpen}
              editRules={editRules} setEditRules={setEditRules}
              editMatchType={editMatchType} setEditMatchType={setEditMatchType}
              editAutoRefresh={editAutoRefresh} setEditAutoRefresh={setEditAutoRefresh}
              handleSaveRules={handleSaveRules}
            />
          ) : (
            <div className="glass-card p-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Selecione um segmento para ver os detalhes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
