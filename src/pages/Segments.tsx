import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Users, ChevronRight, ChevronLeft, Loader2, Upload, X, Hash, Calendar, CreditCard, DollarSign, SearchCheck, ShieldCheck, ShieldX, Ban } from 'lucide-react';
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription,
} from '@/components/ui/dialog';

const maskCPF = (cpf: string) => {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length === 11) return `${clean.slice(0, 3)}.***.*${clean.slice(8, 9)}*-${clean.slice(9)}`;
  return cpf;
};

const fmtCPF = (cpf: string) => {
  const s = cpf.replace(/\D/g, '');
  if (s.length === 11) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
  return cpf;
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

// Parse CPF list from text (comma, newline, semicolon, space separated)
const parseCPFs = (text: string): string[] => {
  return text
    .split(/[\n,;\s]+/)
    .map(s => s.replace(/\D/g, ''))
    .filter(s => s.length >= 11)
    .map(s => s.slice(0, 11));
};

const ALL_USERS_ID = '__all_users__';

export default function Segments() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { callProxy } = useProxy();
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [cpfInput, setCpfInput] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [addCpfOpen, setAddCpfOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState('10');
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditProgress, setCreditProgress] = useState({ current: 0, total: 0, credited: 0, errors: 0 });

  // Verification state
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyDays, setVerifyDays] = useState('7');
  const [verifyConcurrency, setVerifyConcurrency] = useState('5');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState({ current: 0, total: 0 });
  const [verifyResults, setVerifyResults] = useState<Record<string, { hasBonus: boolean; lastBonusDate?: string; bonusCount: number }>>({});
  const [verifyDone, setVerifyDone] = useState(false);

  // Abort refs
  const verifyCancelRef = useRef(false);
  const creditCancelRef = useRef(false);

  // Fetch segments with item count
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

  // Fetch all users from API (for "All Users" virtual segment)
  const [allUsersFetchProgress, setAllUsersFetchProgress] = useState({ loaded: 0, total: 0 });

  const { data: allUsersItems, isLoading: allUsersQueryLoading, refetch: refetchAllUsers } = useQuery({
    queryKey: ['all_users_segment', creds.username],
    enabled: selectedSegment === ALL_USERS_ID && !!creds.username,
    queryFn: async () => {
      setAllUsersLoading(true);
      setAllUsersFetchProgress({ loaded: 0, total: 0 });
      try {
        const PAGE_SIZE = 1000;
        let start = 0;
        let totalRecords = 0;
        const allUsers: any[] = [];

        // First request to get total count
        const firstRes = await callProxy('list_users', creds, { start: 0, length: PAGE_SIZE });
        const firstData = firstRes?.data;
        totalRecords = parseInt(firstData?.iTotalRecords || firstData?.iTotalDisplayRecords || firstData?.recordsTotal || firstData?.recordsFiltered || '0', 10);
        const firstBatch = firstData?.aaData || [];
        allUsers.push(...firstBatch);
        setAllUsersFetchProgress({ loaded: allUsers.length, total: totalRecords });

        // Fetch remaining pages in parallel (5 concurrent)
        const CONCURRENCY = 5;
        const remainingPages: number[] = [];
        for (let s = PAGE_SIZE; s < totalRecords; s += PAGE_SIZE) {
          remainingPages.push(s);
        }

        for (let i = 0; i < remainingPages.length; i += CONCURRENCY) {
          const batch = remainingPages.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            batch.map(s => callProxy('list_users', creds, { start: s, length: PAGE_SIZE }))
          );
          for (const res of results) {
            const items = res?.data?.aaData || [];
            allUsers.push(...items);
          }
          setAllUsersFetchProgress({ loaded: allUsers.length, total: totalRecords });
        }

        return allUsers.map((u: any, i: number) => ({
          id: `all-user-${i}`,
          cpf: u.cpf || '',
          cpf_masked: maskCPF(u.cpf || ''),
          created_at: u.created_at || '',
          username: u.username || u.name || '',
          uuid: u.uuid || '',
        }));
      } finally {
        setAllUsersLoading(false);
      }
    },
    staleTime: 10 * 60 * 1000, // cache 10 min
  });

  // Fetch ALL items for selected segment (paginated to bypass 1000-row limit)
  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['segment_items', selectedSegment],
    enabled: !!selectedSegment && selectedSegment !== ALL_USERS_ID,
    queryFn: async () => {
      const allItems: any[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('segment_items')
          .select('*')
          .eq('segment_id', selectedSegment!)
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allItems.push(...data);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      return allItems;
    },
  });

  // Effective items based on selected segment
  const effectiveItems = selectedSegment === ALL_USERS_ID ? allUsersItems : items;
  const effectiveItemsLoading = selectedSegment === ALL_USERS_ID ? (allUsersQueryLoading || allUsersLoading) : itemsLoading;
  const isAllUsers = selectedSegment === ALL_USERS_ID;

  // Pagination for the items table
  const [tablePage, setTablePage] = useState(0);
  const [tablePageSize, setTablePageSize] = useState(25);
  const tableTotalPages = Math.max(1, Math.ceil((effectiveItems?.length || 0) / tablePageSize));
  const tableStart = tablePage * tablePageSize;
  const pagedItems = effectiveItems?.slice(tableStart, tableStart + tablePageSize) || [];

  // Reset page when segment changes
  const prevSegRef = useRef(selectedSegment);
  if (prevSegRef.current !== selectedSegment) {
    prevSegRef.current = selectedSegment;
    setTablePage(0);
  }

  // Create segment
  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('segments').insert({
        name: newName, description: newDesc,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments'] });
      setNewName(''); setNewDesc(''); setCreateOpen(false);
      toast.success('Segmento criado!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Delete segment
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('segments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments'] });
      if (selectedSegment) setSelectedSegment(null);
      toast.success('Segmento excluído!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Add CPFs to segment
  const addCpfsMut = useMutation({
    mutationFn: async () => {
      const cpfs = parseCPFs(cpfInput);
      if (cpfs.length === 0) throw new Error('Nenhum CPF válido encontrado');
      const rows = cpfs.map(cpf => ({
        segment_id: selectedSegment!,
        cpf,
        cpf_masked: maskCPF(cpf),
      }));
      const { error } = await supabase.from('segment_items').upsert(rows, {
        onConflict: 'segment_id,cpf',
        ignoreDuplicates: true,
      });
      if (error) throw error;
      return cpfs.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['segment_items', selectedSegment] });
      qc.invalidateQueries({ queryKey: ['segments'] });
      setCpfInput(''); setAddCpfOpen(false);
      toast.success(`${count} CPF(s) adicionado(s)!`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Remove single CPF
  const removeCpfMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('segment_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segment_items', selectedSegment] });
      qc.invalidateQueries({ queryKey: ['segments'] });
      toast.success('CPF removido');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Mass credit: create batch from segment and process
  const handleMassCredit = async () => {
    if (!creds.username || !creds.password) {
      toast.error('Conecte-se primeiro com suas credenciais');
      return;
    }
    if (!selectedSegment || !effectiveItems || effectiveItems.length === 0) {
      toast.error('Segmento sem CPFs');
      return;
    }

    setCreditLoading(true);
    creditCancelRef.current = false;
    setCreditProgress({ current: 0, total: effectiveItems.length, credited: 0, errors: 0 });

    try {
      // 1. Create a batch from segment
      const batchName = `${selectedSeg?.name || 'Segmento'} - Crédito ${new Date().toLocaleDateString('pt-BR')}`;
      const { data: batch, error: batchErr } = await supabase.from('batches').insert({
        name: batchName,
        bonus_valor: parseFloat(creditAmount) || 0,
        total_items: effectiveItems.length,
        status: 'EM_ANDAMENTO',
      }).select().single();

      if (batchErr || !batch) throw new Error(batchErr?.message || 'Erro ao criar lote');

      if (creditCancelRef.current) {
        toast.info('Creditação cancelada');
        setCreditLoading(false);
        return;
      }

      // 2. Insert batch_items from segment CPFs
      const batchItems = effectiveItems.map((item: any) => ({
        batch_id: batch.id,
        cpf: item.cpf,
        cpf_masked: item.cpf_masked,
        status: 'PENDENTE',
      }));

      const { error: itemsErr } = await supabase.from('batch_items').insert(batchItems);
      if (itemsErr) throw new Error(itemsErr.message);

      if (creditCancelRef.current) {
        toast.info('Creditação cancelada');
        setCreditLoading(false);
        return;
      }

      // 3. Trigger credit_batch via proxy
      const res = await callProxy('credit_batch', creds, {
        batch_id: batch.id,
        bonus_amount: parseFloat(creditAmount),
      });

      const result = res?.data;
      setCreditProgress({
        current: effectiveItems.length,
        total: effectiveItems.length,
        credited: result?.credited || 0,
        errors: result?.errors || 0,
      });

      if (result?.credited > 0) {
        toast.success(`${result.credited} bônus creditados com sucesso!`);
      }
      if (result?.errors > 0) {
        toast.warning(`${result.errors} erros durante o processamento`);
      }

      qc.invalidateQueries({ queryKey: ['batches'] });
    } catch (err: any) {
      if (!creditCancelRef.current) {
        toast.error(err.message || 'Erro na creditação em massa');
      }
    } finally {
      setCreditLoading(false);
    }
  };

  // Verify bonus for all CPFs in segment
  const handleVerifyBonus = async () => {
    if (!creds.username || !creds.password) {
      toast.error('Conecte-se primeiro com suas credenciais');
      return;
    }
    if (!effectiveItems || effectiveItems.length === 0) return;

    const days = parseInt(verifyDays) || 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    setVerifyLoading(true);
    setVerifyDone(false);
    setVerifyResults({});
    setVerifyProgress({ current: 0, total: effectiveItems.length });
    verifyCancelRef.current = false;

    const concurrency = Math.max(1, Math.min(20, parseInt(verifyConcurrency) || 5));
    const results: Record<string, { hasBonus: boolean; lastBonusDate?: string; bonusCount: number }> = {};
    let processed = 0;

    const verifySingleCPF = async (item: any) => {
      if (verifyCancelRef.current) return;
      try {
        const searchRes = await callProxy('search_player', creds, { cpf: item.cpf });
        const foundPlayer = searchRes?.data?.aaData?.[0];
        const uuid = foundPlayer?.uuid;

        if (!uuid) {
          results[item.cpf] = { hasBonus: false, bonusCount: 0 };
        } else {
          const txRes = await callProxy('player_transactions', creds, { uuid, player_id: uuid, cpf: item.cpf });
          const movimentacoes = txRes?.data?.movimentacoes || txRes?.data?.historico || [];
          const txList = Array.isArray(movimentacoes) ? movimentacoes : [];

          let bonusCount = 0;
          let lastBonusDate: string | undefined;

          for (const tx of txList) {
            const tipo = (tx.tipo || tx.type || tx.descricao || '').toString().toLowerCase();
            const isBonus = tipo.includes('bonus') || tipo.includes('bônus') || tipo.includes('credito') || tipo.includes('crédito');
            if (!isBonus) continue;

            const dateStr = tx.created_at || tx.data || tx.date || '';
            if (!dateStr) { bonusCount++; continue; }

            const txDate = new Date(dateStr);
            if (txDate >= cutoffDate) {
              bonusCount++;
              if (!lastBonusDate || txDate > new Date(lastBonusDate)) {
                lastBonusDate = dateStr;
              }
            }
          }

          results[item.cpf] = { hasBonus: bonusCount > 0, lastBonusDate, bonusCount };
        }
      } catch {
        results[item.cpf] = { hasBonus: false, bonusCount: 0 };
      }
      processed++;
      setVerifyProgress({ current: processed, total: effectiveItems.length });
      // Update results periodically (every batch) to avoid too many re-renders
      if (processed % concurrency === 0 || processed === effectiveItems.length) {
        setVerifyResults({ ...results });
      }
    };

    // Process in concurrent batches
    for (let i = 0; i < effectiveItems.length; i += concurrency) {
      if (verifyCancelRef.current) {
        toast.info('Verificação cancelada');
        break;
      }
      const batch = effectiveItems.slice(i, i + concurrency);
      await Promise.all(batch.map(verifySingleCPF));
    }

    setVerifyResults({ ...results });
    setVerifyLoading(false);
    setVerifyDone(true);

    const withBonus = Object.values(results).filter(r => r.hasBonus).length;
    if (withBonus > 0) {
      toast.warning(`${withBonus} jogador(es) já receberam bônus nos últimos ${days} dias`);
    } else {
      toast.success('Nenhum jogador recebeu bônus no período!');
    }
  };

  // Remove all CPFs that have bonus
  const handleRemoveWithBonus = async () => {
    if (!effectiveItems) return;
    const cpfsWithBonus = effectiveItems.filter((item: any) => verifyResults[item.cpf]?.hasBonus);
    if (cpfsWithBonus.length === 0) {
      toast.info('Nenhum CPF com bônus para remover');
      return;
    }

    const ids = cpfsWithBonus.map((item: any) => item.id);
    const { error } = await supabase.from('segment_items').delete().in('id', ids);
    if (error) {
      toast.error(error.message);
      return;
    }

    // Clear results for removed items
    const newResults = { ...verifyResults };
    cpfsWithBonus.forEach((item: any) => delete newResults[item.cpf]);
    setVerifyResults(newResults);

    qc.invalidateQueries({ queryKey: ['segment_items', selectedSegment] });
    qc.invalidateQueries({ queryKey: ['segments'] });
    toast.success(`${cpfsWithBonus.length} CPF(s) removidos do segmento!`);
  };

  const selectedSeg = selectedSegment === ALL_USERS_ID
    ? { id: ALL_USERS_ID, name: 'All Users', description: 'Todos os jogadores cadastrados na plataforma', item_count: allUsersItems?.length || 0 }
    : segments?.find((s: any) => s.id === selectedSegment);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Segmentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Crie listas de jogadores por CPF para operações em lote</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary border-0">
              <Plus className="w-4 h-4 mr-2" /> Novo Segmento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Segmento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: VIPs Março 2026" className="bg-secondary border-border" />
              </div>
              <div>
                <Label>Descrição (opcional)</Label>
                <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Jogadores VIP do mês" className="bg-secondary border-border" />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
              <Button onClick={() => createMut.mutate()} disabled={!newName || createMut.isPending} className="gradient-primary border-0">
                {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ApiCredentialsBar onCredentials={setCreds} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Segments List */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* All Users - permanent, undeletable */}
              <button
                onClick={() => setSelectedSegment(ALL_USERS_ID)}
                className={`w-full glass-card p-4 text-left transition-all hover:border-primary/30 group ${
                  selectedSegment === ALL_USERS_ID ? 'border-primary/50 bg-primary/5' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      All Users
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">Todos os jogadores da plataforma</p>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        <Hash className="w-3 h-3 mr-1" />
                        {allUsersItems?.length || '—'} jogadores
                      </Badge>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${
                    selectedSegment === ALL_USERS_ID ? 'rotate-90' : ''
                  }`} />
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
                    className={`w-full glass-card p-4 text-left transition-all hover:border-primary/30 group ${
                      selectedSegment === seg.id ? 'border-primary/50 bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{seg.name}</p>
                        {seg.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{seg.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            <Hash className="w-3 h-3 mr-1" />
                            {seg.item_count} CPFs
                          </Badge>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {fmtDate(seg.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); deleteMut.mutate(seg.id); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${
                          selectedSegment === seg.id ? 'rotate-90' : ''
                        }`} />
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
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground">{selectedSeg.name}</h2>
                  {selectedSeg.description && (
                    <p className="text-sm text-muted-foreground">{selectedSeg.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {!isAllUsers && <Dialog open={addCpfOpen} onOpenChange={setAddCpfOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="border-border">
                        <Upload className="w-4 h-4 mr-2" /> Adicionar CPFs
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Adicionar CPFs ao Segmento</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <Label>Cole os CPFs (um por linha, separados por vírgula ou espaço)</Label>
                        <Textarea
                          value={cpfInput}
                          onChange={e => setCpfInput(e.target.value)}
                          placeholder={"12345678901\n98765432109\n11122233344"}
                          rows={8}
                          className="bg-secondary border-border font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          {parseCPFs(cpfInput).length} CPF(s) válido(s) detectado(s)
                        </p>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                        <Button
                          onClick={() => addCpfsMut.mutate()}
                          disabled={parseCPFs(cpfInput).length === 0 || addCpfsMut.isPending}
                          className="gradient-primary border-0"
                        >
                          {addCpfsMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          Adicionar {parseCPFs(cpfInput).length} CPFs
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>}

                  {/* Mass Credit Button */}
                  <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
                    <DialogTrigger asChild>
                      <Button className="gradient-success border-0 text-success-foreground" size="sm" disabled={!effectiveItems || effectiveItems.length === 0}>
                        <CreditCard className="w-4 h-4 mr-2" /> Creditar Segmento
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Creditação em Massa</DialogTitle>
                        <DialogDescription>
                          Creditar bônus para todos os {effectiveItems?.length || 0} CPFs do segmento "{selectedSeg?.name}"
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        {!creds.username && (
                          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">
                            ⚠️ Conecte-se primeiro na barra de credenciais acima
                          </div>
                        )}
                        <div>
                          <Label>Valor do Bônus (R$)</Label>
                          <Input
                            type="number"
                            value={creditAmount}
                            onChange={e => setCreditAmount(e.target.value)}
                            className="bg-secondary border-border font-mono mt-1"
                            placeholder="10"
                          />
                        </div>
                        <div className="p-3 rounded-lg bg-secondary/50 text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">CPFs no segmento</span>
                            <span className="font-semibold text-foreground">{effectiveItems?.length || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Valor por jogador</span>
                            <span className="font-mono text-foreground">R$ {parseFloat(creditAmount) || 0}</span>
                          </div>
                          <div className="flex justify-between border-t border-border pt-1 mt-1">
                            <span className="text-muted-foreground font-semibold">Total estimado</span>
                            <span className="font-mono font-bold text-foreground">
                              R$ {((effectiveItems?.length || 0) * (parseFloat(creditAmount) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        {creditLoading && (
                          <div className="space-y-2">
                            <Progress value={creditProgress.total > 0 ? (creditProgress.current / creditProgress.total) * 100 : 0} className="h-2" />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Processando {creditProgress.current}/{creditProgress.total}</span>
                              <span>
                                <span className="text-success">{creditProgress.credited} ✓</span>
                                {creditProgress.errors > 0 && <span className="text-destructive ml-2">{creditProgress.errors} ✗</span>}
                              </span>
                            </div>
                          </div>
                        )}

                        {!creditLoading && creditProgress.current > 0 && (
                          <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm">
                            <p className="font-semibold text-success">Processamento concluído!</p>
                            <p className="text-muted-foreground mt-1">
                              {creditProgress.credited} creditados, {creditProgress.errors} erros
                            </p>
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose>
                        {creditLoading ? (
                          <Button
                            onClick={() => { creditCancelRef.current = true; }}
                            variant="destructive"
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            Cancelar
                          </Button>
                        ) : (
                          <Button
                            onClick={handleMassCredit}
                            disabled={!creds.username || !effectiveItems?.length}
                            className="gradient-success border-0 text-success-foreground"
                          >
                            <DollarSign className="w-4 h-4 mr-2" />
                            Iniciar Creditação
                          </Button>
                        )}
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Verify Bonus Button */}
                  <Dialog open={verifyOpen} onOpenChange={(o) => { setVerifyOpen(o); if (!o) { setVerifyDone(false); } }}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="border-border" disabled={!effectiveItems || effectiveItems.length === 0}>
                        <SearchCheck className="w-4 h-4 mr-2" /> Verificar Bônus
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Verificar Bônus no Segmento</DialogTitle>
                        <DialogDescription>
                          Verifica quais jogadores já receberam bônus nos últimos X dias e permite removê-los do segmento.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        {!creds.username && (
                          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">
                            ⚠️ Conecte-se primeiro na barra de credenciais acima
                          </div>
                        )}
                        <div>
                          <Label>Período (dias)</Label>
                          <Input
                            type="number"
                            value={verifyDays}
                            onChange={e => setVerifyDays(e.target.value)}
                            className="bg-secondary border-border font-mono mt-1"
                            placeholder="7"
                            min="1"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Jogadores que receberam bônus nos últimos {verifyDays || '0'} dias serão marcados
                          </p>
                        </div>
                        <div>
                          <Label>Concorrência</Label>
                          <Input
                            type="number"
                            value={verifyConcurrency}
                            onChange={e => setVerifyConcurrency(e.target.value)}
                            className="bg-secondary border-border font-mono mt-1"
                            placeholder="5"
                            min="1"
                            max="20"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Quantidade de verificações simultâneas (1-20). Maior = mais rápido, mas pode sobrecarregar.
                          </p>
                        </div>

                        {verifyLoading && (
                          <div className="space-y-2">
                            <Progress value={verifyProgress.total > 0 ? (verifyProgress.current / verifyProgress.total) * 100 : 0} className="h-2" />
                            <p className="text-xs text-muted-foreground text-center">
                              Verificando {verifyProgress.current}/{verifyProgress.total} jogadores...
                            </p>
                          </div>
                        )}

                        {verifyDone && (
                          <div className="space-y-3">
                            <div className="p-3 rounded-lg bg-secondary/50 text-sm space-y-1">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Total verificados</span>
                                <span className="font-semibold text-foreground">{Object.keys(verifyResults).length}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground flex items-center gap-1"><ShieldX className="w-3 h-3 text-destructive" /> Com bônus</span>
                                <span className="font-semibold text-destructive">{Object.values(verifyResults).filter(r => r.hasBonus).length}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-success" /> Sem bônus</span>
                                <span className="font-semibold text-success">{Object.values(verifyResults).filter(r => !r.hasBonus).length}</span>
                              </div>
                            </div>

                            {Object.values(verifyResults).filter(r => r.hasBonus).length > 0 && (
                              <Button
                                onClick={handleRemoveWithBonus}
                                className="w-full"
                                variant="destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Remover {Object.values(verifyResults).filter(r => r.hasBonus).length} CPFs com bônus
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose>
                        {!verifyDone && (
                          verifyLoading ? (
                            <Button
                              onClick={() => { verifyCancelRef.current = true; }}
                              variant="destructive"
                            >
                              <Ban className="w-4 h-4 mr-2" />
                              Cancelar
                            </Button>
                          ) : (
                            <Button
                              onClick={handleVerifyBonus}
                              disabled={!creds.username || !effectiveItems?.length}
                              className="gradient-primary border-0"
                            >
                              <SearchCheck className="w-4 h-4 mr-2" />
                              Iniciar Verificação
                            </Button>
                          )
                        )}
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

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
              ) : effectiveItems && effectiveItems.length > 0 ? (
                <>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/50">
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">CPF</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">CPF Mascarado</TableHead>
                        {isAllUsers && <TableHead className="text-xs font-semibold uppercase tracking-wider">Username</TableHead>}
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">{isAllUsers ? 'Cadastro' : 'Adicionado em'}</TableHead>
                        {Object.keys(verifyResults).length > 0 && (
                          <TableHead className="text-xs font-semibold uppercase tracking-wider">Status Bônus</TableHead>
                        )}
                        {!isAllUsers && <TableHead className="text-xs font-semibold uppercase tracking-wider w-12"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedItems.map((item: any) => {
                        const vr = verifyResults[item.cpf];
                        return (
                          <TableRow key={item.id} className={`hover:bg-secondary/30 ${vr?.hasBonus ? 'bg-destructive/5' : ''}`}>
                            <TableCell className="font-mono text-sm">{fmtCPF(item.cpf)}</TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">{item.cpf_masked}</TableCell>
                            {isAllUsers && <TableCell className="text-sm">{item.username || '—'}</TableCell>}
                            <TableCell className="text-xs text-muted-foreground">{item.created_at ? fmtDate(item.created_at) : '—'}</TableCell>
                            {Object.keys(verifyResults).length > 0 && (
                              <TableCell>
                                {vr ? (
                                  vr.hasBonus ? (
                                    <div className="flex items-center gap-1.5">
                                      <ShieldX className="w-3.5 h-3.5 text-destructive" />
                                      <span className="text-xs text-destructive font-medium">
                                        {vr.bonusCount}x bônus
                                        {vr.lastBonusDate && (
                                          <span className="text-muted-foreground font-normal ml-1">
                                            ({fmtDate(vr.lastBonusDate)})
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <ShieldCheck className="w-3.5 h-3.5 text-success" />
                                      <span className="text-xs text-success font-medium">Sem bônus</span>
                                    </div>
                                  )
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            )}
                            {!isAllUsers && (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => removeCpfMut.mutate(item.id)}
                                >
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

                {/* Pagination controls */}
                {effectiveItems && effectiveItems.length > 0 && (
                  <div className="flex items-center justify-between gap-4 pt-3 px-1 flex-wrap">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Linhas por página:</span>
                      <Select value={String(tablePageSize)} onValueChange={(v) => { setTablePageSize(Number(v)); setTablePage(0); }}>
                        <SelectTrigger className="h-7 w-16 text-xs bg-secondary border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[25, 50, 100].map(s => (
                            <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="ml-2">{(tableStart + 1).toLocaleString('pt-BR')}-{Math.min(tableStart + tablePageSize, effectiveItems.length).toLocaleString('pt-BR')} de {effectiveItems.length.toLocaleString('pt-BR')}</span>
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
                  <p className="text-sm text-muted-foreground">{isAllUsers ? 'Nenhum jogador encontrado' : 'Nenhum CPF neste segmento'}</p>
                  {!isAllUsers && <p className="text-xs text-muted-foreground mt-1">Clique em "Adicionar CPFs" para começar</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card p-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Selecione um segmento para ver os CPFs</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
