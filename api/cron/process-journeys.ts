import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse, verifyAuth } from '../_cors.js';
import { platformLogin, buildPlatformHeaders } from '../_platform.js';

export const config = { runtime: 'edge', maxDuration: 120 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

interface Journey {
  id: string;
  name: string;
  status: string;
  entry_event: string;
  entry_conditions: Condition[];
  entry_match_type: string;
  segment_id: string | null;
  max_entries_per_player: number;
}

interface JourneyStep {
  id: string;
  journey_id: string;
  step_order: number;
  step_type: string;
  delay_minutes: number;
  action_type: string | null;
  action_config: Record<string, unknown>;
  conditions: Condition[];
  condition_yes_next: number | null;
  condition_no_next: number | null;
}

interface Enrollment {
  id: string;
  journey_id: string;
  cpf: string;
  current_step_order: number;
  status: string;
  step_entered_at: string;
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
    // 1. Get all active journeys
    const { data: journeys, error: journeysErr } = await supabase
      .from('journeys')
      .select('*')
      .eq('status', 'ativa')
      .eq('active', true);

    if (journeysErr) throw journeysErr;
    if (!journeys || journeys.length === 0) return json({ message: 'No active journeys', processed: 0 });

    // 2. Get all steps for active journeys
    const journeyIds = (journeys as Journey[]).map(j => j.id);
    const { data: allSteps } = await supabase
      .from('journey_steps')
      .select('*')
      .in('journey_id', journeyIds)
      .order('step_order', { ascending: true });

    const stepsByJourney: Record<string, JourneyStep[]> = {};
    for (const step of (allSteps || []) as JourneyStep[]) {
      if (!stepsByJourney[step.journey_id]) stepsByJourney[step.journey_id] = [];
      stepsByJourney[step.journey_id].push(step);
    }

    // 3. Platform login (for bonus crediting)
    let platformHeaders: Record<string, string> | null = null;
    let siteUrl = '';
    const needsPlatform = (allSteps || []).some(
      (s: JourneyStep) => s.action_type === 'credit_bonus'
    );
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
    const journeyResults: Record<string, { enrolled: number; advanced: number; completed: number; errors: number }> = {};

    // 5. Process each journey
    for (const journey of journeys as Journey[]) {
      const result = { enrolled: 0, advanced: 0, completed: 0, errors: 0 };
      journeyResults[journey.name] = result;

      const steps = stepsByJourney[journey.id] || [];
      if (steps.length === 0) continue;

      // Get active enrollments
      const { data: enrollments } = await supabase
        .from('journey_enrollments')
        .select('*')
        .eq('journey_id', journey.id)
        .eq('status', 'active');

      if (!enrollments || enrollments.length === 0) continue;
      result.enrolled = enrollments.length;

      // Process each enrollment
      for (const enrollment of enrollments as Enrollment[]) {
        try {
          const currentStep = steps.find(s => s.step_order === enrollment.current_step_order);
          if (!currentStep) {
            // No step found at this order — mark as completed
            await markCompleted(supabase, enrollment);
            result.completed++;
            continue;
          }

          // Process based on step type
          if (currentStep.step_type === 'delay') {
            // Check if enough time has elapsed
            const stepEnteredAt = new Date(enrollment.step_entered_at).getTime();
            const now = Date.now();
            const elapsedMinutes = (now - stepEnteredAt) / (1000 * 60);

            if (elapsedMinutes < currentStep.delay_minutes) {
              // Not enough time, skip
              continue;
            }

            // Delay complete, advance to next step
            const nextStep = findNextStep(steps, currentStep.step_order);
            if (nextStep) {
              await advanceToStep(supabase, enrollment, nextStep.step_order);
              result.advanced++;

              // Log the delay completion
              await logExecution(supabase, journey.id, enrollment.id, enrollment.cpf, currentStep.step_order, 'delay_complete', {
                success: true,
                delay_minutes: currentStep.delay_minutes,
              });
            } else {
              await markCompleted(supabase, enrollment);
              result.completed++;
              await logExecution(supabase, journey.id, enrollment.id, enrollment.cpf, currentStep.step_order, 'delay_complete', {
                success: true,
                journey_completed: true,
              });
            }
          } else if (currentStep.step_type === 'action') {
            // Execute the action
            const actionResult = await executeAction(
              supabase, currentStep, enrollment.cpf, platformHeaders, siteUrl
            );

            // Log the action
            await logExecution(
              supabase, journey.id, enrollment.id, enrollment.cpf,
              currentStep.step_order, currentStep.action_type || 'unknown', actionResult
            );

            if (actionResult.success) {
              totalActions++;
              // Advance to next step
              const nextStep = findNextStep(steps, currentStep.step_order);
              if (nextStep) {
                await advanceToStep(supabase, enrollment, nextStep.step_order);
                result.advanced++;
              } else {
                await markCompleted(supabase, enrollment);
                result.completed++;
              }
            } else {
              result.errors++;
              totalErrors++;
            }
          } else if (currentStep.step_type === 'condition_split') {
            // Evaluate conditions
            const conditionsMet = await evaluateConditions(supabase, currentStep.conditions, enrollment.cpf);

            const nextOrder = conditionsMet
              ? currentStep.condition_yes_next
              : currentStep.condition_no_next;

            await logExecution(
              supabase, journey.id, enrollment.id, enrollment.cpf,
              currentStep.step_order, 'condition_split', {
                success: true,
                conditions_met: conditionsMet,
                next_step: nextOrder,
              }
            );

            if (nextOrder != null) {
              const targetStep = steps.find(s => s.step_order === nextOrder);
              if (targetStep) {
                await advanceToStep(supabase, enrollment, targetStep.step_order);
                result.advanced++;
              } else {
                await markCompleted(supabase, enrollment);
                result.completed++;
              }
            } else {
              // No next step configured, mark completed
              await markCompleted(supabase, enrollment);
              result.completed++;
            }
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          await logExecution(
            supabase, journey.id, enrollment.id, enrollment.cpf,
            enrollment.current_step_order, 'error', { success: false, error: errMsg }
          );
          result.errors++;
          totalErrors++;
        }
      }
    }

    return json({
      message: 'Journeys processed',
      journeys_processed: journeys.length,
      total_actions: totalActions,
      total_errors: totalErrors,
      details: journeyResults,
    });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : 'Erro ao processar jornadas' }, 500);
  }
}

