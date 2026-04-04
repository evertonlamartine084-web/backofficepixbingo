import { SupabaseClient } from '@supabase/supabase-js';

// Re-export platform utilities so sub-modules can import from one place
export { platformLogin, buildPlatformHeaders, searchPlayerByCpf } from '../_platform.js';
export type { DebugEntry } from '../_platform.js';

export interface XpConfigRow {
  action: string;
  xp_per_real: number;
}

export interface TransactionRow {
  tipo?: string;
  operacao?: string;
  valor: string | number;
  data_registro?: string;
}

export interface NormalizedTransaction {
  tipo: string;
  valor: string | number;
  data_registro?: string;
}

export interface MiniGamePrize {
  id: string;
  label: string;
  type: string;
  value: number;
  probability?: number;
  sort_order?: number;
  active?: boolean;
  game_id?: string;
}

export interface GameCell {
  prize: MiniGamePrize;
  winning: boolean;
}

export interface ReferralConfig {
  referrer_reward_type?: string;
  referrer_reward_value?: number;
  referred_reward_type?: string;
  referred_reward_value?: number;
  segment_id?: string;
  max_referrals_per_player?: number;
  require_deposit?: boolean;
  require_bet?: boolean;
  min_deposit_amount?: number;
  min_bet_amount?: number;
  commission_enabled?: boolean;
  commission_duration_days?: number;
  tiers?: Array<{ min_referrals: number; label: string; reward_type: string; reward_value: number }>;
}

export interface LevelGained {
  level: number;
  xp_required: number;
  reward_coins?: number;
  reward_diamonds?: number;
  reward_gems?: number;
  tier?: string;
  name?: string;
}

export interface LeaderboardEntry {
  tournament_id: string;
  cpf: string;
  score: number;
  rank: number;
}

export interface HandlerContext {
  supabase: SupabaseClient;
  url: URL;
  playerCpf: string | null;
  segmentId: string | null;
  corsHeaders: Record<string, string>;
  widgetEnv: string;
}

export function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += parseInt(digits[i]) * (t + 1 - i);
    const remainder = (sum * 10) % 11;
    if ((remainder === 10 ? 0 : remainder) !== parseInt(digits[t])) return false;
  }
  return true;
}

export function applySegmentFilter<T extends { or: (filter: string) => T }>(query: T, segmentId: string | null): T {
  if (!segmentId) return query;
  return query.or(`segment_id.eq.${segmentId},segment_id.is.null`);
}

