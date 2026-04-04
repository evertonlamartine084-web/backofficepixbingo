import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Package, Search, CheckCircle, Clock, AlertTriangle, Truck, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface StoreItemRef {
  name: string;
  image_url: string | null;
  category: string;
  reward_type: string;
}

interface StorePurchaseRow {
  id: string;
  cpf: string;
  store_item_id: string;
  status: string;
  price_coins: number;
  price_diamonds: number;
  price_xp: number;
  delivery_note: string | null;
  reward_type: string | null;
  reward_value: string | null;
  delivered_at: string | null;
  created_at: string;
  store_items: StoreItemRef | null;
}

interface PendingRewardRow {
  id: string;
  cpf: string;
  reward_type: string;
  description: string | null;
  reward_value: string | null;
  created_at: string;
  claimed_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-500/15 text-yellow-400', icon: Clock },
  pending_manual: { label: 'Entrega Manual', color: 'bg-orange-500/15 text-orange-400', icon: Truck },
  delivered: { label: 'Entregue', color: 'bg-green-500/15 text-green-400', icon: CheckCircle },
  failed: { label: 'Falha', color: 'bg-red-500/15 text-red-400', icon: AlertTriangle },
};

export default function StoreDeliveries() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('_all');
  const [cpfFilter, setCpfFilter] = useState('');
  const [deliverDialog, setDeliverDialog] = useState<StorePurchaseRow | null>(null);
  const [deliveryNote, setDeliveryNote] = useState('');

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['store-purchases', statusFilter, cpfFilter],
    queryFn: async () => {
      let query = supabase
        .from('store_purchases')
        .select('*, store_items(name, image_url, category, reward_type)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (statusFilter !== '_all') query = query.eq('status', statusFilter);
      if (cpfFilter.trim()) query = query.eq('cpf', cpfFilter.replace(/\D/g, ''));

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as StorePurchaseRow[];
    },
  });

  const { data: pendingRewards = [] } = useQuery({
    queryKey: ['pending-rewards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_rewards_pending')
        .select('*')
        .is('claimed_at', null)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as PendingRewardRow[];
    },
  });

  const markDelivered = useMutation({
    mutationFn: async ({ purchaseId, note }: { purchaseId: string; note: string }) => {
      const { error } = await supabase
        .from('store_purchases')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          delivery_note: note || 'Entregue manualmente pelo operador',
        } as Record<string, unknown>)
        .eq('id', purchaseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-purchases'] });
      toast.success('Compra marcada como entregue!');
      setDeliverDialog(null);
      setDeliveryNote('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markRewardClaimed = useMutation({
    mutationFn: async (rewardId: string) => {
      const { error } = await supabase
        .from('player_rewards_pending')
        .update({ claimed_at: new Date().toISOString() } as Record<string, unknown>)
        .eq('id', rewardId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-rewards'] });
      toast.success('Recompensa marcada como entregue!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingCount = purchases.filter(p => p.status === 'pending' || p.status === 'pending_manual').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Package className="w-6 h-6 text-primary" /> Gestão de Entregas da Loja
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie compras e entregas pendentes dos jogadores</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total" value={purchases.length} color="text-foreground" />
        <SummaryCard label="Pendentes" value={pendingCount} color="text-yellow-400" />
        <SummaryCard label="Entregues" value={purchases.filter(p => p.status === 'delivered').length} color="text-green-400" />
        <SummaryCard label="Recompensas Pendentes" value={pendingRewards.length} color="text-orange-400" />
      </div>

      {/* Filters */}
      <Card className="glass-card border-border">
        <CardContent className="p-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-secondary border-border w-48">
                  <Filter className="w-3.5 h-3.5 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="pending_manual">Entrega Manual</SelectItem>
                  <SelectItem value="delivered">Entregue</SelectItem>
                  <SelectItem value="failed">Falha</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">CPF do Jogador</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Filtrar por CPF..."
                  value={cpfFilter}
                  onChange={e => setCpfFilter(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && queryClient.invalidateQueries({ queryKey: ['store-purchases'] })}
                  className="bg-secondary border-border"
                />
                <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ['store-purchases'] })}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending Rewards Queue */}
      {pendingRewards.length > 0 && (
        <Card className="glass-card border-border border-orange-500/20">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4 text-orange-400" />
              Fila de Recompensas Pendentes ({pendingRewards.length})
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CPF</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="text-right">Data</TableHead>
                  <TableHead className="text-center">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRewards.map((r: PendingRewardRow) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.cpf}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize text-[10px]">{r.reward_type}</Badge></TableCell>
                    <TableCell className="text-xs">{r.description || '—'}</TableCell>
                    <TableCell className="text-xs font-mono">{r.reward_value || '—'}</TableCell>
                    <TableCell className="text-right text-xs">{new Date(r.created_at).toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs border-green-500/30 text-green-400 hover:bg-green-500/10"
                        onClick={() => markRewardClaimed.mutate(r.id)}
                        disabled={markRewardClaimed.isPending}
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Entregue
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Purchases Table */}
      <Card className="glass-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : purchases.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma compra encontrada</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead className="text-center">Preço</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Nota de Entrega</TableHead>
                  <TableHead className="text-right">Data</TableHead>
                  <TableHead className="text-center">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p: StorePurchaseRow) => {
                  const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending;
                  const StatusIcon = cfg.icon;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {p.store_items?.image_url && (
                            <img src={p.store_items.image_url} className="w-8 h-8 rounded object-cover" alt="" />
                          )}
                          <div>
                            <p className="font-medium text-sm">{p.store_items?.name || p.store_item_id}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{p.store_items?.category || ''}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.cpf}</TableCell>
                      <TableCell className="text-center text-xs">
                        {p.price_coins > 0 && <span className="text-amber-400">{p.price_coins} moedas</span>}
                        {p.price_diamonds > 0 && <span className="text-cyan-400 ml-1">{p.price_diamonds} 💎</span>}
                        {p.price_xp > 0 && <span className="text-blue-400 ml-1">{p.price_xp} XP</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${cfg.color} border-0 gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {p.delivery_note || '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div>{new Date(p.created_at).toLocaleDateString('pt-BR')}</div>
                        <div className="text-muted-foreground">{new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        {(p.status === 'pending' || p.status === 'pending_manual') && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs border-green-500/30 text-green-400 hover:bg-green-500/10"
                            onClick={() => { setDeliverDialog(p); setDeliveryNote(''); }}
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1" /> Entregar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Deliver Dialog */}
      <Dialog open={!!deliverDialog} onOpenChange={open => !open && setDeliverDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como Entregue</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-secondary/50 rounded-lg p-3 text-sm">
              <p><strong>Item:</strong> {deliverDialog?.store_items?.name || deliverDialog?.store_item_id}</p>
              <p><strong>CPF:</strong> {deliverDialog?.cpf}</p>
              <p><strong>Tipo:</strong> {deliverDialog?.reward_type}</p>
              <p><strong>Valor:</strong> {deliverDialog?.reward_value}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Nota de entrega (opcional)</label>
              <Textarea
                placeholder="Ex: Enviado por e-mail, código do cupom ABC123..."
                value={deliveryNote}
                onChange={e => setDeliveryNote(e.target.value)}
                className="bg-secondary border-border"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliverDialog(null)}>Cancelar</Button>
            <Button
              className="gradient-primary border-0"
              onClick={() => deliverDialog && markDelivered.mutate({ purchaseId: deliverDialog.id, note: deliveryNote })}
              disabled={markDelivered.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" /> Confirmar Entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card className="glass-card border-border">
      <CardContent className="p-3 text-center">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
