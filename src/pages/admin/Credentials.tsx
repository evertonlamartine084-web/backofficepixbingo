import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, KeyRound, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useCredentials } from '@/hooks/use-supabase-data';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAudit } from '@/hooks/use-audit';

export default function Credentials() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'bearer', value: '' });
  const { data: credentials, isLoading } = useCredentials();

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.value) throw new Error('Preencha nome e valor');
      const masked = form.value.length > 8
        ? `${form.value.slice(0, 4)}${'*'.repeat(form.value.length - 8)}${form.value.slice(-4)}`
        : '****';
      const { error } = await supabase.from('credentials').insert({
        name: form.name,
        type: form.type,
        value_encrypted: form.value,
        value_masked: masked,
      } as Record<string, unknown>);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      toast.success('Credencial criada');
      logAudit({ action: 'CRIAR', resource_type: 'credencial', resource_name: form.name });
      setOpen(false);
      setForm({ name: '', type: 'bearer', value: '' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const cred = credentials?.find(c => c.id === id);
      const { error } = await supabase.from('credentials').delete().eq('id', id);
      if (error) throw error;
      return cred;
    },
    onSuccess: (cred) => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      toast.success('Credencial excluída');
      logAudit({ action: 'EXCLUIR', resource_type: 'credencial', resource_name: cred?.name });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const items = credentials || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Credenciais</h1>
          <p className="text-sm text-muted-foreground mt-1">Tokens, cookies e API keys criptografados</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary border-0">
              <Plus className="w-4 h-4 mr-2" /> Nova Credencial
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-border sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground">Nova Credencial</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label className="text-foreground">Nome</Label>
                <Input
                  placeholder="Token Produção"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 bg-secondary border-border"
                />
              </div>
              <div>
                <Label className="text-foreground">Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="mt-1 bg-secondary border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="basic">Basic Auth</SelectItem>
                    <SelectItem value="apikey">API Key</SelectItem>
                    <SelectItem value="cookie">Cookie</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-foreground">Valor</Label>
                <Input
                  type="password"
                  placeholder="Token ou cookie value"
                  value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                  className="mt-1 bg-secondary border-border font-mono"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Será criptografado no banco</p>
              </div>
              <Button
                className="w-full gradient-primary border-0"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Salvando...' : 'Salvar Credencial'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground">Nenhuma credencial cadastrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((cred) => (
            <div key={cred.id} className="glass-card p-4 flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{cred.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="status-badge bg-secondary text-secondary-foreground">{cred.type}</span>
                  <span className="text-xs font-mono text-muted-foreground">{cred.value_masked}</span>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Criado: {new Date(cred.created_at).toLocaleString('pt-BR')}</p>
                <p>Atualizado: {new Date(cred.updated_at).toLocaleString('pt-BR')}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir"
                  onClick={() => { if (confirm('Excluir credencial?')) deleteMutation.mutate(cred.id); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
