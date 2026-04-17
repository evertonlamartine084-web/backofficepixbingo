import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse, jsonResponse } from './_cors.js';

export const config = { runtime: 'edge', maxDuration: 30 };

interface QuizOption {
  text: string;
  is_correct: boolean;
}

interface QuizQuestion {
  id: string;
  game_id: string;
  question: string;
  options: QuizOption[];
  time_limit_seconds: number;
  points: number;
  explanation: string | null;
  sort_order: number;
  active: boolean;
}

interface MiniGamePrize {
  id: string;
  game_id: string;
  label: string;
  type: string;
  value: number;
  probability: number;
  active: boolean;
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
    const { game_id, cpf, answers } = body as {
      game_id: string;
      cpf: string;
      answers: { question_id: string; selected_option_index: number }[];
    };

    if (!game_id || !cpf || !answers || !Array.isArray(answers)) {
      return jsonResponse({ error: 'game_id, cpf e answers são obrigatórios' }, req, 400);
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

    if (game.type !== 'quiz') {
      return jsonResponse({ error: 'Este jogo não é do tipo quiz' }, req, 400);
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

    // Fetch active questions
    const { data: questions } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('game_id', game_id)
      .eq('active', true)
      .order('sort_order');

    if (!questions || questions.length === 0) {
      return jsonResponse({ error: 'Nenhuma pergunta configurada' }, req, 400);
    }

    const questionsMap = new Map<string, QuizQuestion>();
    for (const q of questions as unknown as QuizQuestion[]) {
      questionsMap.set(q.id, q);
    }

    // Score answers
    let totalScore = 0;
    let correctCount = 0;
    const totalQuestions = questions.length;

    for (const answer of answers) {
      const question = questionsMap.get(answer.question_id);
      if (!question) continue;

      const selectedOption = question.options[answer.selected_option_index];
      if (selectedOption && selectedOption.is_correct) {
        totalScore += question.points || 10;
        correctCount++;
      }
    }

    // Determine reward based on score thresholds from prizes
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
      // Weighted random selection from prize pool, weighted by score ratio
      const scoreRatio = totalQuestions > 0 ? correctCount / totalQuestions : 0;

      if (scoreRatio >= 0.8) {
        // Top tier: pick from best prizes (highest value)
        const sorted = [...typedPrizes].sort((a, b) => b.value - a.value);
        const topPrize = sorted[0];
        rewardType = topPrize.type;
        rewardValue = topPrize.value;
      } else if (scoreRatio >= 0.5) {
        // Mid tier: weighted random
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
        // Low tier: lowest prize or nothing
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
      game_type: 'quiz',
      score: totalScore,
      correct_answers: correctCount,
      time_taken_ms: 0,
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

    // Award prize to wallet
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
            description: `Quiz: ${game.name} - ${correctCount}/${totalQuestions} acertos`,
          } as Record<string, unknown>);
        } catch { /* ignore */ }
      }
    }

    // Log activity
    try {
      await supabase.from('player_activity_log').insert({
        cpf,
        type: 'quiz',
        amount: totalScore,
        source: game.name,
        description: `Quiz ${game.name}: ${correctCount}/${totalQuestions} acertos, ${totalScore} pts`,
      } as Record<string, unknown>);
    } catch { /* ignore */ }

    return jsonResponse({
      score: totalScore,
      correct: correctCount,
      total: totalQuestions,
      reward_type: rewardType,
      reward_value: rewardValue,
    }, req);
  } catch (err) {
    console.error('[play-quiz]', err);
    return jsonResponse({ error: 'Erro interno' }, req, 500);
  }
}
