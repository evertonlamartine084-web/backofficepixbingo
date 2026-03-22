/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, ShoppingBag, Trash2, Coins, Star, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CATEGORIES = ['geral', 'bonus', 'cosmetico', 'vip', 'torneio'];

const REWARD_TYPES = [
  { value: 'bonus', label: 'Bônus na plataforma (R$)' },
  { value: 'free_bet', label: 'Free Bet (R$)' },
  { value: 'cartelas', label: 'Cartelas de Bingo (R$)' },
  { value: 'coins', label: 'Moedas' },
  { value: 'xp', label: 'XP' },
  { value: 'diamonds', label: 'Diamantes' },
  { value: 'physical', label: 'Produto físico (manual)' },
  { value: 'coupon', label: 'Cupom / Voucher (manual)' },
];

const CURRENCY_OPTIONS = [
  { value: 'coins', label: 'Moedas (Coins)' },
  { value: 'diamonds', label: 'Diamantes' },
  { value: 'xp', label: 'XP (Gemas)' },
];

const emptyForm = {
  name: '', description: '', image_url: '', currency: 'coins', price: '',
  category: 'geral', stock: '', min_level: '1',
  reward_type: 'bonus', reward_value: '', reward_description: '', discount_percent: '',
};

const categoryLabel: Record<string, string> = {
  geral: 'Geral', bonus: 'Bônus', cosmetico: 'Cosmético', vip: 'VIP', torneio: 'Torneio',
};

