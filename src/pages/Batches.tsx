import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Upload, Play, Pause, Search, Globe, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BatchStatusBadge } from '@/components/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useBatches, useFlows } from '@/hooks/use-supabase-data';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { BatchStatus } from '@/types';

export default function Batches() {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { data: batches, isLoading } = useBatches();
  const { data: flows } = useFlows();
  const queryClient = useQueryClient();

  // API fetch state
  const [siteUrl, setSiteUrl] = useState('https://pixbingobr.com');
  const [loginUrl, setLoginUrl] = useState('https://pixbingobr.com/api/auth/login');
  const [apiUsername, setApiUsername] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [batchName, setBatchName] = useState('');
  const [bonusValor, setBonusValor] = useState('0');
  const [selectedFlow, setSelectedFlow] = useState('');

  const filtered = (batches || []).filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleFetchPlayers = async () => {
    if (!apiUsername || !apiPassword || !batchName) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setLoading(true);
    try {
      const flow = flows?.find(f => f.id === selectedFlow);
      const { data, error } = await supabase.functions.invoke('fetch-players', {
        body: {
          site_url: siteUrl,
          login_url: loginUrl,
          username: apiUsername,
          password: apiPassword,
          batch_name: batchName,
          bonus_valor: parseFloat(bonusValor) || 0,
          flow_id: selectedFlow || null,
          flow_name: flow?.name || null,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`Lote criado com ${data.inserted_items} jogadores!`);
        queryClient.invalidateQueries({ queryKey: ['batches'] });
        setApiOpen(false);
        setApiUsername('');
        setApiPassword('');
        setBatchName('');
        setBonusValor('0');
        setSelectedFlow('');
      } else {
        const debugInfo = data.debug_responses 
          ? `\n\nRespostas:\n${data.debug_responses.map((d: any) => `${d.url}: ${d.status} → ${d.body}`).join('\n')}`
          : '';
        toast.error(`${data.error}${data.login_success === false ? ' (Login falhou)' : ''}`, { duration: 10000 });
        console.log('Debug fetch-players:', data);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao buscar jogadores da API');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lotes</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie lotes de crédito e verificação</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Buscar jogadores via API */}
          <Dialog open={apiOpen} onOpenChange={setApiOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-border">
                <Globe className="w-4 h-4 mr-2" /> Buscar da API
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-foreground">Buscar Jogadores via API</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Conecte-se ao site e importe todos os jogadores automaticamente em um novo lote.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label className="text-foreground">Nome do Lote *</Label>
                  <Input
                    placeholder="Ex: Jogadores PixBingo - Março 2026"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    className="mt-1 bg-secondary border-border"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-foreground">URL do Site</Label>
                    <Input
                      placeholder="https://pixbingobr.com"
                      value={siteUrl}
                      onChange={(e) => setSiteUrl(e.target.value)}
                      className="mt-1 bg-secondary border-border text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-foreground">URL de Login</Label>
                    <Input
                      placeholder="https://..."
                      value={loginUrl}
                      onChange={(e) => setLoginUrl(e.target.value)}
                      className="mt-1 bg-secondary border-border text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-foreground">Usuário *</Label>
                    <Input
                      placeholder="admin"
                      value={apiUsername}
                      onChange={(e) => setApiUsername(e.target.value)}
                      className="mt-1 bg-secondary border-border"
                    />
                  </div>
                  <div>
                    <Label className="text-foreground">Senha *</Label>
                    <Input
                      type="password"
                      placeholder="••••••"
                      value={apiPassword}
                      onChange={(e) => setApiPassword(e.target.value)}
                      className="mt-1 bg-secondary border-border"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-foreground">Fluxo</Label>
                    <Select value={selectedFlow} onValueChange={setSelectedFlow}>
                      <SelectTrigger className="mt-1 bg-secondary border-border">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {(flows || []).map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-foreground">Valor Bônus (R$)</Label>
                    <Input
                      type="number"
                      placeholder="10"
                      value={bonusValor}
                      onChange={(e) => setBonusValor(e.target.value)}
                      className="mt-1 bg-secondary border-border"
                    />
                  </div>
                </div>
                <Button
                  className="w-full gradient-primary border-0"
                  onClick={handleFetchPlayers}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Buscando jogadores...
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4 mr-2" /> Buscar e Criar Lote
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Criar lote manual */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary border-0">
                <Plus className="w-4 h-4 mr-2" /> Novo Lote
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-foreground">Criar Novo Lote</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Crie um lote manualmente informando CPFs ou fazendo upload de arquivo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label className="text-foreground">Nome do Lote</Label>
                  <Input placeholder="Ex: Campanha Março 2026" className="mt-1 bg-secondary border-border" />
                </div>
                <div>
                  <Label className="text-foreground">Fluxo</Label>
                  <Select>
                    <SelectTrigger className="mt-1 bg-secondary border-border">
                      <SelectValue placeholder="Selecione o fluxo" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {(flows || []).map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-foreground">Valor do Bônus (R$)</Label>
                  <Input type="number" placeholder="10" className="mt-1 bg-secondary border-border" />
                </div>
                <div>
                  <Label className="text-foreground">Lista de CPFs/UUIDs</Label>
                  <Textarea
                    placeholder="Cole CPFs ou UUIDs (um por linha) ou faça upload de CSV"
                    className="mt-1 bg-secondary border-border min-h-[120px] font-mono text-xs"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="flex-1 border-border">
                    <Upload className="w-4 h-4 mr-2" /> Upload CSV/XLSX
                  </Button>
                </div>
                <Button className="w-full gradient-primary border-0" onClick={() => setOpen(false)}>
                  Criar e Iniciar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar lote..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground">Nenhum lote encontrado.</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome</th>
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fluxo</th>
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valor</th>
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Progresso</th>
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stats</th>
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const stats = b.stats as any;
                return (
                  <tr key={b.id} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                    <td className="p-4">
                      <Link to={`/batches/${b.id}`} className="text-foreground hover:text-primary font-medium">
                        {b.name}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(b.created_at).toLocaleString('pt-BR')}</p>
                    </td>
                    <td className="p-4 text-muted-foreground">{b.flow_name || '—'}</td>
                    <td className="p-4 text-foreground font-mono">R$ {b.bonus_valor}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full gradient-primary rounded-full" style={{ width: `${b.total_items > 0 ? (b.processed / b.total_items) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{b.total_items > 0 ? Math.round((b.processed / b.total_items) * 100) : 0}%</span>
                      </div>
                    </td>
                    <td className="p-4"><BatchStatusBadge status={b.status as BatchStatus} /></td>
                    <td className="p-4">
                      <div className="flex gap-1.5 text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-success/15 text-success">{stats.bonus_1x} 1x</span>
                        {stats.bonus_2x_plus > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-semibold">{stats.bonus_2x_plus} 2x+</span>
                        )}
                        {stats.erro > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-warning/15 text-warning">{stats.erro} err</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        {b.status === 'EM_ANDAMENTO' ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Pause className="w-3.5 h-3.5" /></Button>
                        ) : b.status !== 'CONCLUIDO' ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Play className="w-3.5 h-3.5" /></Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
