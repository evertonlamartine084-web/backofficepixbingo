import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse, verifyAuth } from '../_cors.js';
import { platformLogin, buildPlatformHeaders } from '../_platform.js';

export const config = { runtime: 'edge', maxDuration: 120 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

interface AutomationRule {
  id: string;
  name: string;
  trigger_type: string;
  conditions: Condition[];
  match_type: string;
  segment_id: string | null;
  lifecycle_stages: string[];
  action_type: string;
  action_config: Record<string, unknown>;
  cooldown_hours: number;
  max_executions_per_player: number | null;
  max_executions_total: number | null;
  total_executions: number;
}

interface Condition {
  field: string;
  operator: string;
  value: string | number;
}

interface PlayerRow {
  cpf: string;
  [key: string]: unknown;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  const cors = getCorsHeaders(req);
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const auth = await verifyAuth(req);
  if (!auth) return json({ error: 'Não autorizado' }, 401);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Config missing' }, 500);
  const supabase = createClient(supabaseUrl, supabaseKey) as AnySupabase;

  try {
    // 1. Get all active automation rules
    const { data: rules, error: rulesErr } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('active', true);

    if (rulesErr) throw rulesErr;
    if (!rules || rules.length === 0) return json({ message: 'No active rules', processed: 0 });

    // 2. Platform login (needed for bonus crediting)
    let platformHeaders: Record<string, string> | null = null;
    let siteUrl = '';
    const needsPlatform = rules.some((r: AutomationRule) => r.action_type === 'credit_bonus');
    if (needsPlatform) {
      const { data: platformConfig } = await supabase
        .from('platform_config')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (platformConfig) {
        siteUrl = (platformConfig.site_url || 'https://pixbingobr.concurso.club').replace(/\/+$/, '');
        const login = await platformLogin(siteUrl, platformConfig.username, platformConfig.password, platformConfig.login_url);
        if (login.success) {
          platformHeaders = buildPlatformHeaders(login.cookies, siteUrl);
        }
      }
    }

    let totalActions = 0;
    let totalErrors = 0;
    const ruleResults: Record<string, { matched: number; executed: number; errors: number }> = {};

    // 3. Evaluate each rule
    for (const rule of rules as AutomationRule[]) {
      const result = { matched: 0, executed: 0, errors: 0 };
      ruleResults[rule.name] = result;

      // Check total execution limit
      if (rule.max_executions_total && rule.total_executions >= rule.max_executions_total) continue;

      // Find matching players
      const matchingCpfs = await findMatchingPlayers(supabase, rule);
      result.matched = matchingCpfs.length;

      if (matchingCpfs.length === 0) continue;

      // Filter by cooldown and per-player limits
      const eligibleCpfs = await filterByCooldownAndLimits(supabase, rule, matchingCpfs);

      // Execute actions
      for (const cpf of eligibleCpfs) {
        // Check total limit again (in case we're in the loop)
        if (rule.max_executions_total && (rule.total_executions + result.executed) >= rule.max_executions_total) break;

        try {
          const actionResult = await executeAction(supabase, rule, cpf, platformHeaders, siteUrl);

          // Log execution
          await supabase.from('automation_log').insert({
            rule_id: rule.id,
            rule_name: rule.name,
            cpf,
            action_type: rule.action_type,
            action_config: rule.action_config,
            result: actionResult,
          });

          result.executed++;
          totalActions++;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          await supabase.from('automation_log').insert({
            rule_id: rule.id,
            rule_name: rule.name,
            cpf,
            action_type: rule.action_type,
            action_config: rule.action_config,
            result: { success: false, error: errMsg },
          });
          result.errors++;
          totalErrors++;
        }
      }

      // Update rule stats
      if (result.executed > 0) {
        await supabase.from('automation_rules').update({
          total_executions: rule.total_executions + result.executed,
          last_executed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', rule.id);
      }
    }

    return json({
      message: 'Automations evaluated',
      rules_evaluated: rules.length,
      total_actions: totalActions,
      total_errors: totalErrors,
      details: ruleResults,
    });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : 'Erro ao avaliar automações' }, 500);
  }
}

// --- Find players matching rule conditions ---

async function findMatchingPlayers(supabase: AnySupabase, rule: AutomationRule): Promise<string[]> {
  const conditions = rule.conditions || [];
  if (conditions.length === 0) return [];

  // Determine which tables we need
  const metricsFields = new Set([
    'favorite_game', 'favorite_game_category', 'total_bet_7d', 'total_bet_30d',
    'bet_count_7d', 'bet_count_30d', 'avg_bet_value', 'total_deposit_7d', 'total_deposit_30d',
    'deposit_count_7d', 'deposit_count_30d', 'days_since_last_bet', 'days_since_last_deposit',
    'days_since_last_login', 'active_days_7d', 'active_days_30d', 'engagement_score', 'churn_risk',
  ]);
  const walletFields = new Set(['level', 'coins', 'xp', 'total_coins_earned', 'total_xp_earned']);
  const lifecycleFields = new Set(['stage', 'markers']);

  // Build query per condition source
  const cpfSets: Set<string>[] = [];

  for (const cond of conditions) {
    const cpfs = new Set<string>();

    if (metricsFields.has(cond.field)) {
      const { data } = await queryWithCondition(supabase, 'player_computed_metrics', cond);
      if (data) (data as PlayerRow[]).forEach(r => cpfs.add(r.cpf));
    } else if (walletFields.has(cond.field)) {
      const { data } = await queryWithCondition(supabase, 'player_wallets', cond);
      if (data) (data as PlayerRow[]).forEach(r => cpfs.add(r.cpf));
    } else if (lifecycleFields.has(cond.field)) {
      if (cond.field === 'stage') {
        const { data } = await supabase.from('player_lifecycle').select('cpf').eq('stage', String(cond.value)).limit(50000);
        if (data) (data as PlayerRow[]).forEach(r => cpfs.add(r.cpf));
      } else if (cond.field === 'markers') {
        const { data } = await supabase.from('player_lifecycle').select('cpf').contains('markers', [String(cond.value)]).limit(50000);
        if (data) (data as PlayerRow[]).forEach(r => cpfs.add(r.cpf));
      }
    }

    cpfSets.push(cpfs);
  }

  // Combine: AND (all) or OR (any)
  if (cpfSets.length === 0) return [];

  let finalCpfs: Set<string>;
  if (rule.match_type === 'any') {
    finalCpfs = new Set<string>();
    for (const s of cpfSets) s.forEach(cpf => finalCpfs.add(cpf));
  } else {
    finalCpfs = cpfSets[0];
    for (let i = 1; i < cpfSets.length; i++) {
      const next = cpfSets[i];
      for (const cpf of finalCpfs) {
        if (!next.has(cpf)) finalCpfs.delete(cpf);
      }
    }
  }

  // Filter by segment if specified
  if (rule.segment_id) {
    const { data: segItems } = await supabase
      .from('segment_items')
      .select('cpf')
      .eq('segment_id', rule.segment_id)
      .limit(50000);
    const segCpfs = new Set((segItems || []).map((r: PlayerRow) => r.cpf));
    for (const cpf of finalCpfs) {
      if (!segCpfs.has(cpf)) finalCpfs.delete(cpf);
    }
  }

  // Filter by lifecycle stages if specified
  if (rule.lifecycle_stages && rule.lifecycle_stages.length > 0) {
    const { data: lcItems } = await supabase
      .from('player_lifecycle')
      .select('cpf')
      .in('stage', rule.lifecycle_stages)
      .limit(50000);
    const lcCpfs = new Set((lcItems || []).map((r: PlayerRow) => r.cpf));
    for (const cpf of finalCpfs) {
      if (!lcCpfs.has(cpf)) finalCpfs.delete(cpf);
    }
  }

  return Array.from(finalCpfs);
}

async function queryWithCondition(supabase: AnySupabase, table: string, cond: Condition) {
  let query = supabase.from(table).select('cpf');
  const { field, operator, value } = cond;
  const numVal = Number(value);

  // Text fields
  if (field === 'favorite_game' || field === 'favorite_game_category') {
    const strVal = String(value);
    if (operator === 'eq') query = query.eq(field, strVal);
    else if (operator === 'neq') query = query.neq(field, strVal);
    else if (operator === 'contains' || operator === 'like') query = query.ilike(field, `%${strVal}%`);
    else query = query.eq(field, strVal);
  } else {
    // Numeric fields
    switch (operator) {
      case 'eq': query = query.eq(field, numVal); break;
      case 'neq': query = query.neq(field, numVal); break;
      case 'gt': query = query.gt(field, numVal); break;
      case 'gte': query = query.gte(field, numVal); break;
      case 'lt': query = query.lt(field, numVal); break;
      case 'lte': query = query.lte(field, numVal); break;
      default: query = query.gte(field, numVal);
    }
  }

  return await query.limit(50000);
}

// --- Filter by cooldown and per-player limits ---

async function filterByCooldownAndLimits(
  supabase: AnySupabase,
  rule: AutomationRule,
  cpfs: string[],
): Promise<string[]> {
  if (cpfs.length === 0) return [];

  // Get recent logs for this rule
  const cooldownCutoff = new Date();
  cooldownCutoff.setHours(cooldownCutoff.getHours() - (rule.cooldown_hours || 24));

  const { data: recentLogs } = await supabase
    .from('automation_log')
    .select('cpf')
    .eq('rule_id', rule.id)
    .gte('executed_at', cooldownCutoff.toISOString());

  const recentCpfs = new Set((recentLogs || []).map((r: PlayerRow) => r.cpf));

  // Filter out players in cooldown
  let eligible = cpfs.filter(cpf => !recentCpfs.has(cpf));

  // Check per-player execution limit
  if (rule.max_executions_per_player) {
    const { data: allLogs } = await supabase
      .from('automation_log')
      .select('cpf')
      .eq('rule_id', rule.id)
      .in('cpf', eligible.slice(0, 5000));

    if (allLogs) {
      const counts: Record<string, number> = {};
      (allLogs as PlayerRow[]).forEach(r => { counts[r.cpf] = (counts[r.cpf] || 0) + 1; });
      eligible = eligible.filter(cpf => (counts[cpf] || 0) < rule.max_executions_per_player!);
    }
  }

  return eligible;
}

// --- Execute action ---

async function executeAction(
  supabase: AnySupabase,
  rule: AutomationRule,
  cpf: string,
  platformHeaders: Record<string, string> | null,
  siteUrl: string,
): Promise<Record<string, unknown>> {
  const config = rule.action_config;

  switch (rule.action_type) {
    case 'credit_bonus': {
      if (!platformHeaders) return { success: false, error: 'Platform login unavailable' };
      const amount = Number(config.amount || 0);
      if (amount <= 0) return { success: false, error: 'Invalid amount' };

      const desc = String(config.description || `Automação: ${rule.name}`);
      const body = new URLSearchParams({
        cpf,
        valor: amount.toFixed(2).replace('.', ','),
        descricao: desc,
      });

      const res = await fetch(`${siteUrl}/bonus/creditar`, {
        method: 'POST',
        headers: { ...platformHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(15000),
      });

      const text = await res.text();
      try {
        const data = JSON.parse(text);
        return { success: true, amount, description: desc, response: data };
      } catch {
        return { success: false, error: 'Invalid response', snippet: text.slice(0, 200) };
      }
    }

    case 'add_marker': {
      const marker = String(config.marker || '');
      if (!marker) return { success: false, error: 'No marker specified' };

      // Upsert lifecycle with marker
      const { data: existing } = await supabase
        .from('player_lifecycle')
        .select('markers')
        .eq('cpf', cpf)
        .maybeSingle();

      const currentMarkers: string[] = existing?.markers || [];
      if (!currentMarkers.includes(marker)) {
        currentMarkers.push(marker);
        await supabase.from('player_lifecycle').upsert({
          cpf,
          markers: currentMarkers,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'cpf' });
      }

      return { success: true, marker, action: 'added' };
    }

    case 'remove_marker': {
      const marker = String(config.marker || '');
      if (!marker) return { success: false, error: 'No marker specified' };

      const { data: existing } = await supabase
        .from('player_lifecycle')
        .select('markers')
        .eq('cpf', cpf)
        .maybeSingle();

      if (existing) {
        const updated = (existing.markers || []).filter((m: string) => m !== marker);
        await supabase.from('player_lifecycle').update({
          markers: updated,
          updated_at: new Date().toISOString(),
        }).eq('cpf', cpf);
      }

      return { success: true, marker, action: 'removed' };
    }

    case 'change_lifecycle': {
      const newStage = String(config.stage || '');
      if (!newStage) return { success: false, error: 'No stage specified' };

      const { data: existing } = await supabase
        .from('player_lifecycle')
        .select('stage')
        .eq('cpf', cpf)
        .maybeSingle();

      const prevStage = existing?.stage || 'new';
      await supabase.from('player_lifecycle').upsert({
        cpf,
        stage: newStage,
        previous_stage: prevStage,
        stage_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'cpf' });

      return { success: true, from: prevStage, to: newStage };
    }

    case 'give_spins': {
      const amount = Number(config.amount || 0);
      if (amount <= 0) return { success: false, error: 'Invalid amount' };

      const { data: existing } = await supabase
        .from('player_spins')
        .select('total_spins')
        .eq('cpf', cpf)
        .maybeSingle();

      if (existing) {
        await supabase.from('player_spins').update({
          total_spins: (existing.total_spins || 0) + amount,
        }).eq('cpf', cpf);
      } else {
        await supabase.from('player_spins').insert({ cpf, total_spins: amount });
      }

      return { success: true, spins_given: amount };
    }

    case 'give_coins': {
      const amount = Number(config.amount || 0);
      if (amount <= 0) return { success: false, error: 'Invalid amount' };

      await supabase.rpc('increment_coins', { p_cpf: cpf, p_amount: amount }).maybeSingle();
      // Fallback if RPC doesn't exist
      const { data: wallet } = await supabase.from('player_wallets').select('coins').eq('cpf', cpf).maybeSingle();
      if (wallet) {
        await supabase.from('player_wallets').update({
          coins: (wallet.coins || 0) + amount,
          total_coins_earned: (wallet.coins || 0) + amount,
        }).eq('cpf', cpf);
      }

      return { success: true, coins_given: amount };
    }

    case 'give_mission': {
      const missionId = String(config.mission_id || '');
      if (!missionId) return { success: false, error: 'No mission_id specified' };

      await supabase.from('player_mission_progress').upsert({
        cpf,
        mission_id: missionId,
        progress: 0,
        completed: false,
        opted_in: true,
        started_at: new Date().toISOString(),
      }, { onConflict: 'cpf,mission_id' });

      return { success: true, mission_id: missionId };
    }

    default:
      return { success: false, error: `Unknown action type: ${rule.action_type}` };
  }
}
