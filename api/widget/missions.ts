import { HandlerContext } from './types.js';

export async function handleMissionOptin(ctx: HandlerContext): Promise<Response> {
  const { supabase, url, playerCpf, corsHeaders } = ctx;

  if (!playerCpf) {
    return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const missionId = url.searchParams.get('mission_id');
  if (!missionId) {
    return new Response(JSON.stringify({ error: 'mission_id obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await supabase.from('player_mission_progress').upsert({
    cpf: playerCpf,
    mission_id: missionId,
    opted_in: true,
    started_at: new Date().toISOString(),
  } as Record<string, unknown>, { onConflict: 'cpf,mission_id' });

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleMissionClaim(ctx: HandlerContext): Promise<Response> {
  const { supabase, url, playerCpf, corsHeaders } = ctx;

  if (!playerCpf) {
    return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const missionId = url.searchParams.get('mission_id');
  if (!missionId) {
    return new Response(JSON.stringify({ error: 'mission_id obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check progress
  const { data: prog } = await supabase.from('player_mission_progress')
    .select('*').eq('cpf', playerCpf).eq('mission_id', missionId).maybeSingle();
  if (!prog || !prog.completed) {
    return new Response(JSON.stringify({ error: 'Missão não concluída' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (prog.claimed) {
    return new Response(JSON.stringify({ error: 'Já resgatada' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get mission to award reward
  const { data: mission } = await supabase.from('missions').select('*').eq('id', missionId).single();
  if (!mission) {
    return new Response(JSON.stringify({ error: 'Missão não encontrada' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Award reward
  if (mission.reward_type === 'coins' && mission.reward_value > 0) {
    const { data: w } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
    await supabase.from('player_wallets').update({ coins: (w?.coins || 0) + mission.reward_value } as Record<string, unknown>).eq('cpf', playerCpf);
  } else if (mission.reward_type === 'xp' && mission.reward_value > 0) {
    const { data: w } = await supabase.from('player_wallets').select('xp').eq('cpf', playerCpf).maybeSingle();
    await supabase.from('player_wallets').update({ xp: (w?.xp || 0) + mission.reward_value } as Record<string, unknown>).eq('cpf', playerCpf);
  } else if ((mission.reward_type === 'bonus' || mission.reward_type === 'free_bet') && mission.reward_value > 0) {
    try {
      await supabase.from('player_rewards_pending').insert({
        cpf: playerCpf,
        reward_type: mission.reward_type,
        reward_value: mission.reward_value,
        source: mission.name,
        description: `Missão: ${mission.name}`,
      } as Record<string, unknown>);
    } catch { /* ignore */ }
  }

  // Mark as claimed
  await supabase.from('player_mission_progress')
    .update({ claimed: true, claimed_at: new Date().toISOString() } as Record<string, unknown>)
    .eq('cpf', playerCpf).eq('mission_id', missionId);

  // Log activity
  try {
    await supabase.from('player_activity_log').insert({
      cpf: playerCpf,
      type: 'mission_claim',
      amount: mission.reward_value,
      source: mission.name,
      description: `Missão resgatada: ${mission.name}`,
    } as Record<string, unknown>);
  } catch { /* ignore */ }

  return new Response(JSON.stringify({ success: true, reward_type: mission.reward_type, reward_value: mission.reward_value }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleSyncProgress(ctx: HandlerContext): Promise<Response> {
  const { supabase, url, playerCpf, corsHeaders } = ctx;

  if (!playerCpf) {
    return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const eventType = url.searchParams.get('event_type') || '';
  const eventValue = Number(url.searchParams.get('event_value') || 0);
  const eventCount = Number(url.searchParams.get('event_count') || 1);

  // Map event_type to mission condition_types
  const CONDITION_MAP: Record<string, string[]> = {
    deposit: ['deposit'],
    bet: ['bet'],
    win: ['win'],
    login: ['login', 'consecutive_days'],
    play_keno: ['play_keno', 'total_games'],
    play_cassino: ['play_cassino', 'total_games'],
    spin_wheel: ['spin_wheel'],
    store_purchase: ['store_purchase'],
    referral: ['referral'],
  };

  // Achievement condition mapping
  const ACHIEVEMENT_MAP: Record<string, string[]> = {
    deposit: ['first_deposit', 'total_deposited'],
    bet: ['total_bet'],
    login: ['consecutive_days'],
    win: ['total_wins'],
    play_keno: ['total_games'],
    play_cassino: ['total_games'],
    referral: ['referrals'],
  };

  const matchingConditions = CONDITION_MAP[eventType] || [];
  const matchingAchConditions = ACHIEVEMENT_MAP[eventType] || [];

  if (matchingConditions.length === 0 && matchingAchConditions.length === 0) {
    return new Response(JSON.stringify({ error: 'event_type inválido', valid: Object.keys(CONDITION_MAP) }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check player segment membership
  const { data: playerSegments } = await supabase
    .from('segment_items').select('segment_id').eq('cpf', playerCpf);
  const playerSegmentIds = new Set((playerSegments || []).map((s: Record<string, unknown>) => s.segment_id));

  let missionsUpdated = 0;
  let missionsCompleted = 0;
  let achievementsUpdated = 0;
  let achievementsCompleted = 0;

  // -- MISSIONS --
  if (matchingConditions.length > 0) {
    const now = new Date().toISOString();
    const { data: missions } = await supabase
      .from('missions')
      .select('*')
      .eq('status', 'ATIVO')
      .eq('active', true)
      .in('condition_type', matchingConditions);

    for (const mission of (missions || [])) {
      // Check segment targeting
      if (mission.segment_id && !playerSegmentIds.has(mission.segment_id)) continue;

      // Check date range
      if (mission.start_date && now < mission.start_date) continue;
      if (mission.end_date && now > mission.end_date) continue;

      // Get or create progress
      const { data: existing } = await supabase
        .from('player_mission_progress')
        .select('*')
        .eq('cpf', playerCpf)
        .eq('mission_id', mission.id)
        .maybeSingle();

      // If requires opt-in and player hasn't opted in, skip
      if (mission.require_optin && (!existing || !existing.opted_in)) continue;

      // If already completed and claimed, check recurrence
      if (existing?.completed && existing?.claimed) {
        if (mission.recurrence === 'none') continue;

        // Check if it's time to reset
        const resetAt = existing.reset_at ? new Date(existing.reset_at) : new Date(existing.completed_at || existing.created_at);
        const nowDate = new Date();
        let shouldReset = false;

        if (mission.recurrence === 'daily') {
          shouldReset = nowDate.toDateString() !== resetAt.toDateString();
        } else if (mission.recurrence === 'weekly') {
          const diffDays = (nowDate.getTime() - resetAt.getTime()) / (1000 * 60 * 60 * 24);
          shouldReset = diffDays >= 7;
        } else if (mission.recurrence === 'monthly') {
          shouldReset = nowDate.getMonth() !== resetAt.getMonth() || nowDate.getFullYear() !== resetAt.getFullYear();
        }

        if (shouldReset) {
          await supabase.from('player_mission_progress').update({
            progress: 0, completed: false, claimed: false,
            completed_at: null, claimed_at: null, reset_at: now,
          } as Record<string, unknown>).eq('cpf', playerCpf).eq('mission_id', mission.id);
        } else {
          continue;
        }
      }

      // If already completed but not claimed, skip update
      if (existing?.completed && !existing?.claimed) continue;

      const currentProgress = existing?.progress || 0;
      const target = mission.condition_value || 1;
      // condition_mode: 'count' = number of bets, 'amount' (default) = total R$ value
      const increment = mission.condition_mode === 'count' ? eventCount : (eventValue || 1);
      const newProgress = Math.min(currentProgress + increment, target);
      const isCompleted = newProgress >= target;

      const upsertData: Record<string, unknown> = {
        cpf: playerCpf,
        mission_id: mission.id,
        progress: newProgress,
        target,
        completed: isCompleted,
        started_at: existing?.started_at || now,
      };
      if (isCompleted && !existing?.completed) {
        upsertData.completed_at = now;
      }
      if (!mission.require_optin) {
        upsertData.opted_in = true;
      }

      await supabase.from('player_mission_progress').upsert(
        upsertData, { onConflict: 'cpf,mission_id' }
      );
      missionsUpdated++;
      if (isCompleted && !existing?.completed) {
        missionsCompleted++;

        // Auto-reward if not manual_claim
        if (!mission.manual_claim && mission.reward_value > 0) {
          if (mission.reward_type === 'coins') {
            const { data: w } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
            if (w) await supabase.from('player_wallets').update({ coins: (w.coins || 0) + mission.reward_value } as Record<string, unknown>).eq('cpf', playerCpf);
          } else if (mission.reward_type === 'xp') {
            const { data: w } = await supabase.from('player_wallets').select('xp').eq('cpf', playerCpf).maybeSingle();
            if (w) await supabase.from('player_wallets').update({ xp: (w.xp || 0) + mission.reward_value } as Record<string, unknown>).eq('cpf', playerCpf);
          } else {
            await supabase.from('player_rewards_pending').insert({
              cpf: playerCpf, reward_type: mission.reward_type,
              reward_value: mission.reward_value, source: mission.name,
              description: `Missão completada: ${mission.name}`,
            } as Record<string, unknown>);
          }
          await supabase.from('player_mission_progress').update({
            claimed: true, claimed_at: now,
          } as Record<string, unknown>).eq('cpf', playerCpf).eq('mission_id', mission.id);

          try {
            await supabase.from('player_activity_log').insert({
              cpf: playerCpf, type: 'mission_complete',
              amount: mission.reward_value, source: mission.name,
              description: `Missão completada: ${mission.name} — ${mission.reward_type} ${mission.reward_value}`,
            } as Record<string, unknown>);
          } catch { /* ignore */ }
        }
      }
    }
  }

  // -- ACHIEVEMENTS --
  if (matchingAchConditions.length > 0) {
    const now = new Date().toISOString();
    const { data: achievements } = await supabase
      .from('achievements')
      .select('*')
      .eq('active', true)
      .in('condition_type', matchingAchConditions);

    for (const ach of (achievements || [])) {
      if (ach.segment_id && !playerSegmentIds.has(ach.segment_id)) continue;
      if (ach.start_date && now < ach.start_date) continue;
      if (ach.end_date && now > ach.end_date) continue;

      const { data: existing } = await supabase
        .from('player_achievements')
        .select('*')
        .eq('cpf', playerCpf)
        .eq('achievement_id', ach.id)
        .maybeSingle();

      if (existing?.completed) continue;

      const currentProgress = existing?.progress || 0;
      const target = ach.condition_value || 1;

      // For first_deposit, just mark complete
      let newProgress: number;
      if (ach.condition_type === 'first_deposit') {
        newProgress = target;
      } else {
        newProgress = Math.min(currentProgress + (eventValue || 1), target);
      }

      const isCompleted = newProgress >= target;

      await supabase.from('player_achievements').upsert({
        cpf: playerCpf,
        achievement_id: ach.id,
        progress: newProgress,
        completed: isCompleted,
        completed_at: isCompleted ? now : null,
      } as Record<string, unknown>, { onConflict: 'cpf,achievement_id' });

      achievementsUpdated++;
      if (isCompleted) {
        achievementsCompleted++;

        // Auto-reward
        if (ach.reward_value > 0) {
          if (ach.reward_type === 'coins') {
            const { data: w } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
            if (w) await supabase.from('player_wallets').update({ coins: (w.coins || 0) + ach.reward_value } as Record<string, unknown>).eq('cpf', playerCpf);
          } else if (ach.reward_type === 'xp') {
            const { data: w } = await supabase.from('player_wallets').select('xp').eq('cpf', playerCpf).maybeSingle();
            if (w) await supabase.from('player_wallets').update({ xp: (w.xp || 0) + ach.reward_value } as Record<string, unknown>).eq('cpf', playerCpf);
          } else {
            await supabase.from('player_rewards_pending').insert({
              cpf: playerCpf, reward_type: ach.reward_type,
              reward_value: ach.reward_value, source: ach.name,
              description: `Conquista desbloqueada: ${ach.name}`,
            } as Record<string, unknown>);
          }

          try {
            await supabase.from('player_activity_log').insert({
              cpf: playerCpf, type: 'achievement_unlock',
              amount: ach.reward_value, source: ach.name,
              description: `Conquista: ${ach.name} — ${ach.reward_type} ${ach.reward_value}`,
            } as Record<string, unknown>);
          } catch { /* ignore */ }
        }
      }
    }
  }

  // -- XP + LEVEL-UP (on bet/deposit events) --
  let xpEarned = 0;
  let newLevel = 0;
  let leveledUp = false;

  if ((eventType === 'bet' || eventType === 'deposit') && eventValue > 0) {
    try {
      // Get XP weights
      const { data: xpConfigs } = await supabase.from('xp_config').select('*').eq('active', true);
      const apostaWeight = xpConfigs?.find((c: Record<string, unknown>) => c.action === 'aposta')?.xp_per_real ?? 1;
      const depositoWeight = xpConfigs?.find((c: Record<string, unknown>) => c.action === 'deposito')?.xp_per_real ?? 0.3;

      const weight = eventType === 'bet' ? apostaWeight : depositoWeight;
      xpEarned = Math.floor(eventValue * (weight as number));

      if (xpEarned > 0) {
        // Get or create wallet
        let { data: wallet } = await supabase.from('player_wallets')
          .select('*').eq('cpf', playerCpf).maybeSingle();

        if (!wallet) {
          await supabase.from('player_wallets').insert({
            cpf: playerCpf, coins: 0, xp: 0, level: 1, diamonds: 0,
            total_xp_earned: 0, total_diamonds_earned: 0,
          } as Record<string, unknown>);
          wallet = { cpf: playerCpf, coins: 0, xp: 0, level: 1, diamonds: 0, total_xp_earned: 0, total_diamonds_earned: 0 };
        }

        const currentTotalXp = (wallet.total_xp_earned || 0) + xpEarned;
        const currentXp = (wallet.xp || 0) + xpEarned;
        const currentLevel = wallet.level || 1;

        // Check level-ups
        const { data: levels } = await supabase.from('levels')
          .select('*').gt('level', currentLevel).order('level', { ascending: true });

        let bonusCoins = 0;
        let bonusDiamonds = 0;
        newLevel = currentLevel;
        const levelsGained: Record<string, unknown>[] = [];

        for (const lvl of (levels || [])) {
          if (currentTotalXp >= lvl.xp_required) {
            newLevel = lvl.level;
            bonusCoins += lvl.reward_coins || 0;
            bonusDiamonds += lvl.reward_diamonds || 0;
            levelsGained.push(lvl);
          } else {
            break;
          }
        }

        leveledUp = newLevel > currentLevel;

        // Update wallet
        const walletUpdate: Record<string, unknown> = {
          xp: currentXp,
          total_xp_earned: currentTotalXp,
          level: newLevel,
          updated_at: new Date().toISOString(),
        };
        if (bonusCoins > 0) walletUpdate.coins = (wallet.coins || 0) + bonusCoins;
        if (bonusDiamonds > 0) {
          walletUpdate.diamonds = (wallet.diamonds || 0) + bonusDiamonds;
          walletUpdate.total_diamonds_earned = (wallet.total_diamonds_earned || 0) + bonusDiamonds;
        }

        const { error: xpUpdateErr } = await supabase.from('player_wallets').update(walletUpdate).eq('cpf', playerCpf);
        if (xpUpdateErr) {
          console.error('XP wallet update failed:', xpUpdateErr.message, JSON.stringify(walletUpdate));
        }

        // Log XP earn
        try {
          await supabase.from('xp_history').insert({
            cpf: playerCpf, xp_earned: xpEarned, source: eventType,
            description: `${eventType} R$${eventValue.toFixed(2)} → ${xpEarned} XP`,
          } as Record<string, unknown>);
        } catch { /* ignore */ }

        // Log level-ups
        if (leveledUp) {
          for (const lvl of levelsGained) {
            try {
              await supabase.from('level_rewards_log').insert({
                cpf: playerCpf, level: lvl.level, from_level: currentLevel,
                reward_coins: lvl.reward_coins || 0, reward_diamonds: lvl.reward_diamonds || 0,
              } as Record<string, unknown>);
              await supabase.from('player_activity_log').insert({
                cpf: playerCpf, type: 'level_up', amount: lvl.level,
                source: `Level ${lvl.level} - ${lvl.tier || ''} ${lvl.name || ''}`,
                description: `Subiu para nível ${lvl.level}! +${lvl.reward_coins || 0} coins, +${lvl.reward_diamonds || 0} diamonds`,
              } as Record<string, unknown>);
            } catch { /* ignore */ }
          }
        }
      }
    } catch (e) {
      console.error('[sync_progress] XP error:', e);
    }
  }

  // -- TOURNAMENT SCORE UPDATE (on bet events) --
  let tournamentsUpdated = 0;

  if ((eventType === 'bet' || eventType === 'play_keno' || eventType === 'play_cassino') && eventValue > 0) {
    try {
      const now = new Date().toISOString();
      // Get active tournaments the player is enrolled in
      const { data: entries } = await supabase
        .from('player_tournament_entries')
        .select('id, tournament_id, score')
        .eq('cpf', playerCpf)
        .eq('opted_in', true);

      if (entries?.length) {
        const tournamentIds = entries.map((e: Record<string, unknown>) => e.tournament_id);
        const { data: tournaments } = await supabase
          .from('tournaments')
          .select('id, metric, game_filter, min_bet, points_per, start_date, end_date')
          .in('id', tournamentIds)
          .eq('status', 'ATIVO')
          .lte('start_date', now)
          .gte('end_date', now);

        for (const t of (tournaments || [])) {
          // Check game filter match
          if (t.game_filter === 'keno' && eventType === 'play_cassino') continue;
          if (t.game_filter === 'cassino' && eventType === 'play_keno') continue;

          // Check min bet
          if (t.min_bet && eventValue < Number(t.min_bet)) continue;

          // Calculate score increment
          const metric = t.metric || 'total_bet';
          if (metric === 'total_bet' && eventType !== 'bet' && eventType !== 'play_keno' && eventType !== 'play_cassino') continue;

          const divisor = t.points_per === '1_centavo' ? 0.01 : t.points_per === '10_centavos' ? 0.1 : 1;
          const scoreIncrement = Math.floor(eventValue / divisor);

          if (scoreIncrement > 0) {
            const entry = entries.find((e: Record<string, unknown>) => e.tournament_id === t.id);
            if (entry) {
              const newScore = ((entry as Record<string, unknown>).score as number || 0) + scoreIncrement;
              await supabase.from('player_tournament_entries')
                .update({ score: newScore, updated_at: new Date().toISOString() } as Record<string, unknown>)
                .eq('id', (entry as Record<string, unknown>).id);
              tournamentsUpdated++;
            }
          }
        }

        // Recalculate ranks for updated tournaments
        if (tournamentsUpdated > 0) {
          for (const t of (tournaments || [])) {
            const { data: allEntries } = await supabase
              .from('player_tournament_entries')
              .select('id, score')
              .eq('tournament_id', t.id)
              .order('score', { ascending: false });
            if (allEntries) {
              for (let i = 0; i < allEntries.length; i++) {
                await supabase.from('player_tournament_entries')
                  .update({ rank: i + 1 } as Record<string, unknown>)
                  .eq('id', allEntries[i].id);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('[sync_progress] Tournament error:', e);
    }
  }

  return new Response(JSON.stringify({
    success: true,
    missions_updated: missionsUpdated,
    missions_completed: missionsCompleted,
    achievements_updated: achievementsUpdated,
    achievements_completed: achievementsCompleted,
    xp_earned: xpEarned,
    leveled_up: leveledUp,
    new_level: newLevel || undefined,
    tournaments_updated: tournamentsUpdated,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
