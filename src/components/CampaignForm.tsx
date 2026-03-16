import { useState } from 'react';
import { format } from 'date-fns';
import { Plus, CalendarIcon, MousePointer } from 'lucide-react';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { CampaignType } from '@/hooks/use-campaigns';

interface FormData {
  name: string;
  type: CampaignType;
  description: string;
  segment_id: string;
  popup_id: string;
  min_value: string;
  prize_value: string;
  prize_description: string;
  wallet_type: 'REAL' | 'BONUS';
  metric: string;
  game_filter: string;
  start_date?: Date;
  end_date?: Date;
}

const INITIAL_FORM: FormData = {
  name: '', type: 'aposte_e_ganhe', description: '', segment_id: '', popup_id: '',
  min_value: '', prize_value: '', prize_description: '', wallet_type: 'REAL',
  metric: 'valor', game_filter: '', start_date: undefined, end_date: undefined,
};

interface Props {
  segments: { id: string; name: string }[];
  popupsList: { id: string; name: string }[];
  partidas: { key: string; label: string; valor: string; tipo: string }[];
  onSubmit: (form: FormData) => void;
  isPending: boolean;
}

export function CampaignForm({ segments, popupsList, partidas, onSubmit, isPending }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);

  const handleSubmit = () => {
    onSubmit(form);
    if (!isPending) {
      setOpen(false);
      setForm(INITIAL_FORM);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(INITIAL_FORM); }}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="w-4 h-4" /> Nova Campanha</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Criar Campanha</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Promo Março" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo *</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as CampaignType }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aposte_e_ganhe">Aposte e Ganhe</SelectItem>
                  <SelectItem value="deposite_e_ganhe">Deposite e Ganhe</SelectItem>
                  <SelectItem value="ganhou_no_keno">Ganhou no Keno</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className={cn("grid gap-3", form.type === 'aposte_e_ganhe' ? 'grid-cols-3' : form.type === 'ganhou_no_keno' ? 'grid-cols-2' : 'grid-cols-1')}>
            <div className="space-y-1">
              <Label className="text-xs">Segmento *</Label>
              <Select value={form.segment_id} onValueChange={v => setForm(f => ({ ...f, segment_id: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {segments.map(s => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            {form.type === 'aposte_e_ganhe' && (
              <div className="space-y-1">
                <Label className="text-xs">Carteira *</Label>
                <Select value={form.wallet_type} onValueChange={v => setForm(f => ({ ...f, wallet_type: v as 'REAL' | 'BONUS' }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REAL">Saldo Real</SelectItem>
                    <SelectItem value="BONUS">Saldo Bônus</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.type === 'aposte_e_ganhe' && (
              <div className="space-y-1">
                <Label className="text-xs">Categoria do jogo</Label>
                <Select value={form.game_filter} onValueChange={v => setForm(f => ({ ...f, game_filter: v === '__none__' ? '' : v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todos os jogos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Todos os jogos</SelectItem>
                    <SelectItem value="BINGO">Somente Bingo</SelectItem>
                    <SelectItem value="CASSINO">Somente Cassino</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.type === 'ganhou_no_keno' && (
              <div className="space-y-1">
                <Label className="text-xs">Filtro de cartela</Label>
                <Select value={form.game_filter} onValueChange={v => setForm(f => ({ ...f, game_filter: v === '__none__' ? '' : v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todas as cartelas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Todas as cartelas</SelectItem>
                    {partidas.map(p => (
                      <SelectItem key={p.key} value={p.valor}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><MousePointer className="w-3 h-3" /> Opt-in via Popup (opcional)</Label>
            <Select value={form.popup_id} onValueChange={v => setForm(f => ({ ...f, popup_id: v === '__none__' ? '' : v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Sem opt-in" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem opt-in (todos do segmento)</SelectItem>
                {popupsList.map(p => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">Se selecionado, somente jogadores que clicaram neste popup participam.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">
                {form.type === 'ganhou_no_keno' ? 'Prêmio mín. (R$)' : form.type === 'aposte_e_ganhe' ? 'Aposta mín. (R$)' : 'Depósito mín. (R$)'}
              </Label>
              <Input type="number" value={form.min_value} onChange={e => setForm(f => ({ ...f, min_value: e.target.value }))} placeholder="0.00" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Prêmio (R$)</Label>
              <Input type="number" value={form.prize_value} onChange={e => setForm(f => ({ ...f, prize_value: e.target.value }))} placeholder="0.00" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Desc. prêmio</Label>
              <Input value={form.prize_description} onChange={e => setForm(f => ({ ...f, prize_description: e.target.value }))} placeholder="Opcional" className="h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalhes da campanha..." rows={2} className="resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Início *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('w-full justify-start gap-1 h-9 text-xs', !form.start_date && 'text-muted-foreground')}>
                    <CalendarIcon className="w-3.5 h-3.5" />
                    {form.start_date ? format(form.start_date, 'dd/MM/yy HH:mm') : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <DateTimePicker date={form.start_date} onSelect={d => setForm(f => ({ ...f, start_date: d }))} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fim *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('w-full justify-start gap-1 h-9 text-xs', !form.end_date && 'text-muted-foreground')}>
                    <CalendarIcon className="w-3.5 h-3.5" />
                    {form.end_date ? format(form.end_date, 'dd/MM/yy HH:mm') : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <DateTimePicker date={form.end_date} onSelect={d => setForm(f => ({ ...f, end_date: d }))} disabled={d => form.start_date ? d < form.start_date : false} />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Criando...' : 'Criar Campanha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
