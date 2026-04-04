import {
  HandlerContext, platformLogin, buildPlatformHeaders,
  searchPlayerByCpf, creditBonusOnPlatform,
} from './types.js';

export async function handleStoreBuy(ctx: HandlerContext): Promise<Response> {
  const { supabase, url, playerCpf, corsHeaders } = ctx;

  if (!playerCpf) {
    return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const itemId = url.searchParams.get('item_id');
  if (!itemId) {
    return new Response(JSON.stringify({ error: 'item_id obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: item } = await supabase.from('store_items').select('*').eq('id', itemId).single();
  if (!item || !item.active) {
    return new Response(JSON.stringify({ error: 'Item não encontrado ou inativo' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check stock
  if (item.stock !== null && item.stock <= 0) {
    return new Response(JSON.stringify({ error: 'Item fora de estoque' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check purchase limits
  if (item.purchase_limit && item.purchase_limit > 0) {
    const limitPeriod = item.limit_period || 'total';
    let sinceDate: string | null = null;
    const nowDate = new Date();
    if (limitPeriod === 'day') sinceDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).toISOString();
    else if (limitPeriod === 'week') { const d = new Date(nowDate); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); sinceDate = d.toISOString(); }
    else if (limitPeriod === 'month') sinceDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).toISOString();

    let countQuery = supabase.from('store_purchases').select('id', { count: 'exact', head: true })
      .eq('cpf', playerCpf).eq('store_item_id', itemId);
    if (sinceDate) countQuery = countQuery.gte('created_at', sinceDate);
    const { count: purchaseCount } = await countQuery;

    if ((purchaseCount || 0) >= item.purchase_limit) {
      const periodLabels: Record<string, string> = { day: 'hoje', week: 'esta semana', month: 'este mês', total: 'no total' };
      return new Response(JSON.stringify({ error: `Limite de compra atingido (${item.purchase_limit}x ${periodLabels[limitPeriod] || periodLabels.total})` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // Check min level
  if (item.min_level && item.min_level > 1) {
    const { data: pw } = await supabase.from('player_wallets').select('level').eq('cpf', playerCpf).maybeSingle();
    if ((pw?.level || 1) < item.min_level) {
      return new Response(JSON.stringify({ error: `Nível mínimo ${item.min_level} necessário (seu nível: ${pw?.level || 1})` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // Check wallet
  const { data: wallet } = await supabase.from('player_wallets').select('*').eq('cpf', playerCpf).maybeSingle();
  const coins = wallet?.coins || 0;
  const diamonds = wallet?.diamonds || 0;
  const xp = wallet?.xp || 0;
  if (item.price_coins > 0 && coins < item.price_coins) {
    return new Response(JSON.stringify({ error: 'Moedas insuficientes', cost: item.price_coins, balance: coins }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (item.price_diamonds > 0 && diamonds < item.price_diamonds) {
    return new Response(JSON.stringify({ error: 'Diamantes insuficientes', cost: item.price_diamonds, balance: diamonds }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (item.price_xp > 0 && xp < item.price_xp) {
    return new Response(JSON.stringify({ error: 'Gems insuficientes', cost: item.price_xp, balance: xp }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Deduct coins, diamonds, and gems (xp)
  const walletUpdate: Record<string, unknown> = {};
  if (item.price_coins > 0) walletUpdate.coins = coins - item.price_coins;
  if (item.price_diamonds > 0) walletUpdate.diamonds = diamonds - item.price_diamonds;
  if (item.price_xp > 0) walletUpdate.xp = xp - item.price_xp;
  if (Object.keys(walletUpdate).length > 0) {
    await supabase.from('player_wallets')
      .update(walletUpdate)
      .eq('cpf', playerCpf);
  }

  // Determine reward type and value
  const rewardType = item.reward_type || 'bonus';
  const rewardValue = item.reward_value || '';
  let deliveryStatus = 'pending';
  let deliveryNote = '';

  // Process reward based on type
  if (['bonus', 'free_bet', 'cartelas'].includes(rewardType)) {
    const numericValue = parseFloat(rewardValue.replace(/[^\d.,]/g, '').replace(',', '.'));
    if (numericValue > 0) {
      try {
        const { data: config } = await supabase.from('platform_config')
          .select('*').eq('active', true).order('created_at', { ascending: false }).limit(1).single();
        if (config) {
          const loginDomain = (config.site_url || '').replace(/\/+$/, '');
          const loginResult = await platformLogin(loginDomain, config.username, config.password, config.login_url);
          if (loginResult.success) {
            const headers = buildPlatformHeaders(loginResult.cookies, loginDomain);
            const playerSearch = await searchPlayerByCpf(loginDomain, headers, playerCpf);
            const playerUuid = playerSearch.uuid;
            if (playerUuid) {
              const creditResult = await creditBonusOnPlatform(loginDomain, headers, playerUuid, numericValue, config.password);
              if (creditResult.success) {
                deliveryStatus = 'delivered';
                deliveryNote = `Creditado R$${numericValue.toFixed(2)} (${rewardType}) na plataforma`;
              } else {
                deliveryNote = `Erro ao creditar: ${creditResult.msg}`;
              }
            } else {
              deliveryNote = 'UUID do jogador não encontrado na plataforma';
            }
          } else {
            deliveryNote = 'Falha no login da plataforma';
          }
        } else {
          deliveryNote = 'Config da plataforma não encontrada';
        }
      } catch (e: unknown) {
        deliveryNote = `Erro: ${e instanceof Error ? e.message : 'Erro'}`;
      }
    } else {
      deliveryNote = 'Valor inválido para crédito';
    }
  } else if (rewardType === 'coins') {
    const bonusCoins = parseInt(rewardValue) || 0;
    if (bonusCoins > 0) {
      const newBalance = (coins - (item.price_coins || 0)) + bonusCoins;
      await supabase.from('player_wallets')
        .update({ coins: newBalance } as Record<string, unknown>)
        .eq('cpf', playerCpf);
      deliveryStatus = 'delivered';
      deliveryNote = `+${bonusCoins} moedas adicionadas`;
    }
  } else if (rewardType === 'xp') {
    const bonusXp = parseInt(rewardValue) || 0;
    if (bonusXp > 0) {
      const { data: w } = await supabase.from('player_wallets').select('xp').eq('cpf', playerCpf).maybeSingle();
      await supabase.from('player_wallets')
        .update({ xp: (w?.xp || 0) + bonusXp } as Record<string, unknown>)
        .eq('cpf', playerCpf);
      deliveryStatus = 'delivered';
      deliveryNote = `+${bonusXp} XP adicionado`;
    }
  } else if (rewardType === 'diamonds') {
    const bonusDiamonds = parseInt(rewardValue) || 0;
    if (bonusDiamonds > 0) {
      const { data: w } = await supabase.from('player_wallets').select('diamonds, total_diamonds_earned').eq('cpf', playerCpf).maybeSingle();
      await supabase.from('player_wallets')
        .update({
          diamonds: (w?.diamonds || 0) + bonusDiamonds,
          total_diamonds_earned: (w?.total_diamonds_earned || 0) + bonusDiamonds,
        } as Record<string, unknown>)
        .eq('cpf', playerCpf);
      deliveryStatus = 'delivered';
      deliveryNote = `+${bonusDiamonds} diamantes adicionados`;
    }
  } else if (rewardType === 'gem_chest' || rewardType === 'gem_roulette' || rewardType === 'diamond_chest') {
    // Credit purchased_attempts to the corresponding mini-game
    const gameIdMap: Record<string, string> = {
      gem_chest: 'a1111111-1111-1111-1111-111111111111',
      gem_roulette: 'b2222222-2222-2222-2222-222222222222',
      diamond_chest: 'c3333333-3333-3333-3333-333333333333',
    };
    const targetGameId = gameIdMap[rewardType];
    const qty = parseInt(rewardValue) || 1;
    // Get or create attempt record
    const { data: attRec } = await supabase.from('player_mini_game_attempts')
      .select('*').eq('cpf', playerCpf).eq('game_id', targetGameId).maybeSingle();
    if (attRec) {
      await supabase.from('player_mini_game_attempts')
        .update({ purchased_attempts: (attRec.purchased_attempts || 0) + qty } as Record<string, unknown>)
        .eq('cpf', playerCpf).eq('game_id', targetGameId);
    } else {
      await supabase.from('player_mini_game_attempts')
        .insert({ cpf: playerCpf, game_id: targetGameId, attempts_today: 0, last_attempt_date: new Date().toISOString().slice(0, 10), total_attempts: 0, purchased_attempts: qty } as Record<string, unknown>);
    }
    const gameLabels: Record<string, string> = { gem_chest: 'Baú de Gemas', gem_roulette: 'Roleta de Gemas', diamond_chest: 'Baú de Diamante' };
    deliveryStatus = 'delivered';
    deliveryNote = `+${qty} abertura(s) no ${gameLabels[rewardType]}`;
  } else if (rewardType === 'bonus_deposit') {
    // Saldo Real -> credit on platform
    const numericValue = parseFloat(rewardValue.replace(/[^\d.,]/g, '').replace(',', '.'));
    if (numericValue > 0) {
      try {
        const { data: config } = await supabase.from('platform_config')
          .select('*').eq('active', true).order('created_at', { ascending: false }).limit(1).single();
        if (config) {
          const loginDomain = (config.site_url || '').replace(/\/+$/, '');
          const loginResult = await platformLogin(loginDomain, config.username, config.password, config.login_url);
          if (loginResult.success) {
            const headers = buildPlatformHeaders(loginResult.cookies, loginDomain);
            const playerSearch = await searchPlayerByCpf(loginDomain, headers, playerCpf);
            if (playerSearch.uuid) {
              const creditResult = await creditBonusOnPlatform(loginDomain, headers, playerSearch.uuid, numericValue, config.password);
              if (creditResult.success) {
                deliveryStatus = 'delivered';
                deliveryNote = `Creditado R$${numericValue.toFixed(2)} (saldo real) na plataforma`;
              } else {
                deliveryNote = `Erro ao creditar: ${creditResult.msg}`;
              }
            } else {
              deliveryNote = 'UUID do jogador não encontrado na plataforma';
            }
          } else {
            deliveryNote = 'Falha no login da plataforma';
          }
        } else {
          deliveryNote = 'Config da plataforma não encontrada';
        }
      } catch (e: unknown) {
        deliveryNote = `Erro: ${e instanceof Error ? e.message : 'Erro'}`;
      }
    } else {
      deliveryNote = 'Valor inválido para crédito';
    }
  } else if (rewardType === 'free_spins') {
    // Giros gratis -> entrega manual
    await supabase.from('player_rewards_pending').insert({
      cpf: playerCpf,
      reward_type: rewardType,
      reward_value: rewardValue ? parseFloat(rewardValue) || 0 : 0,
      source: 'Loja',
      source_id: itemId,
      description: `${item.name} — Giros grátis`,
    } as Record<string, unknown>);
    deliveryStatus = 'pending_manual';
    deliveryNote = `${rewardValue} giro(s) grátis — aguardando entrega`;
  } else if (rewardType === 'physical' || rewardType === 'coupon') {
    await supabase.from('player_rewards_pending').insert({
      cpf: playerCpf,
      reward_type: rewardType,
      reward_value: rewardValue ? parseFloat(rewardValue.replace(/[^\d.,]/g, '').replace(',', '.')) || 0 : 0,
      source: 'Loja',
      source_id: itemId,
      description: `${item.name}${rewardType === 'coupon' ? ' — Cupom' : ' — Entrega física'}`,
    } as Record<string, unknown>);
    deliveryStatus = 'pending_manual';
    deliveryNote = rewardType === 'coupon' ? 'Cupom gerado, aguardando entrega' : 'Item físico, aguardando entrega';
  }

  // Record purchase with delivery status
  await supabase.from('store_purchases').insert({
    cpf: playerCpf,
    store_item_id: itemId,
    price_coins: item.price_coins || 0,
    price_diamonds: item.price_diamonds || 0,
    price_xp: item.price_xp || 0,
    status: deliveryStatus,
    reward_type: rewardType,
    reward_value: rewardValue,
    delivered_at: deliveryStatus === 'delivered' ? new Date().toISOString() : null,
    delivery_note: deliveryNote,
  } as Record<string, unknown>);

  // Reduce stock
  if (item.stock !== null) {
    await supabase.from('store_items').update({ stock: item.stock - 1 } as Record<string, unknown>).eq('id', itemId);
  }

  // Log
  try {
    await supabase.from('player_activity_log').insert({
      cpf: playerCpf,
      type: 'store',
      amount: -(item.price_coins || 0),
      source: 'Loja',
      source_id: itemId,
      description: `Comprou: ${item.name}`,
    } as Record<string, unknown>);
    if (deliveryStatus === 'delivered') {
      await supabase.from('player_activity_log').insert({
        cpf: playerCpf,
        type: rewardType,
        amount: parseFloat(rewardValue.replace(/[^\d.,]/g, '').replace(',', '.')) || 0,
        source: 'Loja',
        source_id: itemId,
        description: deliveryNote,
      } as Record<string, unknown>);
    }
  } catch { /* ignore */ }

  const resultMsg = deliveryStatus === 'delivered'
    ? `${item.name} entregue com sucesso!`
    : deliveryStatus === 'pending_manual'
      ? `${item.name} comprado! Entrega em processamento.`
      : `${item.name} comprado, mas houve um problema na entrega. Contate o suporte.`;

  return new Response(JSON.stringify({
    success: true,
    item_name: item.name,
    delivery_status: deliveryStatus,
    delivery_note: deliveryNote,
    message: resultMsg,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleClaimReward(ctx: HandlerContext): Promise<Response> {
  const { supabase, url, playerCpf, corsHeaders } = ctx;

  if (!playerCpf) {
    return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const rewardId = url.searchParams.get('reward_id');
  if (!rewardId) {
    return new Response(JSON.stringify({ error: 'reward_id obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: reward } = await supabase.from('player_rewards_pending')
    .select('*').eq('id', rewardId).eq('cpf', playerCpf).is('claimed_at', null).maybeSingle();
  if (!reward) {
    return new Response(JSON.stringify({ error: 'Recompensa não encontrada ou já resgatada' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Mark claimed
  await supabase.from('player_rewards_pending')
    .update({ claimed_at: new Date().toISOString() } as Record<string, unknown>)
    .eq('id', rewardId);

  // Award to wallet
  if (reward.reward_type === 'coins') {
    const { data: w } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
    await supabase.from('player_wallets')
      .update({ coins: (w?.coins || 0) + reward.reward_value } as Record<string, unknown>)
      .eq('cpf', playerCpf);
  } else if (reward.reward_type === 'xp') {
    const { data: w } = await supabase.from('player_wallets').select('xp').eq('cpf', playerCpf).maybeSingle();
    await supabase.from('player_wallets')
      .update({ xp: (w?.xp || 0) + reward.reward_value } as Record<string, unknown>)
      .eq('cpf', playerCpf);
  }

  // Log
  try {
    await supabase.from('player_activity_log').insert({
      cpf: playerCpf,
      type: reward.reward_type,
      amount: reward.reward_value,
      source: reward.source,
      description: `Resgatou: ${reward.description || reward.source}`,
    } as Record<string, unknown>);
  } catch { /* ignore */ }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
