import { HandlerContext } from './types.js';

export async function handleSpin(ctx: HandlerContext): Promise<Response> {
  const { supabase, playerCpf, segmentId, corsHeaders } = ctx;

  if (!playerCpf) {
    return new Response(JSON.stringify({ error: 'CPF do jogador é obrigatório para girar' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get wheel config
  const { data: wheelCfg } = await supabase.from('wheel_config').select('*').limit(1).maybeSingle();
  const cfg = wheelCfg || { max_spins_per_day: 3, spin_cost_coins: 0, free_spins_per_day: 1 };

  // Get/create player spins record
  const today = new Date().toISOString().slice(0, 10);
  let { data: spinRecord } = await supabase.from('player_spins').select('*').eq('cpf', playerCpf).maybeSingle();

  if (!spinRecord) {
    const { data: newRecord } = await supabase.from('player_spins')
      .upsert({ cpf: playerCpf, spins_used_today: 0, last_spin_date: today, total_spins: 0 } as Record<string, unknown>, { onConflict: 'cpf' })
      .select().single();
    spinRecord = newRecord;
  }

  // Reset if new day
  if (spinRecord && spinRecord.last_spin_date !== today) {
    spinRecord.spins_used_today = 0;
  }

  const spinsUsed = spinRecord?.spins_used_today || 0;

  // Check max spins
  if (cfg.max_spins_per_day > 0 && spinsUsed >= cfg.max_spins_per_day) {
    return new Response(JSON.stringify({ error: 'Limite de giros diários atingido', max: cfg.max_spins_per_day }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check if needs to pay coins (beyond free spins)
  const isFree = spinsUsed < (cfg.free_spins_per_day || 1);
  let coinsCost = 0;

  if (!isFree && cfg.spin_cost_coins > 0) {
    coinsCost = cfg.spin_cost_coins;
    // Check wallet balance
    const { data: wallet } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
    if (!wallet || (wallet.coins || 0) < coinsCost) {
      return new Response(JSON.stringify({ error: 'Moedas insuficientes', cost: coinsCost, balance: wallet?.coins || 0 }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Deduct coins
    await supabase.from('player_wallets').update({ coins: (wallet.coins || 0) - coinsCost } as Record<string, unknown>).eq('cpf', playerCpf);
  }

  // Get prizes
  let spinQ = supabase.from('daily_wheel_prizes')
    .select('id, label, value, type, probability, color')
    .eq('active', true);
  if (segmentId) spinQ = spinQ.or(`segment_id.eq.${segmentId},segment_id.is.null`);
  const { data: prizes } = await spinQ;

  if (!prizes || prizes.length === 0) {
    return new Response(JSON.stringify({ error: 'Nenhum prêmio configurado' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Filter out prizes with probability 0 (disabled from draw)
  const eligiblePrizes = prizes.filter(p => p.probability > 0);
  if (eligiblePrizes.length === 0) {
    return new Response(JSON.stringify({ error: 'Nenhum prêmio elegível configurado' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Weighted random selection
  const totalWeight = eligiblePrizes.reduce((s, p) => s + p.probability, 0);
  let random = Math.random() * totalWeight;
  let selected = eligiblePrizes[0];
  for (const prize of eligiblePrizes) {
    random -= prize.probability;
    if (random <= 0) { selected = prize; break; }
  }

  // Update spins record
  await supabase.from('player_spins')
    .upsert({
      cpf: playerCpf,
      spins_used_today: spinsUsed + 1,
      last_spin_date: today,
      total_spins: (spinRecord?.total_spins || 0) + 1,
    } as Record<string, unknown>, { onConflict: 'cpf' });

  // Award prize to wallet
  if (selected.type === 'coins' && selected.value > 0) {
    const { data: w } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
    await supabase.from('player_wallets').update({ coins: (w?.coins || 0) + selected.value } as Record<string, unknown>).eq('cpf', playerCpf);
  } else if (selected.type === 'xp' && selected.value > 0) {
    const { data: w } = await supabase.from('player_wallets').select('xp').eq('cpf', playerCpf).maybeSingle();
    await supabase.from('player_wallets').update({ xp: (w?.xp || 0) + selected.value } as Record<string, unknown>).eq('cpf', playerCpf);
  } else if (selected.type === 'bonus' && selected.value > 0) {
    try {
      await supabase.from('player_rewards_pending').insert({
        cpf: playerCpf,
        reward_type: 'bonus',
        reward_value: selected.value,
        source: 'Roleta Diária',
        description: `Bônus de R$${selected.value} da roleta`,
      } as Record<string, unknown>);
    } catch { /* ignore */ }
  } else if (selected.type === 'free_bet' && selected.value > 0) {
    try {
      await supabase.from('player_rewards_pending').insert({
        cpf: playerCpf,
        reward_type: 'free_bet',
        reward_value: selected.value,
        source: 'Roleta Diária',
        description: `Free bet de R$${selected.value} da roleta`,
      } as Record<string, unknown>);
    } catch { /* ignore */ }
  } else if (selected.type === 'spins' && selected.value > 0) {
    // Award extra spins by reducing spins_used_today
    const newUsed = Math.max(0, spinsUsed + 1 - selected.value);
    await supabase.from('player_spins')
      .update({ spins_used_today: newUsed } as Record<string, unknown>)
      .eq('cpf', playerCpf);
  }

  // Log activity
  try {
    await supabase.from('player_activity_log').insert({
      cpf: playerCpf,
      type: 'wheel',
      amount: selected.type === 'nothing' ? 0 : selected.value,
      source: 'Roleta Diária',
      description: `Girou a roleta e ganhou: ${selected.label}`,
    } as Record<string, unknown>);
  } catch { /* ignore */ }

  // If coins were spent, log that too
  if (coinsCost > 0) {
    try {
      await supabase.from('player_activity_log').insert({
        cpf: playerCpf,
        type: 'coins',
        amount: -coinsCost,
        source: 'Roleta Diária',
        description: `Gasto ${coinsCost} moedas para girar a roleta`,
      } as Record<string, unknown>);
    } catch { /* ignore */ }
  }

  return new Response(JSON.stringify({
    prize: selected,
    prizes: prizes,
    spins_used: spinsUsed + 1,
    max_spins: cfg.max_spins_per_day,
    free_spins: cfg.free_spins_per_day,
    coins_spent: coinsCost,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
