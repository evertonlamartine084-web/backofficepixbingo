import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Users, ChevronRight, Loader2, Upload, X, Hash, Calendar, CreditCard, DollarSign, SearchCheck, ShieldCheck, ShieldX } from 'lucide-react';
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

export default function Segments() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { callProxy } = useProxy();
  const [creds, setCreds] = useState({ username: '', password: '' });
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
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState({ current: 0, total: 0 });
  const [verifyResults, setVerifyResults] = useState<Record<string, { hasBonus: boolean; lastBonusDate?: string; bonusCount: number }>>({});
  const [verifyDone, setVerifyDone] = useState(false);

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

  // Fetch items for selected segment
  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['segment_items', selectedSegment],
    enabled: !!selectedSegment,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('segment_items')
        .select('*')
        .eq('segment_id', selectedSegment!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

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
    if (!selectedSegment || !items || items.length === 0) {
      toast.error('Segmento sem CPFs');
      return;
    }

    setCreditLoading(true);
    setCreditProgress({ current: 0, total: items.length, credited: 0, errors: 0 });

    try {
      // 1. Create a batch from segment
      const batchName = `${selectedSeg?.name || 'Segmento'} - Crédito ${new Date().toLocaleDateString('pt-BR')}`;
      const { data: batch, error: batchErr } = await supabase.from('batches').insert({
        name: batchName,
        bonus_valor: parseFloat(creditAmount) || 0,
        total_items: items.length,
        status: 'EM_ANDAMENTO',
      }).select().single();

      if (batchErr || !batch) throw new Error(batchErr?.message || 'Erro ao criar lote');

      // 2. Insert batch_items from segment CPFs
      const batchItems = items.map((item: any) => ({
        batch_id: batch.id,
        cpf: item.cpf,
        cpf_masked: item.cpf_masked,
        status: 'PENDENTE',
      }));

      const { error: itemsErr } = await supabase.from('batch_items').insert(batchItems);
      if (itemsErr) throw new Error(itemsErr.message);

      // 3. Trigger credit_batch via proxy
      const res = await callProxy('credit_batch', creds, {
        batch_id: batch.id,
        bonus_amount: parseFloat(creditAmount),
      });

      const result = res?.data;
      setCreditProgress({
        current: items.length,
        total: items.length,
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
      toast.error(err.message || 'Erro na creditação em massa');
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
    if (!items || items.length === 0) return;

    const days = parseInt(verifyDays) || 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    setVerifyLoading(true);
    setVerifyDone(false);
    setVerifyResults({});
    setVerifyProgress({ current: 0, total: items.length });

    const results: Record<string, { hasBonus: boolean; lastBonusDate?: string; bonusCount: number }> = {};

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setVerifyProgress({ current: i + 1, total: items.length });

      try {
        // Search player to get UUID
        const searchRes = await callProxy('search_player', creds, { cpf: item.cpf });
        const foundPlayer = searchRes?.data?.aaData?.[0];
        const uuid = foundPlayer?.uuid;

        if (!uuid) {
          results[item.cpf] = { hasBonus: false, bonusCount: 0 };
          setVerifyResults({ ...results });
          continue;
        }

        // Get transactions
        const txRes = await callProxy('player_transactions', creds, { uuid, player_id: uuid, cpf: item.cpf });
        const movimentacoes = txRes?.data?.movimentacoes || txRes?.data?.historico || [];
        const txList = Array.isArray(movimentacoes) ? movimentacoes : [];

        // Filter bonus transactions within the date range
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
      } catch {
        results[item.cpf] = { hasBonus: false, bonusCount: 0 };
      }

      setVerifyResults({ ...results });
    }

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
    if (!items) return;
    const cpfsWithBonus = items.filter((item: any) => verifyResults[item.cpf]?.hasBonus);
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

  const selectedSeg = segments?.find((s: any) => s.id === selectedSegment);

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
          ) : segments?.length === 0 ? (
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
                  <Dialog open={addCpfOpen} onOpenChange={setAddCpfOpen}>
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
                  </Dialog>

                  {/* Mass Credit Button */}
                  <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
                    <DialogTrigger asChild>
                      <Button className="gradient-success border-0 text-success-foreground" size="sm" disabled={!items || items.length === 0}>
                        <CreditCard className="w-4 h-4 mr-2" /> Creditar Segmento
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Creditação em Massa</DialogTitle>
                        <DialogDescription>
                          Creditar bônus para todos os {items?.length || 0} CPFs do segmento "{selectedSeg?.name}"
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
                            <span className="font-semibold text-foreground">{items?.length || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Valor por jogador</span>
                            <span className="font-mono text-foreground">R$ {parseFloat(creditAmount) || 0}</span>
                          </div>
                          <div className="flex justify-between border-t border-border pt-1 mt-1">
                            <span className="text-muted-foreground font-semibold">Total estimado</span>
                            <span className="font-mono font-bold text-foreground">
                              R$ {((items?.length || 0) * (parseFloat(creditAmount) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                        <Button
                          onClick={handleMassCredit}
                          disabled={creditLoading || !creds.username || !items?.length}
                          className="gradient-success border-0 text-success-foreground"
                        >
                          {creditLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
                          {creditLoading ? 'Processando...' : 'Iniciar Creditação'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Verify Bonus Button */}
                  <Dialog open={verifyOpen} onOpenChange={(o) => { setVerifyOpen(o); if (!o) { setVerifyDone(false); } }}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="border-border" disabled={!items || items.length === 0}>
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
                          <Button
                            onClick={handleVerifyBonus}
                            disabled={verifyLoading || !creds.username || !items?.length}
                            className="gradient-primary border-0"
                          >
                            {verifyLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <SearchCheck className="w-4 h-4 mr-2" />}
                            {verifyLoading ? 'Verificando...' : 'Iniciar Verificação'}
                          </Button>
                        )}
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {itemsLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : items && items.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/50">
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">CPF</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">CPF Mascarado</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Adicionado em</TableHead>
                        {Object.keys(verifyResults).length > 0 && (
                          <TableHead className="text-xs font-semibold uppercase tracking-wider">Status Bônus</TableHead>
                        )}
                        <TableHead className="text-xs font-semibold uppercase tracking-wider w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item: any) => {
                        const vr = verifyResults[item.cpf];
                        return (
                          <TableRow key={item.id} className={`hover:bg-secondary/30 ${vr?.hasBonus ? 'bg-destructive/5' : ''}`}>
                            <TableCell className="font-mono text-sm">{fmtCPF(item.cpf)}</TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">{item.cpf_masked}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{fmtDate(item.created_at)}</TableCell>
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
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-10">
                  <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum CPF neste segmento</p>
                  <p className="text-xs text-muted-foreground mt-1">Clique em "Adicionar CPFs" para começar</p>
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