// --- Helper: find the next sequential step ---

function findNextStep(steps: JourneyStep[], currentOrder: number): JourneyStep | undefined {
  return steps
    .filter(s => s.step_order > currentOrder)
    .sort((a, b) => a.step_order - b.step_order)[0];
}

// --- Helper: advance enrollment to a specific step ---

async function advanceToStep(supabase: AnySupabase, enrollment: Enrollment, stepOrder: number) {
  await supabase.from('journey_enrollments').update({
    current_step_order: stepOrder,
    step_entered_at: new Date().toISOString(),
  }).eq('id', enrollment.id);
}

// --- Helper: mark enrollment as completed ---

async function markCompleted(supabase: AnySupabase, enrollment: Enrollment) {
  await supabase.from('journey_enrollments').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
  }).eq('id', enrollment.id);
}

// --- Helper: log execution ---

async function logExecution(
  supabase: AnySupabase,
  journeyId: string,
  enrollmentId: string,
  cpf: string,
  stepOrder: number,
  actionType: string,
  result: Record<string, unknown>,
) {
  await supabase.from('journey_log').insert({
    journey_id: journeyId,
    enrollment_id: enrollmentId,
    cpf,
    step_order: stepOrder,
    action_type: actionType,
    result,
  });
}

// --- Evaluate conditions against player data ---

async function evaluateConditions(
  supabase: AnySupabase,
  conditions: Condition[],
  cpf: string,
): Promise<boolean> {
  if (!conditions || conditions.length === 0) return true;

  // Fetch player data from metrics and wallets
  const [metricsRes, walletRes] = await Promise.all([
    supabase.from('player_computed_metrics').select('*').eq('cpf', cpf).maybeSingle(),
    supabase.from('player_wallets').select('*').eq('cpf', cpf).maybeSingle(),
  ]);

  const metrics = metricsRes.data || {};
  const wallet = walletRes.data || {};
  const playerData = { ...metrics, ...wallet };

  for (const cond of conditions) {
    const fieldVal = Number(playerData[cond.field] ?? 0);
    const condVal = Number(cond.value);

    let met = false;
    switch (cond.operator) {
      case 'gt': met = fieldVal > condVal; break;
      case 'gte': met = fieldVal >= condVal; break;
      case 'eq': met = fieldVal === condVal; break;
      case 'neq': met = fieldVal !== condVal; break;
      case 'lt': met = fieldVal < condVal; break;
      case 'lte': met = fieldVal <= condVal; break;
      case 'contains': met = String(playerData[cond.field] ?? '').includes(String(cond.value)); break;
      default: met = false;
    }

    if (!met) return false; // AND logic — all must pass
  }

  return true;
}

