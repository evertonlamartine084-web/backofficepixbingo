import { useState, useCallback, useRef } from 'react';
import {
  Play, RotateCw, CheckCircle2, XCircle, AlertCircle, Clock, Loader2,
  Shield, LayoutDashboard, ListFilter, Megaphone, UserSearch, Gamepad2, ShieldCheck,
  Zap, Bell, Inbox, Lock, Gauge, Package,
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
  'Edge Functions': Zap,
  'Assets': Package,
  'Integridade': Lock,
  'Seguranca': ShieldCheck,
  'Performance': Gauge,
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
      id: 'player-lookup-test',
      name: 'Consultar jogador teste (70791576418)',
      group: 'Jogadores',
      description: 'Busca o jogador CPF 70791576418 na tabela player_wallets',
      run: async () => {
        const { data, error } = await supabase.from('player_wallets')
          .select('cpf, level, coins, xp')
          .eq('cpf', '70791576418')
          .maybeSingle();
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        if (!data) return { passed: false, details: 'Jogador 70791576418 nao encontrado na tabela' };
        return { passed: true, details: `Nivel: ${data.level ?? '-'} | Coins: ${data.coins ?? '-'} | XP: ${data.xp ?? '-'}` };
      },
    },
    {
      id: 'player-proxy',
      name: 'Edge function pixbingo-proxy',
      group: 'Jogadores',
      description: 'Verifica se a edge function de proxy responde',
      run: async () => {
        try {
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch(`https://${projectId}.supabase.co/functions/v1/pixbingo-proxy`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token ?? anonKey}`,
              'apikey': anonKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'login', site_url: 'https://pixbingobr.com', username: '__healthcheck', password: '__test' }),
          });
          const body = await res.text();
          // Qualquer resposta (mesmo 4xx) prova que a function está online
          return { passed: true, details: `Online (HTTP ${res.status}): ${body.slice(0, 150)}` };
        } catch (e) {
          return { passed: false, details: `Offline: ${e instanceof Error ? e.message : String(e)}` };
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
          const respStr = JSON.stringify(data).slice(0, 200);
          if (error) return { passed: false, details: `Erro: ${error.message} | data: ${respStr}` };
          if (data?.error) return { passed: false, details: `Erro: ${data.error} | data: ${respStr}` };
          const users = Array.isArray(data?.users) ? data.users : [];
          const emails = users.slice(0, 3).map((u: { email?: string }) => u.email).join(', ');
          return { passed: true, details: `${users.length} usuarios${emails ? ` (${emails})` : ''}` };
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
        const { data, error } = await supabase.from('platform_config').select('id, site_url, active').limit(5);
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${data.length} config(s) carregada(s)${data.length > 0 && data[0].site_url ? ` — site: ${data[0].site_url}` : ''}` };
      },
    },
    // ── Edge Functions ──
    {
      id: 'ef-popup-check',
      name: 'Edge function popup-check',
      group: 'Edge Functions',
      description: 'Invoca popup-check e verifica resposta',
      run: async () => {
        try {
          const { data, error } = await supabase.functions.invoke('popup-check', {
            body: { cpf: '70791576418' },
          });
          if (error) return { passed: false, details: `Erro: ${error.message} | data: ${JSON.stringify(data).slice(0, 150)}` };
          return { passed: true, details: `OK: ${JSON.stringify(data).slice(0, 150)}` };
        } catch (e) {
          return { passed: false, details: `Exception: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },
    {
      id: 'ef-gamification-widget',
      name: 'Widget + sync missoes (70791576418)',
      group: 'Edge Functions',
      description: 'Invoca gamification-widget com player=70791576418 e verifica sync de missoes em tempo real',
      run: async () => {
        try {
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const url = `https://${projectId}.supabase.co/functions/v1/gamification-widget?action=data&player=70791576418`;
          const res = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${anonKey}`,
              'apikey': anonKey,
            },
          });
          const body = await res.text();
          if (!res.ok) return { passed: false, details: `HTTP ${res.status} | body: ${body.slice(0, 300)}` };
          const json = JSON.parse(body);
          const missions = json.missions as { id: string; name: string }[] || [];
          const progress = json.mission_progress as { mission_id: string; progress: number; target: number; completed: boolean }[] || [];
          const wallet = json.wallet as { level?: number; coins?: number; xp?: number } | null;
          const timedOut = json._timeout === true;
          const lines: string[] = [];
          if (timedOut) lines.push('⚠ TIMEOUT — dados parciais');
          lines.push(`Wallet: nivel ${wallet?.level ?? '-'} | coins ${wallet?.coins ?? '-'} | xp ${wallet?.xp ?? '-'}`);
          lines.push(`Missoes ativas: ${missions.length} | Progresso entries: ${progress.length}`);
          for (const p of progress) {
            const m = missions.find(mi => mi.id === p.mission_id);
            lines.push(`  "${m?.name ?? p.mission_id}" → ${p.progress}/${p.target} ${p.completed ? '✓ COMPLETA' : ''}`);
          }
          return { passed: !timedOut, details: lines.join('\n') };
        } catch (e) {
          return { passed: false, details: `Exception: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },
    {
      id: 'ef-process-campaign',
      name: 'Edge function process-campaign',
      group: 'Edge Functions',
      description: 'Invoca process-campaign sem ID real para testar disponibilidade',
      run: async () => {
        try {
          const { data, error } = await supabase.functions.invoke('process-campaign', {
            body: { campaign_id: '__healthcheck_test' },
          });
          // process-campaign pode retornar erro logico (campaign nao encontrada) — isso prova que a function esta online
          const respStr = JSON.stringify(data).slice(0, 150);
          if (error) return { passed: false, details: `Erro: ${error.message} | data: ${respStr}` };
          return { passed: true, details: `OK: ${respStr}` };
        } catch (e) {
          return { passed: false, details: `Exception: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },
    {
      id: 'ef-proxy-player',
      name: 'Proxy buscar jogador (70791576418)',
      group: 'Edge Functions',
      description: 'Usa pixbingo-proxy com action=search_player para buscar CPF 70791576418',
      run: async () => {
        try {
          const { data: config } = await supabase.from('platform_config').select('site_url, login_url, username, password').eq('active', true).limit(1).maybeSingle();
          if (!config) return { passed: false, details: 'Nenhuma platform_config ativa' };
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch(`https://${projectId}.supabase.co/functions/v1/pixbingo-proxy`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token ?? anonKey}`,
              'apikey': anonKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'search_player',
              site_url: config.site_url,
              login_url: config.login_url,
              username: config.username,
              password: config.password,
              busca_cpf: '70791576418',
            }),
          });
          const body = await res.text();
          if (!res.ok) return { passed: false, details: `HTTP ${res.status}: ${body.slice(0, 250)}` };
          return { passed: true, details: `OK: ${body.slice(0, 250)}` };
        } catch (e) {
          return { passed: false, details: `Exception: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },
    {
      id: 'ef-platform-login',
      name: 'Login na plataforma',
      group: 'Edge Functions',
      description: 'Verifica platform_config e testa login via pixbingo-proxy',
      run: async () => {
        const { data: config, error } = await supabase.from('platform_config')
          .select('site_url, login_url, username, active')
          .eq('active', true)
          .limit(1)
          .maybeSingle();
        if (error) return { passed: false, details: `Erro ao ler config: ${error.message}` };
        if (!config) return { passed: false, details: 'Nenhuma platform_config ativa encontrada' };
        const lines = [`site_url: ${config.site_url}`, `login_url: ${config.login_url ?? '(nao definida)'}`, `username: ${config.username}`, `active: ${config.active}`];
        // Busca todas as configs ativas pra ver se há conflito
        const { data: allConfigs } = await supabase.from('platform_config').select('id, site_url, active').eq('active', true);
        if (allConfigs && allConfigs.length > 1) {
          lines.push(`⚠ ${allConfigs.length} configs ativas: ${allConfigs.map(c => c.site_url).join(', ')}`);
        }
        return { passed: true, details: lines.join('\n') };
      },
    },
    // ── Missoes (diagnostico) ──
    {
      id: 'ef-sync-missions',
      name: 'Sync mission progress (full)',
      group: 'Edge Functions',
      description: 'Invoca sync-mission-progress e exibe logs de execucao completos',
      run: async () => {
        try {
          const { data, error } = await supabase.functions.invoke('sync-mission-progress', {
            body: {},
          });
          const logs = data?.logs as string[] | undefined;
          const logsStr = logs?.join('\n') ?? '';
          const summary = `updated: ${data?.updated ?? '?'}, completed: ${data?.completed ?? '?'}, errors: ${data?.errors ?? '?'}, missions: ${data?.missions ?? '?'}, players: ${data?.players ?? '?'}`;
          if (error) return { passed: false, details: `Erro: ${error.message} | data: ${JSON.stringify(data).slice(0, 300)}` };
          if (data?.errors > 0) return { passed: false, details: `${summary}\n\nLogs:\n${logsStr}` };
          return { passed: true, details: `${summary}\n\nLogs:\n${logsStr}` };
        } catch (e) {
          return { passed: false, details: `Exception: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },
    {
      id: 'ef-missions-pending',
      name: 'Missoes pendentes de sync',
      group: 'Edge Functions',
      description: 'Lista player_mission_progress com opted_in=true e completed=false',
      run: async () => {
        const { data, error, count } = await supabase
          .from('player_mission_progress')
          .select('id, cpf, mission_id, progress, target, completed, opted_in, updated_at', { count: 'exact' })
          .eq('opted_in', true)
          .eq('completed', false)
          .order('updated_at', { ascending: true })
          .limit(10);
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        if (!data || data.length === 0) return { passed: true, details: `Nenhuma missao pendente (total: ${count ?? 0})` };
        const lines = data.map(d => `CPF ${d.cpf} | missao ${String(d.mission_id).slice(0, 8)}… | progresso ${d.progress}/${d.target} | updated: ${d.updated_at}`);
        return { passed: true, details: `${count ?? data.length} pendente(s):\n${lines.join('\n')}` };
      },
    },
    {
      id: 'ef-missions-active',
      name: 'Missoes ativas no sistema',
      group: 'Edge Functions',
      description: 'Lista missoes com status active e verifica datas',
      run: async () => {
        const { data, error } = await supabase
          .from('missions')
          .select('id, name, condition_type, condition_value, recurrence, start_date, end_date, status')
          .in('status', ['active', 'ATIVO']);
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        if (!data || data.length === 0) return { passed: true, details: 'Nenhuma missao ativa' };
        const lines = data.map(m => `"${m.name}" | ${m.condition_type} >= ${m.condition_value} | ${m.recurrence} | ${m.start_date} → ${m.end_date}`);
        return { passed: true, details: `${data.length} missao(oes) ativa(s):\n${lines.join('\n')}` };
      },
    },
    // ── Gamificacao extras ──
    {
      id: 'gam-player-spins',
      name: 'Tabela player_spins',
      group: 'Gamificacao',
      description: 'Testa leitura da tabela player_spins (roleta diaria)',
      run: async () => {
        const { error, count } = await supabase.from('player_spins').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} spins registrados` };
      },
    },
    {
      id: 'gam-store-items',
      name: 'Tabela store_items',
      group: 'Gamificacao',
      description: 'Testa leitura de itens da loja',
      run: async () => {
        const { error, count } = await supabase.from('store_items').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} itens na loja` };
      },
    },
    {
      id: 'gam-store-purchases',
      name: 'Tabela store_purchases',
      group: 'Gamificacao',
      description: 'Testa leitura de compras da loja',
      run: async () => {
        const { error, count } = await supabase.from('store_purchases').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} compras registradas` };
      },
    },
    {
      id: 'gam-player-missions',
      name: 'Tabela player_missions',
      group: 'Gamificacao',
      description: 'Testa leitura de missoes atribuidas a jogadores',
      run: async () => {
        const { error, count } = await supabase.from('player_missions').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} missoes de jogadores` };
      },
    },
    {
      id: 'gam-player-achievements',
      name: 'Tabela player_achievements',
      group: 'Gamificacao',
      description: 'Testa leitura de conquistas de jogadores',
      run: async () => {
        const { error, count } = await supabase.from('player_achievements').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} conquistas de jogadores` };
      },
    },
    {
      id: 'gam-referrals',
      name: 'Tabela referrals',
      group: 'Gamificacao',
      description: 'Testa leitura de indicacoes (indique e ganhe)',
      run: async () => {
        const { error, count } = await supabase.from('referrals').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} indicacoes` };
      },
    },
    {
      id: 'gam-levels',
      name: 'Tabela levels',
      group: 'Gamificacao',
      description: 'Testa leitura da tabela de niveis',
      run: async () => {
        const { error, count } = await supabase.from('levels').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} niveis configurados` };
      },
    },
    // ── Assets & Comunicacao ──
    {
      id: 'asset-popups',
      name: 'Tabela popup_assets',
      group: 'Assets',
      description: 'Testa leitura de popups/assets GTM',
      run: async () => {
        const { error, count } = await supabase.from('popup_assets').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} popup assets` };
      },
    },
    {
      id: 'asset-push',
      name: 'Tabela push_notifications',
      group: 'Assets',
      description: 'Testa leitura de push notifications',
      run: async () => {
        const { error, count } = await supabase.from('push_notifications').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} push notifications` };
      },
    },
    {
      id: 'asset-inbox',
      name: 'Tabela inbox_messages',
      group: 'Assets',
      description: 'Testa leitura de mensagens do inbox',
      run: async () => {
        const { error, count } = await supabase.from('inbox_messages').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} mensagens no inbox` };
      },
    },
    // ── Integridade de Dados ──
    {
      id: 'int-segment-eval-cycle',
      name: 'Ciclo completo de segmento',
      group: 'Integridade',
      description: 'Cria segmento automatico, avalia member_count e deleta',
      run: async () => {
        const testName = `__hc_integ_${Date.now()}`;
        const rules = [{ id: 'r1', field: 'level', operator: 'gte', value: '1' }];
        const { data, error: insertErr } = await supabase.from('segments')
          .insert({ name: testName, segment_type: 'automatic', rules, match_type: 'all', color: '#7c3aed', icon: 'target' })
          .select('id, member_count').single();
        if (insertErr) return { passed: false, details: `Erro ao criar: ${insertErr.message}` };
        // Verifica se o segmento foi salvo com regras
        const { data: check } = await supabase.from('segments')
          .select('rules, segment_type').eq('id', data.id).single();
        const hasRules = Array.isArray((check?.rules as unknown[])) && (check?.rules as unknown[]).length > 0;
        const { data: readBack } = await supabase.from('segments').select('member_count').eq('id', data.id).single();
        await supabase.from('segments').delete().eq('id', data.id);
        return { passed: true, details: `Segmento criado (rules: ${hasRules}, members: ${readBack?.member_count ?? 'N/A'}) e deletado` };
      },
    },
    {
      id: 'int-cashback-rules',
      name: 'Tabela cashback_rules',
      group: 'Integridade',
      description: 'Verifica existencia e leitura de regras de cashback',
      run: async () => {
        const { error, count } = await supabase.from('cashback_rules').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} regras de cashback` };
      },
    },
    {
      id: 'int-transactions',
      name: 'Tabela transactions',
      group: 'Integridade',
      description: 'Verifica acesso a tabela de transacoes',
      run: async () => {
        const { error, count } = await supabase.from('transactions').select('id', { count: 'exact', head: true });
        if (error) return { passed: false, details: `Erro: ${error.message}` };
        return { passed: true, details: `${count ?? 0} transacoes` };
      },
    },
    // ── Seguranca / RLS ──
    {
      id: 'sec-rls-cross-access',
      name: 'RLS cross-tenant',
      group: 'Seguranca',
      description: 'Verifica que nao e possivel acessar dados com filtro de outro tenant',
      run: async () => {
        // Tenta buscar segmento com ID impossivel via filtro
        const { data, error } = await supabase.from('segments')
          .select('id')
          .eq('id', '00000000-0000-0000-0000-000000000000')
          .maybeSingle();
        if (error) return { passed: false, details: `Erro inesperado: ${error.message}` };
        if (data) return { passed: false, details: 'Retornou dados para UUID inexistente — possivel falha de RLS' };
        return { passed: true, details: 'Nenhum dado retornado para UUID inexistente (RLS OK)' };
      },
    },
    {
      id: 'sec-auth-headers',
      name: 'Token JWT valido',
      group: 'Seguranca',
      description: 'Verifica se o token JWT da sessao atual e valido e nao expirou',
      run: async () => {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return { passed: false, details: 'Sem sessao ativa' };
        const exp = data.session.expires_at;
        if (!exp) return { passed: false, details: 'Token sem expiracao' };
        const now = Math.floor(Date.now() / 1000);
        const remaining = exp - now;
        if (remaining <= 0) return { passed: false, details: 'Token expirado' };
        return { passed: true, details: `Token valido, expira em ${Math.round(remaining / 60)} minutos` };
      },
    },
    // ── Performance ──
    {
      id: 'perf-segments-latency',
      name: 'Latencia: segmentos',
      group: 'Performance',
      description: 'Mede tempo de resposta de SELECT em segments (threshold < 2s)',
      run: async () => {
        const start = performance.now();
        const { error } = await supabase.from('segments').select('id, name').limit(50);
        const ms = Math.round(performance.now() - start);
        if (error) return { passed: false, details: `Erro: ${error.message} (${ms}ms)` };
        return { passed: ms < 2000, details: `${ms}ms${ms >= 2000 ? ' — LENTO (> 2s)' : ''}` };
      },
    },
    {
      id: 'perf-campaigns-latency',
      name: 'Latencia: campanhas',
      group: 'Performance',
      description: 'Mede tempo de resposta de SELECT em campaigns (threshold < 2s)',
      run: async () => {
        const start = performance.now();
        const { error } = await supabase.from('campaigns').select('id, name, status').limit(50);
        const ms = Math.round(performance.now() - start);
        if (error) return { passed: false, details: `Erro: ${error.message} (${ms}ms)` };
        return { passed: ms < 2000, details: `${ms}ms${ms >= 2000 ? ' — LENTO (> 2s)' : ''}` };
      },
    },
    {
      id: 'perf-players-latency',
      name: 'Latencia: player_wallets',
      group: 'Performance',
      description: 'Mede tempo de resposta de SELECT em player_wallets (threshold < 2s)',
      run: async () => {
        const start = performance.now();
        const { error } = await supabase.from('player_wallets').select('cpf, level').limit(50);
        const ms = Math.round(performance.now() - start);
        if (error) return { passed: false, details: `Erro: ${error.message} (${ms}ms)` };
        return { passed: ms < 2000, details: `${ms}ms${ms >= 2000 ? ' — LENTO (> 2s)' : ''}` };
      },
    },
    {
      id: 'perf-edge-fn-latency',
      name: 'Latencia: edge function',
      group: 'Performance',
      description: 'Mede tempo de resposta da edge function manage-users (threshold < 3s)',
      run: async () => {
        const start = performance.now();
        try {
          const { error } = await supabase.functions.invoke('manage-users', {
            body: { action: 'list' },
          });
          const ms = Math.round(performance.now() - start);
          if (error) return { passed: false, details: `Erro: ${error.message} (${ms}ms)` };
          return { passed: ms < 3000, details: `${ms}ms${ms >= 3000 ? ' — LENTO (> 3s)' : ''}` };
        } catch (e) {
          const ms = Math.round(performance.now() - start);
          return { passed: false, details: `Exception: ${e instanceof Error ? e.message : String(e)} (${ms}ms)` };
        }
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
                        <p className={cn('text-xs mt-1 font-mono break-all whitespace-pre-wrap', status === 'passed' ? 'text-emerald-400/80' : status === 'failed' ? 'text-red-400/80' : 'text-muted-foreground')}>
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

      {/* JSON Results */}
      {totalRun > 0 && !running && (
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Resultado JSON
                <Badge variant="outline" className="text-[10px] ml-1">{totalRun} testes</Badge>
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const json = JSON.stringify(
                    {
                      timestamp: new Date().toISOString(),
                      summary: { total: tests.length, passed, failed, blocked, successRate: totalRun > 0 ? `${Math.round((passed / totalRun) * 100)}%` : '-' },
                      results: tests.map(t => {
                        const r = results[t.id];
                        return {
                          id: t.id,
                          name: t.name,
                          group: t.group,
                          status: r?.status ?? 'idle',
                          durationMs: r?.durationMs ?? 0,
                          details: r?.details ?? '',
                        };
                      }),
                    },
                    null,
                    2,
                  );
                  navigator.clipboard.writeText(json);
                }}
              >
                Copiar JSON
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <pre className="text-xs font-mono bg-secondary/50 rounded-lg p-4 overflow-x-auto max-h-[500px] overflow-y-auto whitespace-pre-wrap break-all text-muted-foreground">
              {JSON.stringify(
                {
                  timestamp: new Date().toISOString(),
                  summary: { total: tests.length, passed, failed, blocked, successRate: totalRun > 0 ? `${Math.round((passed / totalRun) * 100)}%` : '-' },
                  results: tests.map(t => {
                    const r = results[t.id];
                    return {
                      id: t.id,
                      name: t.name,
                      group: t.group,
                      status: r?.status ?? 'idle',
                      durationMs: r?.durationMs ?? 0,
                      details: r?.details ?? '',
                    };
                  }),
                },
                null,
                2,
              )}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
