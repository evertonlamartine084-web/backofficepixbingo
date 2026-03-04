import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Users, ChevronRight, Loader2, Upload, X, Hash, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
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
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [cpfInput, setCpfInput] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [addCpfOpen, setAddCpfOpen] = useState(false);

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
                <Dialog open={addCpfOpen} onOpenChange={setAddCpfOpen}>
                  <DialogTrigger asChild>
                    <Button className="gradient-primary border-0" size="sm">
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
                        <TableHead className="text-xs font-semibold uppercase tracking-wider w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item: any) => (
                        <TableRow key={item.id} className="hover:bg-secondary/30">
                          <TableCell className="font-mono text-sm">{fmtCPF(item.cpf)}</TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">{item.cpf_masked}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(item.created_at)}</TableCell>
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
                      ))}
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