export default function Store() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['store_items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('store_items').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error('Preencha o nome');
      const priceVal = parseInt(form.price) || 0;
      const payload = {
        name: form.name,
        description: form.description,
        image_url: form.image_url || null,
        price_coins: form.currency === 'coins' ? priceVal : 0,
        price_diamonds: form.currency === 'diamonds' ? priceVal : 0,
        price_xp: form.currency === 'xp' ? priceVal : 0,
        category: form.category,
        stock: form.stock ? parseInt(form.stock) : null,
        min_level: parseInt(form.min_level) || 1,
        reward_type: form.reward_type,
        reward_value: form.reward_value || null,
        reward_description: form.reward_description || null,
        discount_percent: parseInt(form.discount_percent) || 0,
      } as any;

      if (editingId) {
        const { error } = await supabase.from('store_items').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('store_items').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store_items'] });
      toast.success(editingId ? 'Item atualizado' : 'Item criado');
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('store_items').update({ active } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['store_items'] }); toast.success('Status atualizado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('store_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['store_items'] }); toast.success('Item excluído'); },
    onError: (e: Error) => toast.error('Erro ao excluir: ' + e.message),
  });

  function closeDialog() {
    setOpen(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  function openEdit(item: any) {
    setEditingId(item.id);
    // Detectar moeda principal do item
    let currency = 'coins';
    let price = '';
    if (item.price_diamonds > 0) { currency = 'diamonds'; price = String(item.price_diamonds); }
    else if (item.price_xp > 0 && !item.price_coins) { currency = 'xp'; price = String(item.price_xp); }
    else if (item.price_coins > 0) { currency = 'coins'; price = String(item.price_coins); }
    setForm({
      name: item.name || '',
      description: item.description || '',
      image_url: item.image_url || '',
      currency,
      price,
      category: item.category || 'geral',
      stock: item.stock !== null && item.stock !== undefined ? String(item.stock) : '',
      min_level: item.min_level ? String(item.min_level) : '1',
      reward_type: item.reward_type || 'bonus',
      reward_value: item.reward_value || '',
      reward_description: item.reward_description || '',
      discount_percent: item.discount_percent ? String(item.discount_percent) : '',
    });
    setOpen(true);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <ShoppingBag className="w-7 h-7 text-primary" /> Loja
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Itens que os jogadores podem trocar por moedas ou XP</p>
        </div>
        <Button onClick={openCreate} className="gap-2 gradient-primary border-0">
          <Plus className="w-4 h-4" /> Novo Item
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : items.length === 0 ? (
        <Card className="border-dashed border-2 border-border">
          <CardContent className="py-12 text-center">
            <ShoppingBag className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhum item na loja</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item: any) => {
            const price = item.price_coins > 0
              ? { value: item.price_coins, label: 'moedas', icon: <Coins className="w-3.5 h-3.5" />, color: 'text-amber-400' }
              : item.price_diamonds > 0
              ? { value: item.price_diamonds, label: 'diamantes', icon: <span className="text-xs">◆</span>, color: 'text-cyan-400' }
              : item.price_xp > 0
              ? { value: item.price_xp, label: 'XP', icon: <Star className="w-3.5 h-3.5" />, color: 'text-emerald-400' }
              : null;

            return (
              <div
                key={item.id}
                className={`group relative rounded-xl border border-border/50 bg-card overflow-hidden transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 ${!item.active ? 'opacity-60' : ''}`}
              >
                {/* Image */}
                <div className="relative aspect-[16/10] bg-secondary/50 overflow-hidden">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag className="w-10 h-10 text-muted-foreground/20" />
                    </div>
                  )}
                  {/* Badges overlay */}
                  <div className="absolute top-2 left-2 flex gap-1.5">
                    <Badge className="text-[10px] bg-black/60 backdrop-blur-sm text-white border-0 px-2">
                      {categoryLabel[item.category] || item.category}
                    </Badge>
                    {!item.active && (
                      <Badge className="text-[10px] bg-black/60 backdrop-blur-sm text-red-400 border-0 px-2">
                        Inativo
                      </Badge>
                    )}
                  </div>
                  {item.discount_percent > 0 && (
                    <div className="absolute top-2 right-2">
                      <Badge className="text-xs font-bold bg-red-500 text-white border-0 px-2 py-0.5 shadow-lg">
                        -{item.discount_percent}%
                      </Badge>
                    </div>
                  )}
                  {/* Price tag */}
                  {price && (
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent pt-6 pb-2 px-3">
                      <div className={`flex items-center gap-1.5 font-bold text-sm ${price.color}`}>
                        {price.icon}
                        <span>{price.value.toLocaleString()}</span>
                        <span className="text-xs font-normal opacity-80">{price.label}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-3.5">
                  <h3 className="font-semibold text-sm text-foreground leading-tight mb-1 line-clamp-1">{item.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{item.description || 'Sem descrição'}</p>

                  {/* Meta info */}
                  <div className="flex items-center gap-3 mt-2.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                      Nv. {item.min_level}
                    </span>
                    {item.stock !== null && (
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
                        {item.stock} em estoque
                      </span>
                    )}
                  </div>

                  {/* Reward */}
                  {item.reward_type && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <div className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                        <span className="text-[8px]">🎁</span>
                      </div>
                      <span className="truncate">
                        {REWARD_TYPES.find(r => r.value === item.reward_type)?.label || item.reward_type}
                        {item.reward_value ? ` · ${item.reward_value}` : ''}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/50">
                    <Switch
                      checked={item.active}
                      onCheckedChange={(active) => toggleMutation.mutate({ id: item.id, active })}
                      className="scale-75 origin-left"
                    />
                    <div className="flex gap-0">
                      <button className="p-1.5 rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => openEdit(item)}>
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={() => { if (confirm('Excluir item?')) deleteMutation.mutate(item.id); }}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Item' : 'Novo Item da Loja'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Bônus 50% Depósito" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalhes do item..." rows={2} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">URL da imagem (opcional)</Label>
              <Input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://..." className="mt-1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Moeda de pagamento</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Preço</Label>
                <Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Desconto (%)</Label>
                <Input type="number" value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))} placeholder="0" className="mt-1" min="0" max="100" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Categoria</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{categoryLabel[c] || c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Estoque (vazio = ∞)</Label>
                <Input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} placeholder="∞" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Nível mínimo</Label>
                <Input type="number" value={form.min_level} onChange={e => setForm(f => ({ ...f, min_level: e.target.value }))} placeholder="1" className="mt-1" />
              </div>
            </div>
            <div className="border-t border-border pt-4 mt-2">
              <p className="text-sm font-semibold text-foreground mb-3">O que o jogador recebe ao resgatar?</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tipo de entrega</Label>
                  <Select value={form.reward_type} onValueChange={v => setForm(f => ({ ...f, reward_type: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REWARD_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Valor da entrega</Label>
                  <Input value={form.reward_value} onChange={e => setForm(f => ({ ...f, reward_value: e.target.value }))} placeholder="Ex: R$ 50, 500 moedas" className="mt-1" />
                </div>
              </div>
              <div className="mt-3">
                <Label className="text-xs">Descrição da entrega (exibida ao jogador)</Label>
                <Textarea value={form.reward_description} onChange={e => setForm(f => ({ ...f, reward_description: e.target.value }))} placeholder="Ex: Bônus de R$ 50 creditado automaticamente na sua conta após o resgate" rows={2} className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gradient-primary border-0">
              {editingId ? 'Salvar' : 'Criar Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
