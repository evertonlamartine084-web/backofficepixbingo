/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Settings, Eye, EyeOff, RefreshCw, CheckCircle2, XCircle, Clock, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const VERCEL_URL = 'https://backofficepixbingobr.vercel.app';

export default function PlatformConfig() {
  const qc = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['platform_config'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('platform_config')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data as any;
    },
  });

  const [form, setForm] = useState<any>(null);
  const activeForm = form ?? config;

  const upsertMutation = useMutation({
    mutationFn: async (values: any) => {
      if (config?.id) {
        const { error } = await (supabase as any)
          .from('platform_config')
          .update({
            site_url: values.site_url,
            login_url: values.login_url || null,
            username: values.username,
            password: values.password,
            active: values.active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('platform_config')
          .insert({
            site_url: values.site_url,
            username: values.username,
            password: values.password,
            login_url: values.login_url || null,
            active: values.active ?? true,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Configuração salva!');
      qc.invalidateQueries({ queryKey: ['platform_config'] });
      setForm(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!activeForm?.site_url || !activeForm?.username || !activeForm?.password) {
      toast.error('Preencha URL, usuário e senha');
      return;
    }
    upsertMutation.mutate(activeForm);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${VERCEL_URL}/api/sync-tournament-scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.logs) console.log('Sync logs:', data.logs);
      if (data.success) {
        toast.success(`Sync concluído! ${data.updated} scores atualizados`);
        qc.invalidateQueries({ queryKey: ['platform_config'] });
      } else {
        const logMsg = data.logs?.length ? `\n${data.logs.join('\n')}` : '';
        toast.error(`${data.error || 'Erro no sync'}${logMsg}`, { duration: 10000 });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setForm((prev: any) => ({ ...(prev ?? config ?? {}), [field]: value }));
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" /> Configuração da Plataforma
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Credenciais para sincronização automática de torneios
          </p>
        </div>
        <Button
          onClick={handleSync}
          disabled={syncing || !config?.active}
          variant="outline"
          className="border-border"
        >
          {syncing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          {syncing ? 'Sincronizando...' : 'Sync Manual'}
        </Button>
      </div>

      {/* Status card */}
      {config && (
        <Card className="glass-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                {config.active
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : <XCircle className="w-4 h-4 text-red-400" />}
                <span className={config.active ? 'text-emerald-400' : 'text-red-400'}>
                  {config.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                Último sync: {config.last_sync_at
                  ? new Date(config.last_sync_at).toLocaleString('pt-BR')
                  : 'Nunca'}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Config form */}
      <Card className="glass-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Credenciais da Plataforma</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>URL do Site</Label>
              <Input
                value={activeForm?.site_url || ''}
                onChange={e => updateField('site_url', e.target.value)}
                placeholder="https://pixbingobr.concurso.club"
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>URL de Login (opcional)</Label>
              <Input
                value={activeForm?.login_url || ''}
                onChange={e => updateField('login_url', e.target.value)}
                placeholder="Deixe vazio para usar /login"
                className="bg-secondary border-border"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Usuário (admin)</Label>
              <Input
                value={activeForm?.username || ''}
                onChange={e => updateField('username', e.target.value)}
                placeholder="admin"
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={activeForm?.password || ''}
                  onChange={e => updateField('password', e.target.value)}
                  placeholder="••••••••"
                  className="bg-secondary border-border pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Switch
              checked={activeForm?.active ?? true}
              onCheckedChange={v => updateField('active', v)}
            />
            <Label>Sync automático ativo</Label>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={upsertMutation.isPending}
              className="gradient-primary border-0"
            >
              {upsertMutation.isPending ? 'Salvando...' : 'Salvar Configuração'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <Card className="glass-card border-border">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Como funciona o Sync de Torneios</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="font-semibold text-foreground mb-1">1. Login Automático</p>
              <p className="text-xs text-muted-foreground">O sistema faz login na plataforma com as credenciais salvas acima.</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="font-semibold text-foreground mb-1">2. Busca Transações</p>
              <p className="text-xs text-muted-foreground">Para cada jogador inscrito em torneios ativos, busca as transações no período do torneio.</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="font-semibold text-foreground mb-1">3. Calcula Pontos</p>
              <p className="text-xs text-muted-foreground">Calcula o score baseado na métrica (apostas, ganhos, depósitos, GGR) e atualiza o ranking.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
