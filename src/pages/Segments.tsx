/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Plus, Trash2, Users, ChevronRight, ChevronLeft, Loader2, Upload, X, Hash, Calendar,
  CreditCard, DollarSign, SearchCheck, ShieldCheck, ShieldX, Ban, Download, Zap, Settings2,
  RefreshCw, Eye, Filter, Layers, Target, TrendingUp, Star, ShoppingBag, Gamepad2, RotateCw
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { ApiCredentialsBar } from '@/components/ApiCredentialsBar';
import { useProxy } from '@/hooks/use-proxy';
import { useNavigate } from 'react-router-dom';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription,
} from '@/components/ui/dialog';
import { maskCPF, formatCPF, formatDateTime, parseCPFList } from '@/lib/formatters';
import { logAudit } from '@/hooks/use-audit';

const ALL_USERS_ID = '__all_users__';

// ── Rule definitions ──
interface SegmentRule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

const RULE_FIELDS = [
  { value: 'level', label: 'Nível', icon: TrendingUp, category: 'Carteira', type: 'number' },
  { value: 'coins', label: 'Coins (saldo)', icon: DollarSign, category: 'Carteira', type: 'number' },
  { value: 'xp', label: 'XP (saldo)', icon: Star, category: 'Carteira', type: 'number' },
  { value: 'total_coins_earned', label: 'Total Coins Ganhos', icon: DollarSign, category: 'Carteira', type: 'number' },
  { value: 'total_xp_earned', label: 'Total XP Ganho', icon: Star, category: 'Carteira', type: 'number' },
  { value: 'total_deposits', label: 'Total Depositado (R$)', icon: CreditCard, category: 'Financeiro', type: 'number' },
  { value: 'total_bets', label: 'Total Apostado (R$)', icon: Gamepad2, category: 'Financeiro', type: 'number' },
  { value: 'missions_completed', label: 'Missões Completas', icon: Target, category: 'Gamificação', type: 'number' },
  { value: 'achievements_completed', label: 'Conquistas Desbloqueadas', icon: Star, category: 'Gamificação', type: 'number' },
  { value: 'tournaments_joined', label: 'Torneios Participados', icon: Layers, category: 'Gamificação', type: 'number' },
  { value: 'store_purchases_count', label: 'Compras na Loja', icon: ShoppingBag, category: 'Gamificação', type: 'number' },
  { value: 'total_spins', label: 'Total de Giros', icon: RotateCw, category: 'Gamificação', type: 'number' },
  { value: 'last_activity', label: 'Última Atividade', icon: Calendar, category: 'Comportamento', type: 'days' },
  { value: 'registration_date', label: 'Data de Cadastro', icon: Calendar, category: 'Comportamento', type: 'days' },
];

const OPERATORS_NUMBER = [
  { value: 'gt', label: 'maior que' },
  { value: 'gte', label: 'maior ou igual a' },
  { value: 'eq', label: 'igual a' },
  { value: 'neq', label: 'diferente de' },
  { value: 'lt', label: 'menor que' },
  { value: 'lte', label: 'menor ou igual a' },
];

const OPERATORS_DAYS = [
  { value: 'within', label: 'nos últimos' },
  { value: 'not_within', label: 'não ativo há mais de' },
];

const SEGMENT_COLORS = [
  '#6d28d9', '#2563eb', '#059669', '#d97706', '#dc2626',
  '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316',
];

