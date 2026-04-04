import { HandlerContext, ReferralConfig, processReferralRewards } from './types.js';

export async function handleReferralGenerate(ctx: HandlerContext): Promise<Response> {
  const { supabase, playerCpf, corsHeaders } = ctx;

  if (!playerCpf) {
    return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // Check if player already has a code
  const { data: existing } = await supabase.from('referral_codes').select('*').eq('cpf', playerCpf).maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ code: existing.code, custom_code: existing.custom_code, clicks: existing.clicks }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // Generate unique code
  const code = 'PBR' + playerCpf.slice(-4) + Math.random().toString(36).substring(2, 6).toUpperCase();
  const { data: newCode, error: codeErr } = await supabase.from('referral_codes')
    .insert({ cpf: playerCpf, code } as Record<string, unknown>).select().single();
  if (codeErr) {
    return new Response(JSON.stringify({ error: codeErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ code: newCode.code, clicks: 0 }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleReferralClick(ctx: HandlerContext): Promise<Response> {
  const { supabase, url, corsHeaders } = ctx;

  const refCode = url.searchParams.get('code') || '';
  if (!refCode) {
    return new Response(JSON.stringify({ error: 'code obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  await supabase.from('referral_codes').update({ clicks: supabase.rpc ? undefined : 0 } as Record<string, unknown>).eq('code', refCode);
  // Increment clicks via raw update
  const { data: rc } = await supabase.from('referral_codes').select('clicks').eq('code', refCode).maybeSingle();
  if (rc) {
    await supabase.from('referral_codes').update({ clicks: (rc.clicks || 0) + 1 } as Record<string, unknown>).eq('code', refCode);
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleReferralRegister(ctx: HandlerContext): Promise<Response> {
  const { supabase, url, playerCpf, corsHeaders } = ctx;

  if (!playerCpf) {
    return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const refCode = url.searchParams.get('code') || '';
  if (!refCode) {
    return new Response(JSON.stringify({ error: 'code obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // Find referral code owner
  const { data: codeData } = await supabase.from('referral_codes').select('*').eq('code', refCode).maybeSingle();
  if (!codeData) {
    return new Response(JSON.stringify({ error: 'Código de indicação inválido' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // Can't refer yourself
  if (codeData.cpf === playerCpf) {
    return new Response(JSON.stringify({ error: 'Você não pode se auto-indicar' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // Check if already referred
  const { data: existingRef } = await supabase.from('referrals').select('id').eq('referred_cpf', playerCpf).maybeSingle();
  if (existingRef) {
    return new Response(JSON.stringify({ error: 'Você já foi indicado por outro jogador' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // Check max referrals limit
  const { data: config } = await supabase.from('referral_config').select('*').eq('active', true).limit(1).maybeSingle();
  if (config?.max_referrals_per_player && config.max_referrals_per_player > 0) {
    const { count } = await supabase.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_cpf', codeData.cpf);
    if ((count || 0) >= config.max_referrals_per_player) {
      return new Response(JSON.stringify({ error: 'Este jogador atingiu o limite de indicações' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
  // Create referral — determine initial status based on requirements
  let status = 'completed';
  if (config?.require_deposit) status = 'deposit_required';
  else if (config?.require_bet) status = 'bet_required';

  const commissionExpires = config?.commission_enabled && config?.commission_duration_days
    ? new Date(Date.now() + config.commission_duration_days * 86400000).toISOString()
    : null;
  const { data: referral, error: refErr } = await supabase.from('referrals').insert({
    referrer_cpf: codeData.cpf,
    referred_cpf: playerCpf,
    referral_code_id: codeData.id,
    status,
    commission_expires_at: commissionExpires,
  } as Record<string, unknown>).select().single();
  if (refErr) {
    return new Response(JSON.stringify({ error: refErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // If no requirements, reward immediately
  if (status === 'completed' && referral) {
    await processReferralRewards(supabase, referral.id, codeData.cpf, playerCpf, config as ReferralConfig);
  }
  return new Response(JSON.stringify({ ok: true, status, referral_id: referral?.id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleReferralCheck(ctx: HandlerContext): Promise<Response> {
  const { supabase, playerCpf, corsHeaders } = ctx;

  if (!playerCpf) {
    return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // Find pending referral where this player is the referred
  const { data: pendingRef } = await supabase.from('referrals').select('*')
    .eq('referred_cpf', playerCpf)
    .in('status', ['deposit_required', 'bet_required'])
    .maybeSingle();
  if (!pendingRef) {
    return new Response(JSON.stringify({ ok: true, message: 'Sem indicação pendente' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { data: config } = await supabase.from('referral_config').select('*').eq('active', true).limit(1).maybeSingle();
  if (!config) {
    return new Response(JSON.stringify({ ok: true, message: 'Config inativa' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let newStatus = pendingRef.status;
  const updates: Record<string, unknown> = {};

  // Check deposit if required and not yet fulfilled
  if (pendingRef.status === 'deposit_required' && config.require_deposit) {
    const { data: wallet } = await supabase.from('player_wallets').select('total_deposited').eq('cpf', playerCpf).maybeSingle();
    const totalDeposited = wallet?.total_deposited || 0;
    if (totalDeposited >= (config.min_deposit_amount || 0)) {
      updates.referred_first_deposit = totalDeposited;
      updates.referred_first_deposit_at = new Date().toISOString();
      if (config.require_bet) {
        newStatus = 'bet_required';
      } else {
        newStatus = 'completed';
      }
    }
  }

  // Check bet if required and status is bet_required (or just became bet_required)
  if (newStatus === 'bet_required' && config.require_bet) {
    const { data: wallet } = await supabase.from('player_wallets').select('total_bet').eq('cpf', playerCpf).maybeSingle();
    const totalBet = wallet?.total_bet || 0;
    if (totalBet >= (config.min_bet_amount || 0)) {
      updates.referred_first_bet = totalBet;
      updates.referred_first_bet_at = new Date().toISOString();
      newStatus = 'completed';
    }
  }

  // Update if status changed
  if (newStatus !== pendingRef.status || Object.keys(updates).length > 0) {
    updates.status = newStatus;
    if (newStatus === 'completed') {
      updates.completed_at = new Date().toISOString();
    }
    await supabase.from('referrals').update(updates).eq('id', pendingRef.id);
    // Process rewards if completed
    if (newStatus === 'completed') {
      await processReferralRewards(supabase, pendingRef.id, pendingRef.referrer_cpf, playerCpf, config as ReferralConfig);
    }
  }
  return new Response(JSON.stringify({ ok: true, status: newStatus, previous: pendingRef.status }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleReferralClaimTier(ctx: HandlerContext): Promise<Response> {
  const { supabase, url, playerCpf, corsHeaders } = ctx;

  if (!playerCpf) {
    return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const tierIdx = parseInt(url.searchParams.get('tier') || '-1');
  if (tierIdx < 0) {
    return new Response(JSON.stringify({ error: 'tier obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { data: config } = await supabase.from('referral_config').select('*').eq('active', true).limit(1).maybeSingle();
  const tiers = config?.tiers || [];
  if (tierIdx >= tiers.length) {
    return new Response(JSON.stringify({ error: 'Tier inválido' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const tier = tiers[tierIdx];
  // Count completed referrals
  const { count: completedCount } = await supabase.from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_cpf', playerCpf)
    .eq('status', 'completed');
  if ((completedCount || 0) < tier.min_referrals) {
    return new Response(JSON.stringify({ error: `Você precisa de ${tier.min_referrals} indicações completas` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // Check if already claimed (store in activity_log)
  const { data: alreadyClaimed } = await supabase.from('player_activity_log')
    .select('id').eq('cpf', playerCpf).eq('source', `referral_tier_${tierIdx}`).maybeSingle();
  if (alreadyClaimed) {
    return new Response(JSON.stringify({ error: 'Recompensa de tier já resgatada' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // Award tier reward
  const { data: w } = await supabase.from('player_wallets').select('*').eq('cpf', playerCpf).maybeSingle();
  if (tier.reward_type === 'coins') {
    await supabase.from('player_wallets').update({ coins: (w?.coins || 0) + tier.reward_value, total_coins_earned: (w?.total_coins_earned || 0) + tier.reward_value } as Record<string, unknown>).eq('cpf', playerCpf);
  } else if (tier.reward_type === 'diamonds') {
    await supabase.from('player_wallets').update({ diamonds: (w?.diamonds || 0) + tier.reward_value } as Record<string, unknown>).eq('cpf', playerCpf);
  } else if (tier.reward_type === 'xp') {
    await supabase.from('player_wallets').update({ xp: (w?.xp || 0) + tier.reward_value, total_xp_earned: (w?.total_xp_earned || 0) + tier.reward_value } as Record<string, unknown>).eq('cpf', playerCpf);
  }
  // Log
  await supabase.from('player_activity_log').insert({
    cpf: playerCpf, type: 'referral', amount: tier.reward_value,
    source: `referral_tier_${tierIdx}`, description: `Bônus tier: ${tier.label}`,
  } as Record<string, unknown>);
  return new Response(JSON.stringify({ ok: true, reward_type: tier.reward_type, reward_value: tier.reward_value }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