// --- Execute action (reused patterns from evaluate-automations) ---

async function executeAction(
  supabase: AnySupabase,
  step: JourneyStep,
  cpf: string,
  platformHeaders: Record<string, string> | null,
  siteUrl: string,
): Promise<Record<string, unknown>> {
  const config = step.action_config || {};

  switch (step.action_type) {
    case 'credit_bonus': {
      if (!platformHeaders) return { success: false, error: 'Platform login unavailable' };
      const amount = Number(config.amount || 0);
      if (amount <= 0) return { success: false, error: 'Invalid amount' };

      const desc = String(config.description || 'Jornada automática');
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

    case 'give_coins': {
      const amount = Number(config.amount || 0);
      if (amount <= 0) return { success: false, error: 'Invalid amount' };

      await supabase.rpc('increment_coins', { p_cpf: cpf, p_amount: amount }).maybeSingle();
      const { data: wallet } = await supabase.from('player_wallets').select('coins').eq('cpf', cpf).maybeSingle();
      if (wallet) {
        await supabase.from('player_wallets').update({
          coins: (wallet.coins || 0) + amount,
          total_coins_earned: (wallet.coins || 0) + amount,
        }).eq('cpf', cpf);
      }

      return { success: true, coins_given: amount };
    }

    case 'give_xp': {
      const amount = Number(config.amount || 0);
      if (amount <= 0) return { success: false, error: 'Invalid amount' };

      const { data: wallet } = await supabase.from('player_wallets').select('xp, total_xp_earned').eq('cpf', cpf).maybeSingle();
      if (wallet) {
        await supabase.from('player_wallets').update({
          xp: (wallet.xp || 0) + amount,
          total_xp_earned: (wallet.total_xp_earned || 0) + amount,
        }).eq('cpf', cpf);
      }

      return { success: true, xp_given: amount };
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

    case 'give_achievement': {
      const achievementId = String(config.achievement_id || '');
      if (!achievementId) return { success: false, error: 'No achievement_id specified' };

      await supabase.from('player_achievements').upsert({
        cpf,
        achievement_id: achievementId,
        unlocked: true,
        unlocked_at: new Date().toISOString(),
      }, { onConflict: 'cpf,achievement_id' });

      return { success: true, achievement_id: achievementId };
    }

    case 'add_to_segment': {
      const segmentId = String(config.segment_id || '');
      if (!segmentId) return { success: false, error: 'No segment_id specified' };

      await supabase.from('segment_items').upsert({
        segment_id: segmentId,
        cpf,
        added_at: new Date().toISOString(),
      }, { onConflict: 'segment_id,cpf' });

      return { success: true, segment_id: segmentId };
    }

    case 'send_push': {
      const title = String(config.title || '');
      const body = String(config.body || '');
      if (!title) return { success: false, error: 'No title specified' };

      // Store push in a notifications table for the player
      await supabase.from('player_notifications').insert({
        cpf,
        type: 'push',
        title,
        body,
        url: config.url || null,
        read: false,
        sent_at: new Date().toISOString(),
      });

      return { success: true, type: 'push', title };
    }

    case 'send_inbox': {
      const title = String(config.title || '');
      const body = String(config.body || '');
      if (!title) return { success: false, error: 'No title specified' };

      await supabase.from('player_notifications').insert({
        cpf,
        type: 'inbox',
        title,
        body,
        action_url: config.action_url || null,
        read: false,
        sent_at: new Date().toISOString(),
      });

      return { success: true, type: 'inbox', title };
    }

    default:
      return { success: false, error: `Unknown action type: ${step.action_type}` };
  }
}