const SEGMENT_ICONS = [
  'users', 'star', 'zap', 'target', 'crown', 'diamond', 'fire', 'shield', 'trophy', 'gift',
];

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export default function Segments() {
  const qc = useQueryClient();
  const navigate = useNavigate();
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
  const [verifyResults, setVerifyResults] = useState<Record<string, { hasBonus: boolean; lastBonusDate?: string; bonusCount: number; bonusBalance?: number }>>({});
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
      return (data || []).map((s: any) => ({
        ...s,
        item_count: s.segment_items?.[0]?.count || 0,
      }));
    },
  });

  const [allUsersFetchProgress, setAllUsersFetchProgress] = useState({ loaded: 0, total: 0 });
  const { data: allUsersItems, isLoading: allUsersQueryLoading, refetch: refetchAllUsers } = useQuery({
    queryKey: ['all_users_segment', creds.username],
    enabled: selectedSegment === ALL_USERS_ID && !!creds.username,
    queryFn: async () => {
      setAllUsersLoading(true);
      setAllUsersFetchProgress({ loaded: 0, total: 0 });
      try {
        const PAGE_SIZE = 1000;
        let totalRecords = 0;
        const allUsers: any[] = [];
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
        return allUsers.map((u: any, i: number) => ({
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
    const allItems: any[] = [];
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
        allItems.push(...data);
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
      const insertData: any = { name: newName, description: newDesc };
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
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('segments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      const seg = segments?.find((s: any) => s.id === id);
      qc.invalidateQueries({ queryKey: ['segments'] });
      if (selectedSegment) setSelectedSegment(null);
      toast.success('Segmento excluído!');
      logAudit({ action: 'EXCLUIR', resource_type: 'segmento', resource_id: id, resource_name: seg?.name });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addCpfsMut = useMutation({
    mutationFn: async () => {
      const cpfs = parseCPFList(cpfInput);
      if (cpfs.length === 0) throw new Error('Nenhum CPF válido encontrado');
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
      const seg = segments?.find((s: any) => s.id === selectedSegment);
      logAudit({ action: 'EDITAR', resource_type: 'segmento', resource_id: selectedSegment || undefined, resource_name: seg?.name, details: { cpfs_added: count } });
    },
    onError: (e: any) => toast.error(e.message),
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
    onError: (e: any) => toast.error(e.message),
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
    } catch (err: any) {
      toast.error(err.message);
    } finally { setPreviewLoading(false); }
  };

  const handleReEvaluate = async () => {
    if (!selectedSeg || selectedSeg.segment_type !== 'automatic') return;
    setEvaluating(true);
    try {
      const result = await evaluateSegmentRules(selectedSeg.id, selectedSeg.rules || [], selectedSeg.match_type || 'all');
      toast.success(`Segmento reavaliado: ${result.count} jogadores encontrados`);
      qc.invalidateQueries({ queryKey: ['segments'] });
      qc.invalidateQueries({ queryKey: ['segment_items', selectedSegment] });
      qc.invalidateQueries({ queryKey: ['segment_items_count', selectedSegment] });
    } catch (err: any) {
      toast.error(err.message);
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
    } catch (err: any) {
      setEvaluating(false);
      toast.error(err.message);
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
      const batchName = `${selectedSeg?.name || 'Segmento'} - Crédito ${new Date().toLocaleDateString('pt-BR')}`;
      const { data: batch, error: batchErr } = await supabase.from('batches').insert({
        name: batchName, bonus_valor: parseFloat(creditAmount) || 0, total_items: allItems.length, status: 'EM_ANDAMENTO',
      }).select().single();
      if (batchErr || !batch) throw new Error(batchErr?.message || 'Erro ao criar lote');
      if (creditCancelRef.current) { toast.info('Creditação cancelada'); setCreditLoading(false); return; }
      const batchItems = allItems.map((item: any) => ({
        batch_id: batch.id, cpf: item.cpf, cpf_masked: item.cpf_masked, status: 'PENDENTE',
      }));
      const { error: itemsErr } = await supabase.from('batch_items').insert(batchItems);
      if (itemsErr) throw new Error(itemsErr.message);
      if (creditCancelRef.current) { toast.info('Creditação cancelada'); setCreditLoading(false); return; }
      const res = await callProxy('credit_batch', creds, { batch_id: batch.id, bonus_amount: parseFloat(creditAmount) });
      const result = res?.data;
      setCreditProgress({ current: allItems.length, total: allItems.length, credited: result?.credited || 0, errors: result?.errors || 0 });
      if (result?.credited > 0) toast.success(`${result.credited} bônus creditados com sucesso!`);
      if (result?.errors > 0) toast.warning(`${result.errors} erros durante o processamento`);
      const seg = segments?.find((s: any) => s.id === selectedSegment);
      logAudit({ action: 'CREDITAR', resource_type: 'batch', resource_name: seg?.name, details: { segment_id: selectedSegment, amount: creditAmount, total: allItems.length, credited: result?.credited || 0, errors: result?.errors || 0 } });
      qc.invalidateQueries({ queryKey: ['batches'] });
    } catch (err: any) {
      if (!creditCancelRef.current) toast.error(err.message || 'Erro na creditação em massa');
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
      const header = 'CPF,Saldo Bônus\n';
      const rows = filtered.map(([cpf, r]) => `${fmtCpf(cpf)},${(r.bonusBalance || 0).toFixed(2)}`).join('\n');
      downloadCSV(header + rows, filename);
    } else {
      if (filter === 'with') { filtered = entries.filter(([, r]) => r.hasBonus); filename = 'com_bonus'; }
      else if (filter === 'without') { filtered = entries.filter(([, r]) => !r.hasBonus); filename = 'sem_bonus'; }
      else { filename = 'bonus_todos'; }
      const header = 'CPF,Tem Bônus,Qtd Bônus,Último Bônus\n';
      const rows = filtered.map(([cpf, r]) => `${fmtCpf(cpf)},${r.hasBonus ? 'Sim' : 'Não'},${r.bonusCount},${r.lastBonusDate || ''}`).join('\n');
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
    const results: Record<string, { hasBonus: boolean; lastBonusDate?: string; bonusCount: number; bonusBalance?: number }> = {};
    let processed = 0;
    const uuidCache: Record<string, string> = {};
    const parseBRL = (v: any): number => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') { const clean = v.replace(/[R$\s.]/g, '').replace(',', '.'); return parseFloat(clean) || 0; }
      return 0;
    };
    const verifySingleCPF = async (item: any) => {
      if (verifyCancelRef.current) return;
      try {
        let uuid = item.uuid || uuidCache[item.cpf] || null;
        if (!uuid) {
          const searchRes = await callProxy('search_player', creds, { cpf: item.cpf });
          const foundPlayer = searchRes?.data?.aaData?.[0];
          uuid = foundPlayer?.uuid || null;
          if (uuid) {
            uuidCache[item.cpf] = uuid;
            if (item.id) supabase.from('segment_items').update({ uuid } as any).eq('id', item.id).then(() => {});
          }
        }
        if (!uuid) { results[item.cpf] = { hasBonus: false, bonusCount: 0, bonusBalance: 0 }; }
        else {
          const txRes = await callProxy('player_transactions', creds, { uuid, player_id: uuid, cpf: item.cpf });
          if (verifyMode === 'balance') {
            const carteiras = txRes?.data?.carteiras;
            let bonusBalance = 0;
            if (Array.isArray(carteiras)) {
              for (const c of carteiras) {
                const name = (c.nome || c.name || c.tipo || c.carteira || c.descricao || '').toString().toLowerCase();
                if (name.includes('bonus') || name.includes('bônus')) bonusBalance += parseBRL(c.saldo ?? c.valor ?? c.value ?? c.balance ?? 0);
              }
            } else if (carteiras && typeof carteiras === 'object') {
              for (const [key, val] of Object.entries(carteiras)) {
                if (key.toLowerCase().includes('bonus') || key.toLowerCase().includes('bônus')) bonusBalance += parseBRL(val);
              }
            }
            results[item.cpf] = { hasBonus: bonusBalance > 0, bonusCount: 0, bonusBalance };
          } else {
            const movimentacoes = txRes?.data?.movimentacoes || txRes?.data?.historico || [];
            const txList = Array.isArray(movimentacoes) ? movimentacoes : [];
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
      if (verifyCancelRef.current) { toast.info('Verificação cancelada'); break; }
      const batch = allItems.slice(i, i + concurrency);
      await Promise.all(batch.map(verifySingleCPF));
    }
    setVerifyResults({ ...results }); setVerifyLoading(false); setVerifyDone(true);
    if (verifyMode === 'balance') {
      const withBalance = Object.values(results).filter(r => (r.bonusBalance || 0) > 0).length;
      const usedAll = Object.values(results).filter(r => (r.bonusBalance || 0) === 0).length;
      toast.info(`${usedAll} já usaram o bônus · ${withBalance} ainda têm saldo`);
    } else {
      const withBonus = Object.values(results).filter(r => r.hasBonus).length;
      if (withBonus > 0) toast.warning(`${withBonus} jogador(es) já receberam bônus nos últimos ${days} dias`);
      else toast.success('Nenhum jogador recebeu bônus no período!');
    }
  };

  const handleRemoveWithBonus = async () => {
    const cpfsWithBonus = Object.entries(verifyResults).filter(([, r]) => r.hasBonus).map(([cpf]) => cpf);
    if (cpfsWithBonus.length === 0) { toast.info('Nenhum CPF com bônus para remover'); return; }
    if (isAllUsers) { toast.info('Remoção não disponível para "All Users"'); return; }
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

  const selectedSeg = selectedSegment === ALL_USERS_ID
    ? { id: ALL_USERS_ID, name: 'All Users', description: 'Todos os jogadores cadastrados na plataforma', item_count: allUsersItems?.length || 0, segment_type: 'manual' as const, rules: [], match_type: 'all' }
    : segments?.find((s: any) => s.id === selectedSegment);

  // ── Rule Builder Component ──
  const RuleBuilder = ({ rules, setRules, matchType, setMatchType }: {
    rules: SegmentRule[]; setRules: (r: SegmentRule[]) => void;
    matchType: 'all' | 'any'; setMatchType: (m: 'all' | 'any') => void;
  }) => {
    const addRule = () => setRules([...rules, { id: generateId(), field: 'level', operator: 'gte', value: '' }]);
    const removeRule = (id: string) => setRules(rules.filter(r => r.id !== id));
    const updateRule = (id: string, updates: Partial<SegmentRule>) => {
      setRules(rules.map(r => r.id === id ? { ...r, ...updates } : r));
    };

    const categories = [...new Set(RULE_FIELDS.map(f => f.category))];

    return (
      <div className="space-y-3">
        {/* Match type toggle */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Jogadores que correspondem a</span>
          <button
            onClick={() => setMatchType(matchType === 'all' ? 'any' : 'all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              matchType === 'all'
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}
          >
            {matchType === 'all' ? 'TODAS' : 'QUALQUER'}
          </button>
          <span className="text-muted-foreground">as regras</span>
        </div>

        {/* Rules */}
        <div className="space-y-2">
          {rules.map((rule, idx) => {
            const fieldDef = RULE_FIELDS.find(f => f.value === rule.field);
            const operators = fieldDef?.type === 'days' ? OPERATORS_DAYS : OPERATORS_NUMBER;
            const FieldIcon = fieldDef?.icon || Filter;

            return (
              <div key={rule.id} className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-border group">
                {idx > 0 && (
                  <span className={`text-[10px] font-bold uppercase mr-1 ${matchType === 'all' ? 'text-primary' : 'text-amber-400'}`}>
                    {matchType === 'all' ? 'E' : 'OU'}
                  </span>
                )}
                <FieldIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />

                <Select value={rule.field} onValueChange={v => {
                  const newField = RULE_FIELDS.find(f => f.value === v);
                  const defaultOp = newField?.type === 'days' ? 'within' : 'gte';
                  updateRule(rule.id, { field: v, operator: defaultOp, value: '' });
                }}>
                  <SelectTrigger className="h-8 w-44 text-xs bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <div key={cat}>
                        <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{cat}</div>
                        {RULE_FIELDS.filter(f => f.category === cat).map(f => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={rule.operator} onValueChange={v => updateRule(rule.id, { operator: v })}>
                  <SelectTrigger className="h-8 w-40 text-xs bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map(op => (
                      <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  type="number"
                  value={rule.value}
                  onChange={e => updateRule(rule.id, { value: e.target.value })}
                  placeholder={fieldDef?.type === 'days' ? 'dias' : '0'}
                  className="h-8 w-24 text-xs bg-background border-border font-mono"
                />

                {fieldDef?.type === 'days' && <span className="text-xs text-muted-foreground">dias</span>}

                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive"
                  onClick={() => removeRule(rule.id)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>

        <Button variant="outline" size="sm" onClick={addRule} className="border-dashed border-border text-xs">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar Regra
        </Button>
      </div>
    );
  };

  // ── Render ──
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Segmentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Crie segmentos manuais ou dinâmicos baseados em regras comportamentais</p>
        </div>
        <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) resetCreateForm(); }}>
          <DialogTrigger asChild>
            <Button className="gradient-primary border-0">
              <Plus className="w-4 h-4 mr-2" /> Novo Segmento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Segmento</DialogTitle>
              <DialogDescription>Crie um segmento manual (lista de CPFs) ou automático (baseado em regras)</DialogDescription>
            </DialogHeader>

            <Tabs value={newType} onValueChange={v => setNewType(v as 'manual' | 'automatic')} className="mt-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="manual" className="text-xs">
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> Manual (CPFs)
                </TabsTrigger>
                <TabsTrigger value="automatic" className="text-xs">
                  <Zap className="w-3.5 h-3.5 mr-1.5" /> Automático (Regras)
                </TabsTrigger>
              </TabsList>

              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nome</Label>
                    <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: VIPs Nível 5+" className="bg-secondary border-border" />
                  </div>
                  <div>
                    <Label>Descrição (opcional)</Label>
                    <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Jogadores de alto nível" className="bg-secondary border-border" />
                  </div>
                </div>

                {/* Color & Icon */}
                <div className="flex items-center gap-4">
                  <div>
                    <Label className="text-xs">Cor</Label>
                    <div className="flex gap-1.5 mt-1">
                      {SEGMENT_COLORS.map(c => (
                        <button key={c} onClick={() => setNewColor(c)}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${newColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Ícone</Label>
                    <div className="flex gap-1.5 mt-1">
                      {SEGMENT_ICONS.map(ic => (
                        <button key={ic} onClick={() => setNewIcon(ic)}
                          className={`w-6 h-6 rounded flex items-center justify-center text-xs transition-all ${newIcon === ic ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
                          {ic === 'users' ? '👥' : ic === 'star' ? '⭐' : ic === 'zap' ? '⚡' : ic === 'target' ? '🎯' : ic === 'crown' ? '👑' : ic === 'diamond' ? '💎' : ic === 'fire' ? '🔥' : ic === 'shield' ? '🛡' : ic === 'trophy' ? '🏆' : '🎁'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <TabsContent value="manual" className="mt-0 space-y-2">
                  <p className="text-xs text-muted-foreground">Após criar, adicione CPFs manualmente ao segmento.</p>
                </TabsContent>

                <TabsContent value="automatic" className="mt-0 space-y-4">
                  <RuleBuilder rules={newRules} setRules={setNewRules} matchType={newMatchType} setMatchType={setNewMatchType} />

                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-medium">Auto-refresh</p>
                        <p className="text-[10px] text-muted-foreground">Reavalia automaticamente a cada 24h</p>
                      </div>
                    </div>
                    <Switch checked={newAutoRefresh} onCheckedChange={setNewAutoRefresh} />
                  </div>

                  {/* Preview */}
                  {newRules.length > 0 && (
                    <div className="space-y-2">
                      <Button variant="outline" size="sm" onClick={() => previewRules(newRules, newMatchType)}
                        disabled={previewLoading || newRules.some(r => !r.value)} className="text-xs">
                        {previewLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
                        Pré-visualizar
                      </Button>
                      {previewCount !== null && (
                        <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-primary" />
                            <span className="text-sm font-semibold text-foreground">{previewCount.toLocaleString('pt-BR')}</span>
                            <span className="text-xs text-muted-foreground">jogadores correspondem</span>
                          </div>
                          {previewSample.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {previewSample.slice(0, 5).map(cpf => (
                                <span key={cpf} className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded">{formatCPF(cpf)}</span>
                              ))}
                              {previewCount > 5 && <span className="text-[10px] text-muted-foreground">+{previewCount - 5} mais</span>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
              <Button onClick={() => createMut.mutate()} disabled={!newName || createMut.isPending || (newType === 'automatic' && newRules.length === 0)} className="gradient-primary border-0">
                {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Criar Segmento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="hidden"><ApiCredentialsBar onCredentials={setCreds} /></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Segments List */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* All Users */}
              <button
                onClick={() => setSelectedSegment(ALL_USERS_ID)}
                className={`w-full glass-card p-4 text-left transition-all hover:border-primary/30 group ${selectedSegment === ALL_USERS_ID ? 'border-primary/50 bg-primary/5' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" /> All Users
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">Todos os jogadores da plataforma</p>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge variant="secondary" className="text-xs"><Hash className="w-3 h-3 mr-1" />{allUsersItems?.length || '—'} jogadores</Badge>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${selectedSegment === ALL_USERS_ID ? 'rotate-90' : ''}`} />
                </div>
              </button>

              {segments?.length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum segmento criado</p>
                </div>
              ) : (
                segments?.map((seg: any) => (
                  <button
                    key={seg.id}
                    onClick={() => setSelectedSegment(seg.id)}
                    className={`w-full glass-card p-4 text-left transition-all hover:border-primary/30 group ${selectedSegment === seg.id ? 'border-primary/50 bg-primary/5' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color || '#6d28d9' }} />
                          {seg.name}
                          {seg.segment_type === 'automatic' && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400">
                              <Zap className="w-2.5 h-2.5 mr-0.5" /> Auto
                            </Badge>
                          )}
                        </p>
                        {seg.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{seg.description}</p>}
                        <div className="flex items-center gap-3 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            <Hash className="w-3 h-3 mr-1" />
                            {seg.member_count || seg.item_count} {seg.segment_type === 'automatic' ? 'jogadores' : 'CPFs'}
                          </Badge>
                          {seg.segment_type === 'automatic' && seg.rules?.length > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border">
                              <Filter className="w-2.5 h-2.5 mr-0.5" /> {seg.rules.length} regra{seg.rules.length > 1 ? 's' : ''}
                            </Badge>
                          )}
                          {seg.auto_refresh && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/30 text-green-400">
                              <RefreshCw className="w-2.5 h-2.5 mr-0.5" /> Auto
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />{formatDateTime(seg.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); deleteMut.mutate(seg.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${selectedSegment === seg.id ? 'rotate-90' : ''}`} />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </>
          )}
        </div>

        {/* Segment Detail */}
        <div className="lg:col-span-2">
          {selectedSegment && selectedSeg ? (
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: (selectedSeg as any).color || '#6d28d9' }} />
                  <div>
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                      {selectedSeg.name}
                      {(selectedSeg as any).segment_type === 'automatic' && (
                        <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">
                          <Zap className="w-3 h-3 mr-1" /> Automático
                        </Badge>
                      )}
                    </h2>
                    {selectedSeg.description && <p className="text-sm text-muted-foreground">{selectedSeg.description}</p>}
                    {(selectedSeg as any).last_evaluated_at && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Última avaliação: {formatDateTime((selectedSeg as any).last_evaluated_at)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Automatic segment controls */}
                  {(selectedSeg as any).segment_type === 'automatic' && !isAllUsers && (
                    <>
                      <Button variant="outline" size="sm" className="border-border text-xs"
                        onClick={() => {
                          setEditRules((selectedSeg as any).rules || []);
                          setEditMatchType((selectedSeg as any).match_type || 'all');
                          setEditAutoRefresh((selectedSeg as any).auto_refresh || false);
                          setEditRulesOpen(true);
                        }}>
                        <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Editar Regras
                      </Button>
                      <Button variant="outline" size="sm" className="border-border text-xs"
                        onClick={handleReEvaluate} disabled={evaluating}>
                        {evaluating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                        Reavaliar
                      </Button>
                    </>
                  )}

                  {/* Manual segment: add CPFs */}
                  {(!isAllUsers && (selectedSeg as any).segment_type !== 'automatic') && (
                    <Dialog open={addCpfOpen} onOpenChange={setAddCpfOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="border-border">
                          <Upload className="w-4 h-4 mr-2" /> Adicionar CPFs
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Adicionar CPFs ao Segmento</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                          <Label>Cole os CPFs (um por linha, separados por vírgula ou espaço)</Label>
                          <Textarea value={cpfInput} onChange={e => setCpfInput(e.target.value)}
                            placeholder={"12345678901\n98765432109\n11122233344"} rows={8}
                            className="bg-secondary border-border font-mono text-sm" />
                          <p className="text-xs text-muted-foreground">{parseCPFList(cpfInput).length} CPF(s) válido(s) detectado(s)</p>
                        </div>
                        <DialogFooter>
                          <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                          <Button onClick={() => addCpfsMut.mutate()} disabled={parseCPFList(cpfInput).length === 0 || addCpfsMut.isPending} className="gradient-primary border-0">
                            {addCpfsMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Adicionar {parseCPFList(cpfInput).length} CPFs
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}

                  {/* Mass Credit */}
                  <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
                    <DialogTrigger asChild>
                      <Button className="gradient-success border-0 text-success-foreground" size="sm" disabled={effectiveItemsCount === 0}>
                        <CreditCard className="w-4 h-4 mr-2" /> Creditar Segmento
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Creditação em Massa</DialogTitle>
                        <DialogDescription>Creditar bônus para todos os {effectiveItemsCount} CPFs do segmento "{selectedSeg?.name}"</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        {!creds.username && (
                          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">
                            Conecte-se primeiro na barra de credenciais acima
                          </div>
                        )}
                        <div>
                          <Label>Valor do Bônus (R$)</Label>
                          <Input type="number" value={creditAmount} onChange={e => setCreditAmount(e.target.value)}
                            className="bg-secondary border-border font-mono mt-1" placeholder="10" />
                        </div>
                        <div className="p-3 rounded-lg bg-secondary/50 text-sm space-y-1">
                          <div className="flex justify-between"><span className="text-muted-foreground">CPFs no segmento</span><span className="font-semibold text-foreground">{effectiveItemsCount}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Valor por jogador</span><span className="font-mono text-foreground">R$ {parseFloat(creditAmount) || 0}</span></div>
                          <div className="flex justify-between border-t border-border pt-1 mt-1">
                            <span className="text-muted-foreground font-semibold">Total estimado</span>
                            <span className="font-mono font-bold text-foreground">R$ {(effectiveItemsCount * (parseFloat(creditAmount) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                        {creditLoading && (
                          <div className="space-y-2">
                            <Progress value={creditProgress.total > 0 ? (creditProgress.current / creditProgress.total) * 100 : 0} className="h-2" />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Processando {creditProgress.current}/{creditProgress.total}</span>
                              <span><span className="text-success">{creditProgress.credited} ok</span>{creditProgress.errors > 0 && <span className="text-destructive ml-2">{creditProgress.errors} erro</span>}</span>
                            </div>
                          </div>
                        )}
                        {!creditLoading && creditProgress.current > 0 && (
                          <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm">
                            <p className="font-semibold text-success">Processamento concluído!</p>
                            <p className="text-muted-foreground mt-1">{creditProgress.credited} creditados, {creditProgress.errors} erros</p>
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose>
                        {creditLoading ? (
                          <Button onClick={() => { creditCancelRef.current = true; }} variant="destructive"><Ban className="w-4 h-4 mr-2" />Cancelar</Button>
                        ) : (
                          <Button onClick={handleMassCredit} disabled={!creds.username || effectiveItemsCount === 0} className="gradient-success border-0 text-success-foreground">
                            <DollarSign className="w-4 h-4 mr-2" /> Iniciar Creditação
                          </Button>
                        )}
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Verify Bonus */}
                  <Dialog open={verifyOpen} onOpenChange={(o) => { setVerifyOpen(o); if (!o) setVerifyDone(false); }}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="border-border" disabled={effectiveItemsCount === 0}>
                        <SearchCheck className="w-4 h-4 mr-2" /> Verificar Bônus
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Verificar Bônus no Segmento</DialogTitle>
                        <DialogDescription>Verifique bônus recebidos ou saldo de bônus atual dos jogadores.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        {!creds.username && (
                          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">Conecte-se primeiro na barra de credenciais acima</div>
                        )}
                        <div>
                          <Label>Tipo de verificação</Label>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <button onClick={() => setVerifyMode('received')}
                              className={`p-3 rounded-lg border text-left text-xs transition-colors ${verifyMode === 'received' ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/50'}`}>
                              <p className="font-semibold">Bônus Recebidos</p>
                              <p className="text-[10px] mt-0.5 opacity-70">Quem recebeu bônus nos últimos X dias</p>
                            </button>
                            <button onClick={() => setVerifyMode('balance')}
                              className={`p-3 rounded-lg border text-left text-xs transition-colors ${verifyMode === 'balance' ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/50'}`}>
                              <p className="font-semibold">Saldo Bônus Atual</p>
                              <p className="text-[10px] mt-0.5 opacity-70">Quem já usou vs quem ainda tem saldo</p>
                            </button>
                          </div>
                        </div>
                        {verifyMode === 'received' && (
                          <div>
                            <Label>Período (dias)</Label>
                            <Input type="number" value={verifyDays} onChange={e => setVerifyDays(e.target.value)}
                              className="bg-secondary border-border font-mono mt-1" placeholder="7" min="1" />
                            <p className="text-xs text-muted-foreground mt-1">Jogadores que receberam bônus nos últimos {verifyDays || '0'} dias serão marcados</p>
                          </div>
                        )}
                        {verifyMode === 'balance' && (
                          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground">
                            Consulta o saldo atual da carteira bônus de cada jogador. Quem tem saldo R$ 0,00 já usou todo o bônus.
                          </div>
                        )}
                        <div>
                          <Label>Concorrência</Label>
                          <Input type="number" value={verifyConcurrency} onChange={e => setVerifyConcurrency(e.target.value)}
                            className="bg-secondary border-border font-mono mt-1" placeholder="15" min="1" max="50" />
                        </div>
                        {verifyLoading && (
                          <div className="space-y-2">
                            <Progress value={verifyProgress.total > 0 ? (verifyProgress.current / verifyProgress.total) * 100 : 0} className="h-2" />
                            <p className="text-xs text-muted-foreground text-center">Verificando {verifyProgress.current}/{verifyProgress.total} jogadores...</p>
                          </div>
                        )}
                        {verifyDone && verifyMode === 'received' && (
                          <div className="space-y-3">
                            <div className="p-3 rounded-lg bg-secondary/50 text-sm space-y-1">
                              <div className="flex justify-between"><span className="text-muted-foreground">Total verificados</span><span className="font-semibold text-foreground">{Object.keys(verifyResults).length}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><ShieldX className="w-3 h-3 text-destructive" /> Com bônus</span><span className="font-semibold text-destructive">{Object.values(verifyResults).filter(r => r.hasBonus).length}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-success" /> Sem bônus</span><span className="font-semibold text-success">{Object.values(verifyResults).filter(r => !r.hasBonus).length}</span></div>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportVerifyCSV('all')}><Download className="w-3.5 h-3.5 mr-1" /> Todos</Button>
                              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportVerifyCSV('with')}><Download className="w-3.5 h-3.5 mr-1" /> Com bônus</Button>
                              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportVerifyCSV('without')}><Download className="w-3.5 h-3.5 mr-1" /> Sem bônus</Button>
                            </div>
                            {Object.values(verifyResults).filter(r => r.hasBonus).length > 0 && (
                              <Button onClick={handleRemoveWithBonus} className="w-full" variant="destructive">
                                <Trash2 className="w-4 h-4 mr-2" /> Remover {Object.values(verifyResults).filter(r => r.hasBonus).length} CPFs com bônus
                              </Button>
                            )}
                          </div>
                        )}
                        {verifyDone && verifyMode === 'balance' && (() => {
                          const all = Object.entries(verifyResults);
                          const withBalance = all.filter(([, r]) => (r.bonusBalance || 0) > 0);
                          const usedAll = all.filter(([, r]) => (r.bonusBalance || 0) === 0);
                          const totalBalance = withBalance.reduce((s, [, r]) => s + (r.bonusBalance || 0), 0);
                          return (
                            <div className="space-y-3">
                              <div className="p-3 rounded-lg bg-secondary/50 text-sm space-y-1">
                                <div className="flex justify-between"><span className="text-muted-foreground">Total verificados</span><span className="font-semibold text-foreground">{all.length}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-success" /> Já usaram (saldo R$ 0)</span><span className="font-semibold text-success">{usedAll.length}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><ShieldX className="w-3 h-3 text-amber-400" /> Ainda têm saldo</span><span className="font-semibold text-amber-400">{withBalance.length}</span></div>
                                <div className="flex justify-between border-t border-border pt-1 mt-1">
                                  <span className="text-muted-foreground font-semibold">Saldo total pendente</span>
                                  <span className="font-mono font-bold text-amber-400">R$ {totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportVerifyCSV('all')}><Download className="w-3.5 h-3.5 mr-1" /> Todos</Button>
                                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportVerifyCSV('with')}><Download className="w-3.5 h-3.5 mr-1" /> Com saldo</Button>
                                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportVerifyCSV('without')}><Download className="w-3.5 h-3.5 mr-1" /> Já usaram</Button>
                              </div>
                              {all.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-muted-foreground">Saldo por jogador:</p>
                                  <div className="max-h-60 overflow-y-auto space-y-1">
                                    {all.sort((a, b) => (b[1].bonusBalance || 0) - (a[1].bonusBalance || 0)).map(([cpf, r]) => (
                                      <div key={cpf} className="flex justify-between text-xs bg-secondary/30 rounded px-2 py-1">
                                        <span className="font-mono text-foreground">{cpf}</span>
                                        <span className={`font-mono font-semibold ${(r.bonusBalance || 0) > 0 ? 'text-amber-400' : 'text-success'}`}>
                                          R$ {(r.bonusBalance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {withBalance.length > 0 && (
                                <Button onClick={handleRemoveWithBonus} className="w-full" variant="destructive">
                                  <Trash2 className="w-4 h-4 mr-2" /> Remover {withBalance.length} CPFs com saldo pendente
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose>
                        {!verifyDone && (
                          verifyLoading ? (
                            <Button onClick={() => { verifyCancelRef.current = true; }} variant="destructive"><Ban className="w-4 h-4 mr-2" />Cancelar</Button>
                          ) : (
                            <Button onClick={handleVerifyBonus} disabled={!creds.username || effectiveItemsCount === 0} className="gradient-primary border-0">
                              <SearchCheck className="w-4 h-4 mr-2" /> Iniciar Verificação
                            </Button>
                          )
                        )}
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* Rules display for automatic segments */}
              {(selectedSeg as any).segment_type === 'automatic' && (selectedSeg as any).rules?.length > 0 && !isAllUsers && (
                <div className="p-3 rounded-lg bg-secondary/30 border border-border space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground">Regras ativas</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {(selectedSeg as any).match_type === 'all' ? 'TODAS (AND)' : 'QUALQUER (OR)'}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {((selectedSeg as any).rules || []).map((rule: SegmentRule, idx: number) => {
                      const fieldDef = RULE_FIELDS.find(f => f.value === rule.field);
                      const operators = fieldDef?.type === 'days' ? OPERATORS_DAYS : OPERATORS_NUMBER;
                      const opLabel = operators.find(o => o.value === rule.operator)?.label || rule.operator;
                      return (
                        <div key={rule.id || idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                          {idx > 0 && <span className="text-[10px] font-bold uppercase text-primary">{(selectedSeg as any).match_type === 'all' ? 'E' : 'OU'}</span>}
                          <span className="text-foreground font-medium">{fieldDef?.label || rule.field}</span>
                          <span>{opLabel}</span>
                          <span className="font-mono text-foreground font-semibold">{rule.value}</span>
                          {fieldDef?.type === 'days' && <span>dias</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Edit Rules Dialog */}
              <Dialog open={editRulesOpen} onOpenChange={setEditRulesOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Editar Regras do Segmento</DialogTitle>
                    <DialogDescription>Modifique as regras e reavalie o segmento</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <RuleBuilder rules={editRules} setRules={setEditRules} matchType={editMatchType} setMatchType={setEditMatchType} />
                    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium">Auto-refresh</p>
                          <p className="text-[10px] text-muted-foreground">Reavalia automaticamente a cada 24h</p>
                        </div>
                      </div>
                      <Switch checked={editAutoRefresh} onCheckedChange={setEditAutoRefresh} />
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                    <Button onClick={handleSaveRules} disabled={evaluating || editRules.length === 0} className="gradient-primary border-0">
                      {evaluating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Salvar e Reavaliar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Table */}
              {effectiveItemsLoading ? (
                <div className="flex flex-col items-center justify-center p-8 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  {isAllUsers && allUsersFetchProgress.total > 0 && (
                    <div className="w-64 space-y-1">
                      <Progress value={(allUsersFetchProgress.loaded / allUsersFetchProgress.total) * 100} className="h-2" />
                      <p className="text-xs text-muted-foreground text-center">
                        {allUsersFetchProgress.loaded.toLocaleString('pt-BR')} / {allUsersFetchProgress.total.toLocaleString('pt-BR')} jogadores
                      </p>
                    </div>
                  )}
                </div>
              ) : isAllUsers && !creds.username ? (
                <div className="text-center py-10">
                  <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Conecte-se à API para carregar todos os jogadores</p>
                </div>
              ) : effectiveItemsCount > 0 ? (
                <>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-secondary/50">
                          <TableHead className="text-xs font-semibold uppercase tracking-wider">CPF</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider">CPF Mascarado</TableHead>
                          {isAllUsers && <TableHead className="text-xs font-semibold uppercase tracking-wider">Username</TableHead>}
                          <TableHead className="text-xs font-semibold uppercase tracking-wider">{isAllUsers ? 'Cadastro' : 'Adicionado em'}</TableHead>
                          {!isAllUsers && (selectedSeg as any).segment_type !== 'manual' && (
                            <TableHead className="text-xs font-semibold uppercase tracking-wider">Fonte</TableHead>
                          )}
                          {Object.keys(verifyResults).length > 0 && (
                            <TableHead className="text-xs font-semibold uppercase tracking-wider">Status Bônus</TableHead>
                          )}
                          {!isAllUsers && (selectedSeg as any).segment_type !== 'automatic' && (
                            <TableHead className="text-xs font-semibold uppercase tracking-wider w-12"></TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedItems.map((item: any) => {
                          const vr = verifyResults[item.cpf];
                          return (
                            <TableRow key={item.id} className={`hover:bg-secondary/30 ${vr?.hasBonus ? 'bg-destructive/5' : ''}`}>
                              <TableCell className="font-mono text-sm">{formatCPF(item.cpf)}</TableCell>
                              <TableCell className="font-mono text-sm text-muted-foreground">{item.cpf_masked}</TableCell>
                              {isAllUsers && <TableCell className="text-sm">{item.username || '—'}</TableCell>}
                              <TableCell className="text-xs text-muted-foreground">{item.created_at ? formatDateTime(item.created_at) : '—'}</TableCell>
                              {!isAllUsers && (selectedSeg as any).segment_type !== 'manual' && (
                                <TableCell>
                                  <Badge variant="outline" className={`text-[10px] ${item.source === 'rule' ? 'border-amber-500/30 text-amber-400' : 'border-border text-muted-foreground'}`}>
                                    {item.source === 'rule' ? 'Regra' : item.source === 'import' ? 'Import' : 'Manual'}
                                  </Badge>
                                </TableCell>
                              )}
                              {Object.keys(verifyResults).length > 0 && (
                                <TableCell>
                                  {vr ? (
                                    vr.hasBonus ? (
                                      <div className="flex items-center gap-1.5">
                                        <ShieldX className="w-3.5 h-3.5 text-destructive" />
                                        <span className="text-xs text-destructive font-medium">
                                          {vr.bonusCount}x bônus
                                          {vr.lastBonusDate && <span className="text-muted-foreground font-normal ml-1">({formatDateTime(vr.lastBonusDate)})</span>}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1.5">
                                        <ShieldCheck className="w-3.5 h-3.5 text-success" />
                                        <span className="text-xs text-success font-medium">Sem bônus</span>
                                      </div>
                                    )
                                  ) : <span className="text-xs text-muted-foreground">—</span>}
                                </TableCell>
                              )}
                              {!isAllUsers && (selectedSeg as any).segment_type !== 'automatic' && (
                                <TableCell>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => removeCpfMut.mutate(item.id)}>
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {effectiveItemsCount > 0 && (
                    <div className="flex items-center justify-between gap-4 pt-3 px-1 flex-wrap">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Linhas por página:</span>
                        <Select value={String(tablePageSize)} onValueChange={(v) => { setTablePageSize(Number(v)); setTablePage(0); }}>
                          <SelectTrigger className="h-7 w-16 text-xs bg-secondary border-border"><SelectValue /></SelectTrigger>
                          <SelectContent>{[25, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                        <span className="ml-2">{(tableStart + 1).toLocaleString('pt-BR')}-{Math.min(tableStart + tablePageSize, effectiveItemsCount).toLocaleString('pt-BR')} de {effectiveItemsCount.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={tablePage === 0} onClick={() => setTablePage(p => p - 1)}>
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        {(() => {
                          const maxBtns = 5;
                          if (tableTotalPages <= maxBtns) return Array.from({ length: tableTotalPages }, (_, i) => i);
                          const btns: (number | '...')[] = [0];
                          let s = Math.max(1, tablePage - 1), e = Math.min(tableTotalPages - 2, tablePage + 1);
                          if (tablePage <= 2) { s = 1; e = 3; }
                          if (tablePage >= tableTotalPages - 3) { s = tableTotalPages - 4; e = tableTotalPages - 2; }
                          s = Math.max(1, s); e = Math.min(tableTotalPages - 2, e);
                          if (s > 1) btns.push('...');
                          for (let i = s; i <= e; i++) btns.push(i);
                          if (e < tableTotalPages - 2) btns.push('...');
                          btns.push(tableTotalPages - 1);
                          return btns;
                        })().map((p, i) =>
                          p === '...' ? (
                            <span key={`dots-${i}`} className="text-xs text-muted-foreground px-1">…</span>
                          ) : (
                            <Button key={p} variant={tablePage === p ? 'default' : 'ghost'} size="icon"
                              className={`h-7 w-7 text-xs ${tablePage === p ? 'gradient-primary border-0' : ''}`}
                              onClick={() => setTablePage(p as number)}>
                              {(p as number) + 1}
                            </Button>
                          )
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={tablePage >= tableTotalPages - 1} onClick={() => setTablePage(p => p + 1)}>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-10">
                  <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {isAllUsers ? 'Nenhum jogador encontrado' :
                      (selectedSeg as any).segment_type === 'automatic' ? 'Nenhum jogador corresponde às regras. Clique em "Reavaliar" para atualizar.' :
                        'Nenhum CPF neste segmento'}
                  </p>
                  {!isAllUsers && (selectedSeg as any).segment_type !== 'automatic' && <p className="text-xs text-muted-foreground mt-1">Clique em "Adicionar CPFs" para começar</p>}
                </div>
              )}
            </div>
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