export async function creditBonusOnPlatform(baseUrl: string, headers: Record<string, string>, playerUuid: string, amount: number, password: string): Promise<{ success: boolean; msg?: string }> {
  const hdrs = { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' };
  try {
    const res = await fetch(`${baseUrl}/usuarios/creditos`, {
      method: 'POST', headers: hdrs, signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({ uuid: playerUuid, carteira: 'BONUS', valor: String(amount), senha: password }).toString(),
    });
    const text = await res.text();
    const result = JSON.parse(text);
    const ok = result?.status === true || String(result?.msg || '').toLowerCase().includes('sucesso');
    return { success: ok, msg: result?.msg || result?.Msg || JSON.stringify(result).slice(0, 200) };
  } catch (e: unknown) {
    return { success: false, msg: e instanceof Error ? e.message : 'Erro' };
  }
}

export async function processReferralRewards(supabase: SupabaseClient, referralId: string, referrerCpf: string, referredCpf: string, config: ReferralConfig | null) {
  if (!config) return;
  // Reward referrer
  if (config.referrer_reward_value && config.referrer_reward_value > 0) {
    const { data: rw } = await supabase.from('player_wallets').select('*').eq('cpf', referrerCpf).maybeSingle();
    if (rw) {
      if (config.referrer_reward_type === 'coins') {
        await supabase.from('player_wallets').update({ coins: (rw.coins || 0) + config.referrer_reward_value, total_coins_earned: (rw.total_coins_earned || 0) + config.referrer_reward_value } as Record<string, unknown>).eq('cpf', referrerCpf);
      } else if (config.referrer_reward_type === 'diamonds') {
        await supabase.from('player_wallets').update({ diamonds: (rw.diamonds || 0) + config.referrer_reward_value } as Record<string, unknown>).eq('cpf', referrerCpf);
      } else if (config.referrer_reward_type === 'xp') {
        await supabase.from('player_wallets').update({ xp: (rw.xp || 0) + config.referrer_reward_value, total_xp_earned: (rw.total_xp_earned || 0) + config.referrer_reward_value } as Record<string, unknown>).eq('cpf', referrerCpf);
      }
      await supabase.from('player_activity_log').insert({ cpf: referrerCpf, type: 'referral', amount: config.referrer_reward_value, source: 'referral_reward', description: `Recompensa por indicação` } as Record<string, unknown>);
    }
    await supabase.from('referrals').update({ referrer_rewarded: true, referrer_reward_amount: config.referrer_reward_value } as Record<string, unknown>).eq('id', referralId);
  }
  // Reward referred
  if (config.referred_reward_value && config.referred_reward_value > 0) {
    const { data: rw2 } = await supabase.from('player_wallets').select('*').eq('cpf', referredCpf).maybeSingle();
    if (rw2) {
      if (config.referred_reward_type === 'coins') {
        await supabase.from('player_wallets').update({ coins: (rw2.coins || 0) + config.referred_reward_value, total_coins_earned: (rw2.total_coins_earned || 0) + config.referred_reward_value } as Record<string, unknown>).eq('cpf', referredCpf);
      } else if (config.referred_reward_type === 'diamonds') {
        await supabase.from('player_wallets').update({ diamonds: (rw2.diamonds || 0) + config.referred_reward_value } as Record<string, unknown>).eq('cpf', referredCpf);
      } else if (config.referred_reward_type === 'xp') {
        await supabase.from('player_wallets').update({ xp: (rw2.xp || 0) + config.referred_reward_value, total_xp_earned: (rw2.total_xp_earned || 0) + config.referred_reward_value } as Record<string, unknown>).eq('cpf', referredCpf);
      }
      await supabase.from('player_activity_log').insert({ cpf: referredCpf, type: 'referral', amount: config.referred_reward_value, source: 'referral_welcome', description: `Bônus de boas-vindas (indicação)` } as Record<string, unknown>);
    }
    await supabase.from('referrals').update({ referred_rewarded: true, referred_reward_amount: config.referred_reward_value, completed_at: new Date().toISOString(), status: 'completed' } as Record<string, unknown>).eq('id', referralId);
  }
}

export async function syncPlayerXpInline(cpf: string, supabase: SupabaseClient): Promise<void> {
  // Dynamically import to avoid circular ref issues
  const { platformLogin: login, searchPlayerByCpf: searchPlayer } = await import('../_platform.js');

  try {
    const { data: xpConfigs } = await supabase.from('xp_config').select('*');
    if (!xpConfigs?.length) return;

    const apostaWeight = xpConfigs.find((c: XpConfigRow) => c.action === 'aposta')?.xp_per_real ?? 1;
    const depositoWeight = xpConfigs.find((c: XpConfigRow) => c.action === 'deposito')?.xp_per_real ?? 0.3;

    const { data: wallet } = await supabase.from('player_wallets').select('*').eq('cpf', cpf).maybeSingle();
    if (!wallet) return;

    const { data: platformConfig } = await supabase.from('platform_config')
      .select('*').eq('active', true).order('created_at', { ascending: false }).limit(1).single();
    if (!platformConfig) return;

    const siteUrl = (platformConfig.site_url || 'https://pixbingobr.concurso.club').replace(/\/+$/, '');
    const loginResult = await login(siteUrl, platformConfig.username, platformConfig.password, platformConfig.login_url);
    if (!loginResult.success) return;

    const hdrs: Record<string, string> = {
      'Accept': 'application/json, text/javascript, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': loginResult.cookies, 'Referer': siteUrl,
    };

    const searchResult = await searchPlayer(siteUrl, hdrs, cpf);
    if (!searchResult.uuid) return;

    let movimentacoes: TransactionRow[] = [];
    let historico: TransactionRow[] = [];
    try {
      const txRes = await fetch(`${siteUrl}/usuarios/transacoes?id=${searchResult.uuid}`, {
        headers: hdrs, signal: AbortSignal.timeout(15000),
      });
      const txData = JSON.parse(await txRes.text());
      movimentacoes = txData?.movimentacoes || [];
      historico = txData?.historico || [];
    } catch { return; }

    const allTx = [
      ...movimentacoes.map((m: TransactionRow) => ({
        tipo: (m.tipo || '').toUpperCase(),
        valor: m.valor,
        data_registro: m.data_registro,
      })),
      ...historico.map((h: TransactionRow) => ({
        tipo: (h.operacao || h.tipo || '').toUpperCase(),
        valor: h.valor,
        data_registro: h.data_registro,
      })),
    ];

    if (allTx.length === 0) return;

    const lastSync = wallet.last_xp_sync ? new Date(wallet.last_xp_sync).getTime() : null;

    const parseVal = (v: string | number | null | undefined): number => {
      if (typeof v === 'number') return Math.abs(v);
      if (!v) return 0;
      const s = String(v).trim();
      if (s.includes(',')) return Math.abs(Number(s.replace(/\./g, '').replace(',', '.'))) || 0;
      return Math.abs(Number(s)) || 0;
    };

    const parseDate = (s: string): number => {
      if (!s) return 0;
      const brMatch = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2}):(\d{2})/);
      if (brMatch) return new Date(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}T${brMatch[4]}:${brMatch[5]}:${brMatch[6]}`).getTime();
      return new Date(s).getTime();
    };

    let totalBets = 0, totalDeposits = 0, newestTs = 0, processedCount = 0;

    for (const tx of allTx) {
      const tipo = tx.tipo;
      const valor = parseVal(tx.valor);
      const txTs = parseDate(tx.data_registro || '');

      if (lastSync && txTs && txTs <= lastSync) continue;
      if (txTs > newestTs) newestTs = txTs;

      const isBet = tipo.includes('COMPRA') || tipo.includes('APOSTA') || tipo.includes('BET') || tipo.includes('PURCHASE');
      const isDeposit = tipo.includes('DEPOSITO') || tipo.includes('DEPOSIT') || tipo.includes('PIX_IN');

      if (isBet && valor > 0) { totalBets += valor; processedCount++; }
      else if (isDeposit && valor > 0) { totalDeposits += valor; processedCount++; }
    }

    if (processedCount === 0) {
      const { data: fixLvls } = await supabase.from('levels').select('level,xp_required').order('level');
      if (fixLvls?.length) {
        let correctLevel = 0;
        for (const lvl of fixLvls) { if ((wallet.xp || 0) >= lvl.xp_required) correctLevel = lvl.level; }
        if (correctLevel !== (wallet.level || 0)) {
          await supabase.from('player_wallets').update({ level: correctLevel } as Record<string, unknown>).eq('cpf', cpf);
        }
      }
      return;
    }

    const betXp = Math.floor(totalBets * apostaWeight);
    const depXp = Math.floor(totalDeposits * depositoWeight);
    const totalXpEarned = betXp + depXp;
    if (totalXpEarned <= 0) return;

    const currentXp = (wallet.xp || 0) + totalXpEarned;
    const currentTotalXp = (wallet.total_xp_earned || 0) + totalXpEarned;

    const { data: levels } = await supabase.from('levels').select('*').order('level');
    let newLevel = wallet.level || 0;
    let bonusCoins = 0, bonusDiamonds = 0;

    if (levels?.length) {
      for (const lvl of levels) {
        if (lvl.level > (wallet.level || 0) && currentXp >= lvl.xp_required) {
          newLevel = lvl.level;
          bonusCoins += lvl.reward_coins || 0;
          bonusDiamonds += lvl.reward_diamonds || 0;
          try {
            await supabase.from('level_rewards_log').insert({
              cpf, from_level: wallet.level || 0, to_level: lvl.level,
              reward_coins: lvl.reward_coins || 0, reward_gems: lvl.reward_gems || 0,
              reward_diamonds: lvl.reward_diamonds || 0,
            } as Record<string, unknown>);
          } catch { /* ignore */ }
        }
      }
    }

    const walletUpdate: Record<string, unknown> = {
      xp: currentXp, total_xp_earned: currentTotalXp, level: newLevel,
      last_xp_sync: newestTs ? new Date(newestTs).toISOString() : new Date().toISOString(),
    };
    if (bonusCoins > 0) walletUpdate.coins = (wallet.coins || 0) + bonusCoins;
    if (bonusDiamonds > 0) {
      walletUpdate.diamonds = (wallet.diamonds || 0) + bonusDiamonds;
      walletUpdate.total_diamonds_earned = (wallet.total_diamonds_earned || 0) + bonusDiamonds;
    }

    await supabase.from('player_wallets').update(walletUpdate).eq('cpf', cpf);

    if (betXp > 0) {
      try { await supabase.from('xp_history').insert({ cpf, action: 'aposta', amount: totalBets, xp_earned: betXp, description: `R$${totalBets.toFixed(2)} apostado = ${betXp} XP` } as Record<string, unknown>); } catch { /* ignore */ }
    }
    if (depXp > 0) {
      try { await supabase.from('xp_history').insert({ cpf, action: 'deposito', amount: totalDeposits, xp_earned: depXp, description: `R$${totalDeposits.toFixed(2)} depositado = ${depXp} XP` } as Record<string, unknown>); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}
