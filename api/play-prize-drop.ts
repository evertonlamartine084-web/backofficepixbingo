import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse, jsonResponse } from './_cors.js';

export const config = { runtime: 'edge', maxDuration: 30 };

interface MiniGamePrize {
  id: string;
  game_id: string;
  label: string;
  type: string;
  value: number;
  probability: number;
  active: boolean;
}

interface PrizeDropConfig {
  duration_seconds?: number;
  drop_interval_ms?: number;
  speed?: string;
  catch_zone_width?: number;
  max_catches_per_session?: number;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, req, 405);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Server misconfigured' }, req, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { game_id, cpf, prizes_caught, time_taken_ms } = body as {
      game_id: string;
      cpf: string;
      prizes_caught: number;
      time_taken_ms: number;
    };

    if (!game_id || !cpf || prizes_caught === undefined) {
      return jsonResponse({ error: 'game_id, cpf e prizes_caught são obrigatórios' }, req, 400);
    }

    // Fetch game
    const { data: game } = await supabase
      .from('mini_games')
      .select('*')
      .eq('id', game_id)
      .eq('active', true)
      .single();

    if (!game) {
      return jsonResponse({ error: 'Jogo não encontrado ou inativo' }, req, 404);
    }

    // Check daily attempts
    const today = new Date().toISOString().slice(0, 10);
    const { data: attemptRec } = await supabase
      .from('player_mini_game_attempts')
      .select('*')
      .eq('cpf', cpf)
      .eq('game_id', game_id)
      .maybeSingle();

    const attemptsToday = (attemptRec && attemptRec.last_attempt_date === today)
      ? (attemptRec.attempts_today || 0)
      : 0;

    const maxAttempts = game.max_attempts_per_day || 1;
    if (maxAttempts > 0 && attemptsToday >= maxAttempts) {
      return jsonResponse({ error: 'Limite de tentativas atingido', max: maxAttempts }, req, 400);
    }

    // Server-side validation: prizes_caught cannot exceed max_catches_per_session from config
    const gameConfig = (game.config || {}) as PrizeDropConfig;
    const maxCatches = gameConfig.max_catches_per_session || 10;
    const validatedPrizesCaught = Math.min(Math.max(0, prizes_caught), maxCatches);

    // Determine reward from prize pool
    const { data: prizes } = await supabase
      .from('mini_game_prizes')
      .select('*')
      .eq('game_id', game_id)
      .eq('active', true)
      .order('sort_order');

    let rewardType: string | null = null;
    let rewardValue = 0;

    if (prizes && prizes.length > 0) {
      const typedPrizes = prizes as unknown as MiniGamePrize[];
      const catchRatio = maxCatches > 0 ? validatedPrizesCaught / maxCatches : 0;

      if (catchRatio >= 0.8) {
        // High catches: best prize
        const sorted = [...typedPrizes].sort((a, b) => b.value - a.value);
        rewardType = sorted[0].type;
        rewardValue = sorted[0].value;
      } else if (catchRatio >= 0.3) {
        // Mid range: weighted random
        const totalWeight = typedPrizes.reduce((s, p) => s + (p.probability || 1), 0);
        let random = Math.random() * totalWeight;
        for (const prize of typedPrizes) {
          random -= (prize.probability || 1);
          if (random <= 0) {
            rewardType = prize.type;
            rewardValue = prize.value;
            break;
          }
        }
        if (!rewardType) {
          rewardType = typedPrizes[0].type;
          rewardValue = typedPrizes[0].value;
        }
      } else {
        // Low catches: nothing or lowest
        const nothingPrize = typedPrizes.find(p => p.type === 'nothing');
        if (nothingPrize) {
          rewardType = 'nothing';
          rewardValue = 0;
        } else {
          const sorted = [...typedPrizes].sort((a, b) => a.value - b.value);
          rewardType = sorted[0].type;
          rewardValue = sorted[0].value;
        }
      }
    }

    // Save result
    await supabase.from('player_mini_game_results').insert({
      cpf,
      game_id,
      game_type: 'prize_drop_live',
      prizes_caught: validatedPrizesCaught,
      time_taken_ms: time_taken_ms || 0,
      reward_type: rewardType,
      reward_value: rewardValue,
    } as Record<string, unknown>);

    // Update attempt record
    await supabase.from('player_mini_game_attempts').upsert({
      cpf,
      game_id,
      attempts_today: attemptsToday + 1,
      last_attempt_date: today,
      total_attempts: (attemptRec?.total_attempts || 0) + 1,
    } as Record<string, unknown>, { onConflict: 'cpf,game_id' });

    // Award prize
    if (rewardType && rewardType !== 'nothing' && rewardValue > 0) {
      if (rewardType === 'coins') {
        const { data: w } = await supabase.from('player_wallets').select('coins').eq('cpf', cpf).maybeSingle();
        await supabase.from('player_wallets').update({ coins: (w?.coins || 0) + rewardValue } as Record<string, unknown>).eq('cpf', cpf);
      } else if (rewardType === 'xp') {
        const { data: w } = await supabase.from('player_wallets').select('xp, total_xp_earned').eq('cpf', cpf).maybeSingle();
        await supabase.from('player_wallets').update({ xp: (w?.xp || 0) + rewardValue, total_xp_earned: (w?.total_xp_earned || 0) + rewardValue } as Record<string, unknown>).eq('cpf', cpf);
      } else if (rewardType === 'diamonds') {
        const { data: w } = await supabase.from('player_wallets').select('diamonds, total_diamonds_earned').eq('cpf', cpf).maybeSingle();
        await supabase.from('player_wallets').update({ diamonds: (w?.diamonds || 0) + rewardValue, total_diamonds_earned: (w?.total_diamonds_earned || 0) + rewardValue } as Record<string, unknown>).eq('cpf', cpf);
      } else if (rewardType === 'bonus' || rewardType === 'free_bet') {
        try {
          await supabase.from('player_rewards_pending').insert({
            cpf,
            reward_type: rewardType,
            reward_value: rewardValue,
            source: game.name,
            description: `Prize Drop: ${game.name} - ${validatedPrizesCaught} capturas`,
          } as Record<string, unknown>);
        } catch { /* ignore */ }
      }
    }

    // Log activity
    try {
      await supabase.from('player_activity_log').insert({
        cpf,
        type: 'prize_drop_live',
        amount: rewardType !== 'nothing' ? rewardValue : 0,
        source: game.name,
        description: `Prize Drop ${game.name}: ${validatedPrizesCaught} capturas em ${((time_taken_ms || 0) / 1000).toFixed(1)}s`,
      } as Record<string, unknown>);
    } catch { /* ignore */ }

    return jsonResponse({
      prizes_caught: validatedPrizesCaught,
      reward_type: rewardType,
      reward_value: rewardValue,
    }, req);
  } catch (err) {
    console.error('[play-prize-drop]', err);
    return jsonResponse({ error: 'Erro interno' }, req, 500);
  }
}
