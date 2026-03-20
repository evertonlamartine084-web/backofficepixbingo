import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, ShoppingBag, Trash2, Coins, Star } from 'lucide-react';
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

export default function Store() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', image_url: '', price_coins: '', price_diamonds: '', price_xp: '',
    category: 'geral', stock: '', min_level: '1',
    reward_type: 'bonus', reward_value: '', reward_description: '', discount_percent: '',
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['store_items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('store_items').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error('Preencha o nome');
      const { error } = await supabase.from('store_items').insert({
        name: form.name,
        description: form.description,
        image_url: form.image_url || null,
        price_coins: parseInt(form.price_coins) || 0,
        price_diamonds: parseInt(form.price_diamonds) || 0,
        price_xp: parseInt(form.price_xp) || 0,
        category: form.category,
        stock: form.stock ? parseInt(form.stock) : null,
        min_level: parseInt(form.min_level) || 1,
        reward_type: form.reward_type,
        reward_value: form.reward_value || null,
        reward_description: form.reward_description || null,
        discount_percent: parseInt(form.discount_percent) || 0,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store_items'] });
      toast.success('Item criado');
      setOpen(false);
      setForm({ name: '', description: '', image_url: '', price_coins: '', price_diamonds: '', price_xp: '', category: 'geral', stock: '', min_level: '1', reward_type: 'bonus', reward_value: '', reward_description: '', discount_percent: '' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('store_items').update({ active } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['store_items'] }); toast.success('Status atualizado'); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('store_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['store_items'] }); toast.success('Item excluído'); },
  });

  const categoryLabel: Record<string, string> = {
    geral: 'Geral', bonus: 'Bônus', cosmetico: 'Cosmético', vip: 'VIP', torneio: 'Torneio',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <ShoppingBag className="w-7 h-7 text-primary" /> Loja
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Itens que os jogadores podem trocar por moedas ou XP</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2 gradient-primary border-0">
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item: any) => (
            <Card key={item.id} className="border-border hover:border-primary/30 transition-colors overflow-hidden">
              {item.image_url && <img src={item.image_url} alt="" className="w-full h-32 object-cover" />}
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                      <Badge variant="outline" className="text-[10px]">{categoryLabel[item.category] || item.category}</Badge>
                      {!item.active && <Badge variant="outline" className="text-[10px] text-muted-foreground">Inativo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{item.description || '—'}</p>
                    <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
                      {item.price_coins > 0 && <span className="flex items-center gap-1"><Coins className="w-3 h-3 text-amber-400" />{item.price_coins.toLocaleString()}</span>}
                      {item.price_diamonds > 0 && <span className="flex items-center gap-1 text-cyan-400">◆ {item.price_diamonds.toLocaleString()}</span>}
                      {item.price_xp > 0 && <span className="flex items-center gap-1"><Star className="w-3 h-3 text-primary" />{item.price_xp.toLocaleString()} XP</span>}
                      {item.stock !== null && <span>Estoque: {item.stock}</span>}
                      <span>Nível mín: {item.min_level}</span>
                    </div>
                    {item.reward_type && (
                      <div className="mt-2 px-2 py-1.5 bg-emerald-500/10 rounded-md text-[11px]">
                        <span className="text-emerald-400 font-semibold">Entrega: </span>
                        <span className="text-muted-foreground">
                          {REWARD_TYPES.find(r => r.value === item.reward_type)?.label || item.reward_type}
                          {item.reward_value ? ` — ${item.reward_value}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border">
                  <Switch checked={item.active} onCheckedChange={(active) => toggleMutation.mutate({ id: item.id, active })} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { if (confirm('Excluir item?')) deleteMutation.mutate(item.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Item da Loja</DialogTitle></DialogHeader>
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
                <Label className="text-xs">Preço (moedas)</Label>
                <Input type="number" value={form.price_coins} onChange={e => setForm(f => ({ ...f, price_coins: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Preço (diamantes)</Label>
                <Input type="number" value={form.price_diamonds} onChange={e => setForm(f => ({ ...f, price_diamonds: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Preço (XP)</Label>
                <Input type="number" value={form.price_xp} onChange={e => setForm(f => ({ ...f, price_xp: e.target.value }))} placeholder="0" className="mt-1" />
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
            {/* O que o jogador recebe */}
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
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="gradient-primary border-0">Criar Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
