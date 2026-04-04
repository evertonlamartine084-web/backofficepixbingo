import { HandlerContext, MiniGamePrize, GameCell } from './types.js';

export async function handlePlayMiniGame(ctx: HandlerContext): Promise<Response> {
  const { supabase, url, playerCpf, corsHeaders } = ctx;

  if (!playerCpf) {
    return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const gameId = url.searchParams.get('game_id');
  if (!gameId) {
    return new Response(JSON.stringify({ error: 'game_id obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get game config
  const { data: game } = await supabase.from('mini_games').select('*').eq('id', gameId).eq('active', true).single();
  if (!game) {
    return new Response(JSON.stringify({ error: 'Jogo não encontrado' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get/create attempt record
  const today = new Date().toISOString().slice(0, 10);
  let { data: attemptRec } = await supabase.from('player_mini_game_attempts')
    .select('*').eq('cpf', playerCpf).eq('game_id', gameId).maybeSingle();

  if (!attemptRec) {
    const { data: newRec } = await supabase.from('player_mini_game_attempts')
      .upsert({ cpf: playerCpf, game_id: gameId, attempts_today: 0, last_attempt_date: today, total_attempts: 0 } as Record<string, unknown>, { onConflict: 'cpf,game_id' })
      .select().single();
    attemptRec = newRec;
  }

  // Reset if new day
  if (attemptRec && attemptRec.last_attempt_date !== today) {
    attemptRec.attempts_today = 0;
  }

  const attemptsUsed = attemptRec?.attempts_today || 0;
  const maxAttempts = game.max_attempts_per_day || 1;
  const freeAttempts = game.free_attempts_per_day || 1;

  // Check max
  if (maxAttempts > 0 && attemptsUsed >= maxAttempts) {
    return new Response(JSON.stringify({ error: 'Limite de tentativas atingido', max: maxAttempts }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check coin cost
  const purchasedAttempts = attemptRec?.purchased_attempts || 0;
  const isFree = attemptsUsed < freeAttempts;
  const hasPurchased = purchasedAttempts > 0;
  let coinsCost = 0;
  if (!isFree && !hasPurchased && game.attempt_cost_coins > 0) {
    coinsCost = game.attempt_cost_coins;
    const { data: wallet } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
    if (!wallet || (wallet.coins || 0) < coinsCost) {
      return new Response(JSON.stringify({ error: 'Moedas insuficientes', cost: coinsCost, balance: wallet?.coins || 0 }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    await supabase.from('player_wallets').update({ coins: (wallet.coins || 0) - coinsCost } as Record<string, unknown>).eq('cpf', playerCpf);
  }

  // Get prizes
  const { data: prizes } = await supabase.from('mini_game_prizes')
    .select('*').eq('game_id', gameId).eq('active', true).order('sort_order');

  if (!prizes || prizes.length === 0) {
    return new Response(JSON.stringify({ error: 'Nenhum prêmio configurado' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Weighted random selection
  const totalWeight = prizes.reduce((s: number, p: Record<string, unknown>) => s + ((p.probability as number) || 1), 0);
  let random = Math.random() * totalWeight;
  let selected = prizes[0];
  for (const prize of prizes) {
    random -= (prize.probability || 1);
    if (random <= 0) { selected = prize; break; }
  }

  // Update attempt record
  const upsertData: Record<string, unknown> = {
    cpf: playerCpf,
    game_id: gameId,
    attempts_today: attemptsUsed + 1,
    last_attempt_date: today,
    total_attempts: (attemptRec?.total_attempts || 0) + 1,
  };
  // Decrement purchased_attempts if this was a purchased play
  if (!isFree && hasPurchased) {
    upsertData.purchased_attempts = purchasedAttempts - 1;
  }
  await supabase.from('player_mini_game_attempts')
    .upsert(upsertData, { onConflict: 'cpf,game_id' });

  // Award prize
  if (selected.type === 'coins' && selected.value > 0) {
    const { data: w } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
    await supabase.from('player_wallets').update({ coins: (w?.coins || 0) + selected.value } as Record<string, unknown>).eq('cpf', playerCpf);
  } else if (selected.type === 'xp' && selected.value > 0) {
    const { data: w } = await supabase.from('player_wallets').select('xp, total_xp_earned').eq('cpf', playerCpf).maybeSingle();
    await supabase.from('player_wallets').update({ xp: (w?.xp || 0) + selected.value, total_xp_earned: (w?.total_xp_earned || 0) + selected.value } as Record<string, unknown>).eq('cpf', playerCpf);
  } else if (selected.type === 'diamonds' && selected.value > 0) {
    const { data: w } = await supabase.from('player_wallets').select('diamonds, total_diamonds_earned').eq('cpf', playerCpf).maybeSingle();
    await supabase.from('player_wallets').update({ diamonds: (w?.diamonds || 0) + selected.value, total_diamonds_earned: (w?.total_diamonds_earned || 0) + selected.value } as Record<string, unknown>).eq('cpf', playerCpf);
  } else if ((selected.type === 'bonus' || selected.type === 'free_bet') && selected.value > 0) {
    try {
      await supabase.from('player_rewards_pending').insert({
        cpf: playerCpf,
        reward_type: selected.type,
        reward_value: selected.value,
        source: game.name,
        description: `${selected.label} - ${game.name}`,
      } as Record<string, unknown>);
    } catch { /* ignore */ }
  }

  // Log activity
  try {
    await supabase.from('player_activity_log').insert({
      cpf: playerCpf,
      type: game.type,
      amount: selected.type === 'nothing' ? 0 : selected.value,
      source: game.name,
      description: `${game.name}: ${selected.label}`,
    } as Record<string, unknown>);
  } catch { /* ignore */ }

  // For scratch card: return 9 cells (3 winning + 6 random), shuffled
  const gameData: Record<string, unknown> = {};
  if (game.type === 'scratch_card') {
    const cells: GameCell[] = [];
    for (let i = 0; i < 3; i++) cells.push({ prize: selected, winning: true });
    const others = prizes.filter((p: MiniGamePrize) => p.id !== selected.id);
    for (let i = 0; i < 6; i++) {
      cells.push({ prize: others[i % Math.max(1, others.length)] || selected, winning: false });
    }
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    gameData.cells = cells;
  } else if (game.type === 'gift_box') {
    const numBoxes = 6;
    const boxes: GameCell[] = [];
    boxes.push({ prize: selected, winning: true });
    const nothing = prizes.find((p: MiniGamePrize) => p.type === 'nothing') || { label: 'Tente novamente', type: 'nothing', value: 0 } as MiniGamePrize;
    for (let i = 0; i < numBoxes - 1; i++) {
      boxes.push({ prize: nothing, winning: false });
    }
    for (let i = boxes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [boxes[i], boxes[j]] = [boxes[j], boxes[i]];
    }
    gameData.boxes = boxes;
  }

  return new Response(JSON.stringify({
    prize: selected,
    prizes,
    game_type: game.type,
    game_data: gameData,
    attempts_used: attemptsUsed + 1,
    max_attempts: maxAttempts,
    free_attempts: freeAttempts,
    coins_spent: coinsCost,
    purchased_remaining: hasPurchased && !isFree ? purchasedAttempts - 1 : purchasedAttempts,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
