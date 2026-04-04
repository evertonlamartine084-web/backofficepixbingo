import { SupabaseClient } from '@supabase/supabase-js';
import {
  HandlerContext, ReferralConfig, LeaderboardEntry,
  applySegmentFilter, syncPlayerXpInline,
} from './types.js';

export async function handleData(ctx: HandlerContext): Promise<Response> {
  const { supabase, url, playerCpf, segmentId, corsHeaders, widgetEnv } = ctx;

  // Hard timeout: return empty data after 20s rather than hanging forever
  const hardTimeout = new Promise<Response>((resolve) =>
    setTimeout(() => resolve(new Response(JSON.stringify({
      achievements: [], missions: [], tournaments: [], wheel_prizes: [],
      levels: [], store_items: [], wheel_config: { max_spins_per_day: 3, spin_cost_coins: 0, free_spins_per_day: 1 },
      leaderboards: {}, wallet: null, player_spins: null, mission_progress: [],
      achievement_progress: [], activity_log: [], pending_rewards: [],
      tournament_entries: [], mini_games: [], mini_game_prizes: [], mini_game_attempts: [],
      _timeout: true,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })), 20000)
  );
  return Promise.race([dataHandler(), hardTimeout]);

  async function dataHandler() {
    const now = new Date().toISOString();

    // Auto-register referral BEFORE segment check (referral must work even if widget is hidden)
    const refCodeParam = url.searchParams.get('ref_code') || '';
    let refRegistered = false;
    if (refCodeParam && playerCpf) {
      try {
        const { data: existingRef } = await supabase.from('referrals')
          .select('id').eq('referred_cpf', playerCpf).maybeSingle();
        if (!existingRef) {
          const { data: codeData } = await supabase.from('referral_codes')
            .select('id, cpf, code').eq('code', refCodeParam).maybeSingle();
          if (codeData && codeData.cpf !== playerCpf) {
            const { data: refCfg } = await supabase.from('referral_config')
              .select('require_deposit, require_bet, referrer_reward_type, referrer_reward_value')
              .eq('active', true).limit(1).maybeSingle();
            const cfg = (refCfg || {}) as Record<string, unknown>;
            let initialStatus = 'completed';
            if (cfg.require_deposit) initialStatus = 'deposit_required';
            else if (cfg.require_bet) initialStatus = 'bet_required';
            const { error: insertErr } = await supabase.from('referrals').insert({
              referrer_cpf: codeData.cpf, referred_cpf: playerCpf,
              referral_code_id: codeData.id, status: initialStatus,
            });
            if (!insertErr) {
              refRegistered = true;
              if (initialStatus === 'completed') {
                try {
                  await supabase.rpc('add_wallet_balance', {
                    p_cpf: codeData.cpf, p_field: (cfg.referrer_reward_type as string) || 'coins', p_amount: (cfg.referrer_reward_value as number) || 100,
                  });
                } catch (_e) { /* ignore referral reward failure */ }
              }
            }
          }
        }
      } catch (_e) { /* ignore referral code processing failure */ }
    }

    // Check widget segment restriction and section toggles
    let widgetSections: Record<string, boolean> = { missions: true, achievements: true, tournaments: true, wheel: true, mini_games: true, store: true, levels: true, referrals: true };
    {
      const { data: pCfg } = await supabase.from('platform_config')
        .select('widget_segment_id, widget_sections, widget_sections_test')
        .eq('active', true)
        .limit(1)
        .maybeSingle();
      const sectionsSource = widgetEnv === 'test'
        ? (pCfg as Record<string, unknown>)?.widget_sections_test
        : (pCfg as Record<string, unknown>)?.widget_sections;
      if (sectionsSource) {
        widgetSections = { ...widgetSections, ...(sectionsSource as Record<string, boolean>) };
      }
      if (pCfg?.widget_segment_id) {
        // No CPF = can't verify segment membership = hide widget
        if (!playerCpf) {
          return new Response(JSON.stringify({ _widget_hidden: true, _ref_registered: refRegistered }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const { data: inSeg } = await supabase.from('segment_items')
          .select('id')
          .eq('segment_id', pCfg.widget_segment_id)
          .eq('cpf', playerCpf)
          .maybeSingle();
        if (!inSeg) {
          return new Response(JSON.stringify({ _widget_hidden: true, _ref_registered: refRegistered }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    const achievementsQ = supabase.from('achievements').select('id, name, description, icon_url, category, condition_type, condition_value, reward_type, reward_value, segment_id, segments(name), stages, start_date, end_date, hide_if_not_earned, manual_claim, priority')
      .eq('active', true).order('priority').order('category').order('condition_value');
    const missionsQ = supabase.from('missions').select('id, name, description, icon_url, type, condition_type, condition_value, reward_type, reward_value, segment_id, segments(name), status, priority, require_optin, time_limit_hours, start_date, end_date, recurrence, cta_text, cta_url, manual_claim')
      .in('status', ['ATIVO']).order('priority').order('type').order('condition_value');
    const tournamentsQ = supabase.from('tournaments').select('id, name, description, image_url, start_date, end_date, metric, game_filter, min_bet, prizes, status, segment_id, segments(name), require_optin, points_per, buy_in_cost, min_players, max_players, allow_late_join')
      .eq('status', 'ATIVO').lte('start_date', now).gte('end_date', now).order('end_date');
    const wheelPrizesQ = supabase.from('daily_wheel_prizes').select('id, label, value, type, probability, color, icon_url, segment_id, segments(name)')
      .eq('active', true).order('probability', { ascending: false });

    // Fire all independent queries in a single Promise.all
    const baseQueries: PromiseLike<{ data: unknown; error: unknown }>[] = [
      applySegmentFilter(achievementsQ, segmentId),          // 0
      applySegmentFilter(missionsQ, segmentId),              // 1
      applySegmentFilter(tournamentsQ, segmentId),           // 2
      applySegmentFilter(wheelPrizesQ, segmentId),           // 3
      applySegmentFilter(                                     // 4 mini_games
        supabase.from('mini_games').select('id, type, name, description, theme, config, max_attempts_per_day, free_attempts_per_day, attempt_cost_coins, segment_id, segments(name)').eq('active', true),
        segmentId
      ),
      supabase.from('levels').select('*').order('level'),          // 5
      supabase.from('store_items').select('*').eq('active', true).order('price_coins'),  // 6
      supabase.from('wheel_config').select('*').limit(1).maybeSingle(),          // 7
      supabase.from('referral_config').select('*').eq('active', true).limit(1).maybeSingle(), // 8
    ];
    if (playerCpf) {
      baseQueries.push(
        supabase.from('player_wallets').select('*').eq('cpf', playerCpf).maybeSingle(),       // 9
        supabase.from('player_spins').select('*').eq('cpf', playerCpf).maybeSingle(),         // 10
        supabase.from('player_mission_progress').select('*').eq('cpf', playerCpf),            // 11
        supabase.from('player_achievements').select('*').eq('cpf', playerCpf),                // 12
        supabase.from('player_activity_log').select('*').eq('cpf', playerCpf).order('created_at', { ascending: false }).limit(50), // 13
        supabase.from('player_rewards_pending').select('*').eq('cpf', playerCpf).is('claimed_at', null), // 14
        supabase.from('player_tournament_entries').select('*').eq('cpf', playerCpf),          // 15
        supabase.from('player_mini_game_attempts').select('*').eq('cpf', playerCpf),          // 16
        supabase.from('referral_codes').select('*').eq('cpf', playerCpf).maybeSingle(),       // 17
        supabase.from('referrals').select('*').eq('referrer_cpf', playerCpf).order('created_at', { ascending: false }), // 18
      );
    }
    const allResults = await Promise.all(baseQueries);

    const achievements = allResults[0];
    const missions = allResults[1];
    const tournaments = allResults[2];
    const wheelPrizes = allResults[3];
    const miniGamesResult = allResults[4];
    const miniGames = (miniGamesResult as { data: unknown }).data || [];

    // Get mini game prizes (depends on mini game IDs)
    const miniGameIds = (miniGames as Record<string, unknown>[]).map((g: Record<string, unknown>) => g.id);
    let miniGamePrizes: Record<string, unknown>[] = [];
    if (miniGameIds.length > 0) {
      const { data: mgp } = await supabase.from('mini_game_prizes').select('*').in('game_id', miniGameIds).eq('active', true).order('sort_order');
      miniGamePrizes = mgp || [];
    }
    const levels = allResults[5];
    const storeItems = allResults[6];
    const wheelConfigResult = allResults[7];
    const referralConfigResult = allResults[8]; // global, always fetched

    // Player-specific data
    let wallet = null;
    let playerSpins = null;
    let missionProgress: Record<string, unknown>[] = [];
    let achievementProgress: Record<string, unknown>[] = [];
    let activityLog: Record<string, unknown>[] = [];
    let pendingRewards: Record<string, unknown>[] = [];
    let tournamentEntries: Record<string, unknown>[] = [];
    let miniGameAttempts: Record<string, unknown>[] = [];
    let referralConfig: ReferralConfig | null = ((referralConfigResult as { data: unknown })?.data as ReferralConfig | null) || null;
    let referralCode: Record<string, unknown> | null = null;
    let playerReferrals: Record<string, unknown>[] = [];

    if (playerCpf) {
      const walletResult = allResults[9];
      const spinsResult = allResults[10];
      const missionProgressResult = allResults[11];
      const achievementProgressResult = allResults[12];
      const activityLogResult = allResults[13];
      const pendingRewardsResult = allResults[14];
      const tournamentEntriesResult = allResults[15];
      const miniGameAttemptsResult = allResults[16];

      wallet = (walletResult as { data: unknown })?.data || null;
      playerSpins = (spinsResult as { data: unknown })?.data || null;
      missionProgress = ((missionProgressResult as { data: unknown })?.data as Record<string, unknown>[]) || [];
      achievementProgress = ((achievementProgressResult as { data: unknown })?.data as Record<string, unknown>[]) || [];
      activityLog = ((activityLogResult as { data: unknown })?.data as Record<string, unknown>[]) || [];
      pendingRewards = ((pendingRewardsResult as { data: unknown })?.data as Record<string, unknown>[]) || [];
      tournamentEntries = ((tournamentEntriesResult as { data: unknown })?.data as Record<string, unknown>[]) || [];
      miniGameAttempts = ((miniGameAttemptsResult as { data: unknown })?.data as Record<string, unknown>[]) || [];

      // Referral player data
      const referralCodeResult = allResults[17];
      const referralsResult = allResults[18];
      referralCode = ((referralCodeResult as { data: unknown })?.data as Record<string, unknown>) || null;
      playerReferrals = ((referralsResult as { data: unknown })?.data as Record<string, unknown>[]) || [];

      // Check segment restriction on referral program
      if (referralConfig?.segment_id && playerCpf) {
        const { data: segItem } = await supabase.from('segment_items')
          .select('id')
          .eq('segment_id', referralConfig.segment_id)
          .eq('cpf', playerCpf)
          .maybeSingle();
        if (!segItem) {
          // Player not in required segment — hide referral program
          referralConfig = null;
          referralCode = null;
          playerReferrals = [];
        }
      }

      // If player doesn't have a wallet yet, create one (insert only, never overwrite)
      if (!wallet) {
        const { data: newWallet } = await supabase.from('player_wallets')
          .upsert({ cpf: playerCpf, coins: 0, xp: 0, level: 1 } as Record<string, unknown>, { onConflict: 'cpf', ignoreDuplicates: true })
          .select()
          .single();
        // If upsert returned nothing (existing row), re-fetch
        if (!newWallet) {
          const { data: existing } = await supabase.from('player_wallets').select('*').eq('cpf', playerCpf).maybeSingle();
          wallet = existing;
        } else {
          wallet = newWallet;
        }
      }

      // Reset daily spins if new day
      if (playerSpins && (playerSpins as Record<string, unknown>).last_spin_date !== new Date().toISOString().slice(0, 10)) {
        await supabase.from('player_spins')
          .update({ spins_used_today: 0, last_spin_date: new Date().toISOString().slice(0, 10) } as Record<string, unknown>)
          .eq('cpf', playerCpf);
        (playerSpins as Record<string, unknown>).spins_used_today = 0;
      }

      // Sync XP from platform transactions (fire-and-forget to avoid blocking widget)
      syncPlayerXpInline(playerCpf, supabase).catch(() => {});
    }

    // Get tournament leaderboards for active tournaments
    const tournamentIds = ((tournaments as { data: unknown }).data as Record<string, unknown>[] || []).map((t: Record<string, unknown>) => t.id);
    const leaderboards: Record<string, LeaderboardEntry[]> = {};
    if (tournamentIds.length > 0) {
      const { data: entries } = await supabase
        .from('player_tournament_entries')
        .select('tournament_id, cpf, score, rank')
        .in('tournament_id', tournamentIds)
        .order('score', { ascending: false });
      if (entries) {
        for (const entry of entries) {
          if (!leaderboards[entry.tournament_id]) leaderboards[entry.tournament_id] = [];
          leaderboards[entry.tournament_id].push(entry);
        }
      }
    }

    const wheelCfg = (wheelConfigResult as { data: unknown })?.data || { max_spins_per_day: 3, spin_cost_coins: 0, free_spins_per_day: 1 };

    // Apply widget section toggles — return empty arrays for disabled sections
    const ws = widgetSections;

    return new Response(JSON.stringify({
      achievements: ws.achievements ? ((achievements as { data: unknown }).data || []) : [],
      missions: ws.missions ? ((missions as { data: unknown }).data || []) : [],
      tournaments: ws.tournaments ? ((tournaments as { data: unknown }).data || []) : [],
      wheel_prizes: ws.wheel ? ((wheelPrizes as { data: unknown }).data || []) : [],
      levels: ws.levels ? ((levels as { data: unknown }).data || []) : [],
      store_items: ws.store ? ((storeItems as { data: unknown }).data || []) : [],
      wheel_config: ws.wheel ? wheelCfg : { max_spins_per_day: 0, spin_cost_coins: 0, free_spins_per_day: 0 },
      leaderboards: ws.tournaments ? leaderboards : {},
      wallet: wallet || null,
      player_spins: ws.wheel ? (playerSpins || null) : null,
      mission_progress: ws.missions ? missionProgress : [],
      achievement_progress: ws.achievements ? achievementProgress : [],
      activity_log: activityLog,
      pending_rewards: pendingRewards,
      tournament_entries: ws.tournaments ? tournamentEntries : [],
      mini_games: ws.mini_games ? miniGames : [],
      mini_game_prizes: ws.mini_games ? miniGamePrizes : [],
      mini_game_attempts: ws.mini_games ? miniGameAttempts : [],
      referral_config: ws.referrals ? (referralConfig || null) : null,
      referral_code: ws.referrals ? (referralCode || null) : null,
      referrals: ws.referrals ? (playerReferrals || []) : [],
      _ref_registered: refRegistered,
      _widget_sections: ws,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
    });
  }
}
