import { useState, useCallback, useRef } from 'react';
import {
  Play, RotateCw, CheckCircle2, XCircle, AlertCircle, Clock, Loader2,
  Shield, LayoutDashboard, ListFilter, Megaphone, UserSearch, Gamepad2, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type TestStatus = 'idle' | 'running' | 'passed' | 'failed' | 'blocked';

interface TestCase {
  id: string;
  name: string;
  group: string;
  description: string;
  run: () => Promise<{ passed: boolean; details: string }>;
}

interface TestResult {
  status: TestStatus;
  details: string;
  durationMs: number;
}

const STATUS_CONFIG: Record<TestStatus, { icon: typeof CheckCircle2; color: string; label: string }> = {
  idle: { icon: Clock, color: 'text-muted-foreground', label: 'Pendente' },
  running: { icon: Loader2, color: 'text-blue-400', label: 'Executando' },
  passed: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Passou' },
  failed: { icon: XCircle, color: 'text-red-400', label: 'Falhou' },
  blocked: { icon: AlertCircle, color: 'text-amber-400', label: 'Bloqueado' },
};

const GROUP_ICONS: Record<string, typeof Shield> = {
  'Autenticacao': Shield,
  'Dashboard': LayoutDashboard,
  'Segmentos': ListFilter,
  'Campanhas': Megaphone,
  'Jogadores': UserSearch,
  'Gamificacao': Gamepad2,
  'Admin': ShieldCheck,
};

function buildTests(session: { user: { email?: string } } | null): TestCase[] {
  return [
    // Auth
    {
      id: 'auth-session',
      name: 'Sessao ativa',
      group: 'Autenticacao',
      description: 'Verifica se existe uma sessao autenticada no Supabase',
      run: async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session) return { passed: true, details: `Logado como ${data.session.user.email}` };
        return { passed: false, details: 'Nenhuma sessao encontrada' };
      },
    },
    {
      id: 'auth-refresh',
      name: 'Refresh de token',
      group: 'Autenticacao',
      description: 'Testa se o token de sessao pode ser renovado',
      run: async () => {
        const { data, error } = await supabase.auth.refreshSession();
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        if (data.session) return { passed: true, details: `Token renovado, expira em ${new Date(data.session.expires_at! * 1000).toLocaleTimeString('pt-BR')}` };
        return { passed: false, details: 'Nenhuma sessao retornada' };
      },
    },
    {
      id: 'auth-user-meta',
      name: 'Metadados do usuario',
      group: 'Autenticacao',
      description: 'Verifica se o usuario possui metadados (role)',
      run: async () => {
        const { data } = await supabase.auth.getUser();
        const meta = data.user?.user_metadata;
        if (meta?.role) return { passed: true, details: `Role: ${meta.role}` };
        return { passed: true, details: `Usuario sem role definida nos metadados (user_metadata)` };
      },
    },
    // Dashboard
    {
      id: 'db-segments-read',
      name: 'Leitura de segmentos',
      group: 'Dashboard',
      description: 'Testa SELECT na tabela segments',
      run: async () => {
        const { data, error, count } = await supabase.from('segments').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} segmentos encontrados` };
      },
    },
    {
      id: 'db-campaigns-read',
      name: 'Leitura de campanhas',
      group: 'Dashboard',
      description: 'Testa SELECT na tabela campaigns',
      run: async () => {
        const { error, count } = await supabase.from('campaigns').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} campanhas encontradas` };
      },
    },
    {
      id: 'db-batches-read',
      name: 'Leitura de lotes (bonus)',
      group: 'Dashboard',
      description: 'Testa SELECT na tabela batches',
      run: async () => {
        const { error, count } = await supabase.from('batches').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} lotes encontrados` };
      },
    },
    {
      id: 'db-popups-read',
      name: 'Leitura de popups',
      group: 'Dashboard',
      description: 'Testa SELECT na tabela popups',
      run: async () => {
        const { error, count } = await supabase.from('popups').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} popups encontrados` };
      },
    },
    // Segments
    {
      id: 'seg-create-delete',
      name: 'Criar e deletar segmento',
      group: 'Segmentos',
      description: 'Cria um segmento de teste e depois remove',
      run: async () => {
        const testName = `__healthcheck_${Date.now()}`;
        const { data, error: insertErr } = await supabase.from('segments')
          .insert({ name: testName, description: 'Teste automatico', segment_type: 'manual', color: '#dc2626', icon: 'shield' })
          .select().single();
        if (insertErr) return { passed: false, details: `Erro ao criar: ${insertErr.message}` };
        const { error: deleteErr } = await supabase.from('segments').delete().eq('id', data.id);
        if (deleteErr) return { passed: false, details: `Criou mas falhou ao deletar: ${deleteErr.message}` };
        return { passed: true, details: `Segmento criado (${data.id}) e deletado com sucesso` };
      },
    },
    {
      id: 'seg-rules-create',
      name: 'Criar segmento com regras',
      group: 'Segmentos',
      description: 'Cria um segmento automatico com regras e verifica persistencia do valor',
      run: async () => {
        const testName = `__healthcheck_rules_${Date.now()}`;
        const rules = [{ id: 'test1', field: 'level', operator: 'gte', value: '10' }];
        const { data, error: insertErr } = await supabase.from('segments')
          .insert({ name: testName, segment_type: 'automatic', rules, match_type: 'all', color: '#2563eb', icon: 'zap' })
          .select().single();
        if (insertErr) return { passed: false, details: `Erro ao criar: ${insertErr.message}` };
        // Read back and verify
        const { data: readBack, error: readErr } = await supabase.from('segments').select('rules').eq('id', data.id).single();
        const { error: deleteErr } = await supabase.from('segments').delete().eq('id', data.id);
        if (readErr) return { passed: false, details: `Erro ao ler: ${readErr.message}` };
        if (deleteErr) return { passed: false, details: `Erro ao deletar: ${deleteErr.message}` };
        const savedRules = readBack?.rules as { value: string }[] | null;
        if (!savedRules || savedRules.length === 0) return { passed: false, details: 'Regras nao foram salvas' };
        if (savedRules[0].value !== '10') return { passed: false, details: `Valor esperado: "10", recebido: "${savedRules[0].value}"` };
        return { passed: true, details: 'Regra criada com value="10" e lida corretamente do banco' };
      },
    },
    {
      id: 'seg-update-rules',
      name: 'Editar regras do segmento',
      group: 'Segmentos',
      description: 'Cria segmento, edita as regras e verifica se o novo valor persiste',
      run: async () => {
        const testName = `__healthcheck_edit_${Date.now()}`;
        const rules = [{ id: 'r1', field: 'level', operator: 'gte', value: '5' }];
        const { data, error: insertErr } = await supabase.from('segments')
          .insert({ name: testName, segment_type: 'automatic', rules, match_type: 'all', color: '#059669', icon: 'star' })
          .select().single();
        if (insertErr) return { passed: false, details: `Erro ao criar: ${insertErr.message}` };
        const newRules = [{ id: 'r1', field: 'level', operator: 'gte', value: '25' }];
        const { error: updateErr } = await supabase.from('segments').update({ rules: newRules }).eq('id', data.id);
        if (updateErr) { await supabase.from('segments').delete().eq('id', data.id); return { passed: false, details: `Erro ao editar: ${updateErr.message}` }; }
        const { data: readBack } = await supabase.from('segments').select('rules').eq('id', data.id).single();
        await supabase.from('segments').delete().eq('id', data.id);
        const saved = readBack?.rules as { value: string }[] | null;
        if (!saved || saved[0]?.value !== '25') return { passed: false, details: `Valor esperado: "25", recebido: "${saved?.[0]?.value}"` };
        return { passed: true, details: 'Regra atualizada de value="5" para value="25" com sucesso' };
      },
    },
    // Campaigns
    {
      id: 'camp-read',
      name: 'Listar campanhas',
      group: 'Campanhas',
      description: 'Verifica leitura da tabela campaigns com joins',
      run: async () => {
        const { data, error } = await supabase.from('campaigns')
          .select('id, name, status, segment:segments(name)')
          .limit(5);
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${data.length} campanhas carregadas${data.length > 0 ? ` (ex: "${data[0].name}")` : ''}` };
      },
    },
    // Player
    {
      id: 'player-wallets',
      name: 'Tabela player_wallets acessivel',
      group: 'Jogadores',
      description: 'Testa acesso a tabela player_wallets usada pelos segmentos',
      run: async () => {
        const { error, count } = await supabase.from('player_wallets').select('cpf', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} jogadores na tabela` };
      },
    },
    {
      id: 'player-proxy',
      name: 'Edge function pixbingo-proxy',
      group: 'Jogadores',
      description: 'Verifica se a edge function de proxy responde',
      run: async () => {
        try {
          const { error } = await supabase.functions.invoke('pixbingo-proxy', {
            body: { method: 'GET', path: '/health' },
          });
          if (error) return { passed: false, details: `Erro: ${error.message}` };
          return { passed: true, details: 'Edge function respondeu' };
        } catch (e) {
          return { passed: false, details: `Exception: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },
    // Gamification
    {
      id: 'gam-achievements',
      name: 'Tabela achievements',
      group: 'Gamificacao',
      description: 'Testa leitura da tabela achievements',
      run: async () => {
        const { error, count } = await supabase.from('achievements').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} conquistas` };
      },
    },
    {
      id: 'gam-missions',
      name: 'Tabela missions',
      group: 'Gamificacao',
      description: 'Testa leitura da tabela missions',
      run: async () => {
        const { error, count } = await supabase.from('missions').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} missoes` };
      },
    },
    {
      id: 'gam-tournaments',
      name: 'Tabela tournaments',
      group: 'Gamificacao',
      description: 'Testa leitura da tabela tournaments',
      run: async () => {
        const { error, count } = await supabase.from('tournaments').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} torneios` };
      },
    },
    // Admin
    {
      id: 'admin-users',
      name: 'Edge function manage-users',
      group: 'Admin',
      description: 'Verifica se a edge function de gestao de usuarios responde',
      run: async () => {
        try {
          const { data, error } = await supabase.functions.invoke('manage-users', {
            body: { action: 'list' },
          });
          if (error) return { passed: false, details: `Erro: ${error.message}` };
          const users = Array.isArray(data?.users) ? data.users : [];
          return { passed: true, details: `${users.length} usuarios retornados` };
        } catch (e) {
          return { passed: false, details: `Exception: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },
    {
      id: 'admin-audit',
      name: 'Tabela audit_log',
      group: 'Admin',
      description: 'Testa leitura do log de auditoria',
      run: async () => {
        const { error, count } = await supabase.from('audit_log').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} entradas no log` };
      },
    },
    {
      id: 'admin-platform',
      name: 'Tabela platform_config',
      group: 'Admin',
      description: 'Testa leitura da configuracao da plataforma',
      run: async () => {
        const { data, error } = await supabase.from('platform_config').select('key, value').limit(5);
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${data.length} configs carregadas` };
      },
    },
  ];
}

export default function HealthCheck() {
  const { session } = useAuth();
  const tests = buildTests(session);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  const groups = [...new Set(tests.map(t => t.group))];

  const runSingleTest = useCallback(async (test: TestCase) => {
    setResults(prev => ({ ...prev, [test.id]: { status: 'running', details: '', durationMs: 0 } }));
    const start = performance.now();
    try {
      const result = await test.run();
      const durationMs = Math.round(performance.now() - start);
      setResults(prev => ({
        ...prev,
        [test.id]: { status: result.passed ? 'passed' : 'failed', details: result.details, durationMs },
      }));
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      setResults(prev => ({
        ...prev,
        [test.id]: { status: 'failed', details: `Exception: ${err instanceof Error ? err.message : String(err)}`, durationMs },
      }));
    }
  }, []);

  const runAll = useCallback(async () => {
    cancelRef.current = false;
    setRunning(true);
    setResults({});
    for (const test of tests) {
      if (cancelRef.current) break;
      await runSingleTest(test);
    }
    setRunning(false);
  }, [tests, runSingleTest]);

  const stopAll = () => { cancelRef.current = true; };

  const totalRun = Object.keys(results).length;
  const passed = Object.values(results).filter(r => r.status === 'passed').length;
  const failed = Object.values(results).filter(r => r.status === 'failed').length;
  const blocked = Object.values(results).filter(r => r.status === 'blocked').length;
  const progressPct = tests.length > 0 ? (totalRun / tests.length) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Health Check</h1>
          <p className="text-sm text-muted-foreground mt-1">Testes automatizados do sistema — similar ao TestSprite</p>
        </div>
        <div className="flex gap-2">
          {running ? (
            <Button variant="destructive" size="sm" onClick={stopAll}>
              <XCircle className="w-4 h-4 mr-1.5" /> Parar
            </Button>
          ) : (
            <Button className="gradient-primary border-0" size="sm" onClick={runAll}>
              <Play className="w-4 h-4 mr-1.5" /> Executar Todos
            </Button>
          )}
          {!running && totalRun > 0 && (
            <Button variant="outline" size="sm" onClick={runAll}>
              <RotateCw className="w-4 h-4 mr-1.5" /> Re-executar
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-secondary/50 border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{tests.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{passed}</p>
            <p className="text-xs text-emerald-400/70">Passou</p>
          </CardContent>
        </Card>
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{failed}</p>
            <p className="text-xs text-red-400/70">Falhou</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{blocked}</p>
            <p className="text-xs text-amber-400/70">Bloqueado</p>
          </CardContent>
        </Card>
        <Card className="bg-secondary/50 border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">
              {totalRun > 0 ? `${Math.round((passed / totalRun) * 100)}%` : '-'}
            </p>
            <p className="text-xs text-muted-foreground">Taxa de Sucesso</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      {running && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progresso</span>
            <span>{totalRun}/{tests.length}</span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>
      )}

      {/* Test Groups */}
      {groups.map(group => {
        const groupTests = tests.filter(t => t.group === group);
        const GroupIcon = GROUP_ICONS[group] || Shield;
        const groupPassed = groupTests.filter(t => results[t.id]?.status === 'passed').length;
        const groupFailed = groupTests.filter(t => results[t.id]?.status === 'failed').length;
        const groupDone = groupTests.filter(t => results[t.id] && results[t.id].status !== 'running').length;

        return (
          <Card key={group} className="border-border bg-card/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <GroupIcon className="w-4 h-4 text-primary" />
                  {group}
                  <Badge variant="outline" className="text-[10px] ml-1">
                    {groupTests.length} testes
                  </Badge>
                </CardTitle>
                {groupDone > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    {groupPassed > 0 && <span className="text-emerald-400">{groupPassed} ok</span>}
                    {groupFailed > 0 && <span className="text-red-400">{groupFailed} falha</span>}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              {groupTests.map(test => {
                const result = results[test.id];
                const status = result?.status ?? 'idle';
                const cfg = STATUS_CONFIG[status];
                const StatusIcon = cfg.icon;

                return (
                  <div
                    key={test.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                      status === 'passed' && 'bg-emerald-500/5 border-emerald-500/10',
                      status === 'failed' && 'bg-red-500/5 border-red-500/10',
                      status === 'running' && 'bg-blue-500/5 border-blue-500/10',
                      status === 'idle' && 'bg-secondary/30 border-border',
                      status === 'blocked' && 'bg-amber-500/5 border-amber-500/10',
                    )}
                  >
                    <StatusIcon className={cn('w-4 h-4 flex-shrink-0', cfg.color, status === 'running' && 'animate-spin')} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{test.name}</span>
                        {result?.durationMs ? (
                          <span className="text-[10px] text-muted-foreground font-mono">{result.durationMs}ms</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{test.description}</p>
                      {result?.details && (
                        <p className={cn('text-xs mt-1 font-mono', status === 'passed' ? 'text-emerald-400/80' : status === 'failed' ? 'text-red-400/80' : 'text-muted-foreground')}>
                          {result.details}
                        </p>
                      )}
                    </div>
                    {!running && status === 'idle' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => runSingleTest(test)}>
                        <Play className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
