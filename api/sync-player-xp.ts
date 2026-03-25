/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse } from './_cors.js';

export const config = { runtime: 'edge', maxDuration: 60 };

// --- Platform login helpers ---

async function platformLogin(siteUrl: string, username: string, password: string, loginUrl?: string | null): Promise<{ cookies: string; success: boolean }> {
  const baseUrl = siteUrl.replace(/\/+$/, '');
  let loginTarget = `${baseUrl}/login`;
  if (loginUrl) {
    const cleanLogin = loginUrl.replace(/\/+$/, '');
    loginTarget = cleanLogin.endsWith('/login') ? cleanLogin : `${cleanLogin}/login`;
  }

  let initialCookies = '';
  try {
    const initRes = await fetch(baseUrl, {
      method: 'GET', headers: { 'Accept': 'text/html' },
      redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    const setCookies = initRes.headers.getSetCookie?.() || [];
    initialCookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
  } catch { /* ignore */ }

  try {
    const hdrs: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/json,*/*',
      'Referer': `${baseUrl}/`, 'Origin': baseUrl,
    };
    if (initialCookies) hdrs['Cookie'] = initialCookies;

    const res = await fetch(loginTarget, {
      method: 'POST', headers: hdrs,
      body: new URLSearchParams({ usuario: username, senha: password }).toString(),
      redirect: 'manual', signal: AbortSignal.timeout(10000),
    });

    const setCookies = res.headers.getSetCookie?.() || [];
    const cookieMap = new Map<string, string>();
    for (const c of initialCookies.split('; ').filter(Boolean)) {
      const [k, ...v] = c.split('=');
      cookieMap.set(k, v.join('='));
    }
    for (const sc of setCookies) {
      const [kv] = sc.split(';');
      const [k, ...v] = kv.split('=');
      cookieMap.set(k.trim(), v.join('='));
    }
    const cookies = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get('location') || '';
      if (!location.includes('/login') && !location.includes('error')) {
        return { cookies, success: true };
      }
    }
    if (res.ok) {
      const text = await res.text();
      try { const d = JSON.parse(text); if (d.status === true || d.logged === true) return { cookies, success: true }; } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  return { cookies: '', success: false };
}

// --- Core XP sync logic ---

interface SyncResult {
  success: boolean;
  cpf: string;
  xp_earned: number;
  bet_xp: number;
  deposit_xp: number;
  total_bets: number;
  total_deposits: number;
  transactions_processed: number;
  levels_gained: number;
  new_level: number;
  rewards_credited: any[];
  error?: string;
}

export async function syncPlayerXp(cpf: string, supabase: any): Promise<SyncResult> {
  const result: SyncResult = {
    success: false, cpf, xp_earned: 0, bet_xp: 0, deposit_xp: 0,
    total_bets: 0, total_deposits: 0, transactions_processed: 0,
    levels_gained: 0, new_level: 0, rewards_credited: [],
  };

  try {
    // 1. Get XP config weights
    const { data: xpConfigs } = await supabase.from('xp_config').select('*');
    if (!xpConfigs || xpConfigs.length === 0) {
      result.error = 'xp_config not configured';
      return result;
    }

    const weights: Record<string, number> = {};
    for (const cfg of xpConfigs) {
      weights[cfg.action || cfg.type || cfg.name] = cfg.xp_per_unit ?? cfg.weight ?? cfg.value ?? 1;
    }
    const apostaWeight = weights['aposta'] ?? weights['bet'] ?? 1;
    const depositoWeight = weights['deposito'] ?? weights['deposit'] ?? 0.3;

    // 2. Get or create player wallet
    let { data: wallet } = await supabase.from('player_wallets')
      .select('*').eq('cpf', cpf).maybeSingle();

    if (!wallet) {
      const { data: newWallet } = await supabase.from('player_wallets')
        .upsert({ cpf, coins: 0, xp: 0, level: 1, total_xp_earned: 0 } as any, { onConflict: 'cpf' })
        .select().single();
      wallet = newWallet;
    }

    if (!wallet) {
      result.error = 'Failed to get/create player wallet';
      return result;
    }

    // 3. Get platform config for login credentials
    const { data: platformConfig } = await supabase.from('platform_config')
      .select('*').eq('active', true).order('created_at', { ascending: false }).limit(1).single();

    if (!platformConfig) {
      result.error = 'Platform config not found';
      return result;
    }

    // 4. Login to platform
    const siteUrl = (platformConfig.site_url || 'https://pixbingobr.concurso.club').replace(/\/+$/, '');
    const login = await platformLogin(siteUrl, platformConfig.username, platformConfig.password, platformConfig.login_url);

    if (!login.success) {
      result.error = 'Platform login failed';
      return result;
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json, text/javascript, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': login.cookies,
      'Referer': siteUrl,
    };

    // 5. Find player UUID on platform
    const userCols = ['username', 'celular', 'cpf', 'created_at', 'ultimo_login', 'situacao', 'uuid'];
    const searchStrategies = [
      { busca_cpf: cpf },
      { busca_username: cpf },
    ];

    let playerUuid: string | null = null;
    for (const extra of searchStrategies) {
      if (playerUuid) break;
      try {
        const params = new URLSearchParams({ draw: '1', start: '0', length: '5' });
        userCols.forEach((col, i) => {
          params.set(`columns[${i}][data]`, col);
          params.set(`columns[${i}][name]`, '');
          params.set(`columns[${i}][searchable]`, 'true');
          params.set(`columns[${i}][orderable]`, 'true');
          params.set(`columns[${i}][search][value]`, '');
          params.set(`columns[${i}][search][regex]`, 'false');
        });
        params.set('order[0][column]', '0');
        params.set('order[0][dir]', 'asc');
        params.set('search[value]', '');
        params.set('search[regex]', 'false');
        for (const [k, v] of Object.entries(extra)) params.set(k, v);

        const res = await fetch(`${siteUrl}/usuarios/listar?${params.toString()}`, {
          method: 'GET', headers, signal: AbortSignal.timeout(15000),
        });
        const data = JSON.parse(await res.text());
        const rows = data?.data || data?.aaData || [];
        if (rows.length > 0 && rows[0].uuid) {
          playerUuid = rows[0].uuid;
        }
      } catch { /* ignore */ }
    }

    if (!playerUuid) {
      result.error = 'Player UUID not found on platform';
      return result;
    }

    // 6. Fetch real game transactions via /usuarios/transacoes (has bets, deposits, wins)
    let movimentacoes: any[] = [];
    let historico: any[] = [];
    try {
      const txRes = await fetch(`${siteUrl}/usuarios/transacoes?id=${playerUuid}`, {
        headers, signal: AbortSignal.timeout(15000),
      });
      const txData = JSON.parse(await txRes.text());
      movimentacoes = txData?.movimentacoes || [];
      historico = txData?.historico || [];
    } catch (e: any) {
      result.error = `Failed to fetch transactions: ${e.message}`;
      return result;
    }

    // Normalize all transactions into a unified format
    const allTx = [
      ...movimentacoes.map((m: any) => ({
        tipo: (m.tipo || '').toUpperCase(),
        valor: m.valor,
        data_registro: m.data_registro,
      })),
      ...historico.map((h: any) => ({
        tipo: (h.operacao || h.tipo || '').toUpperCase(),
        valor: h.valor,
        data_registro: h.data_registro,
      })),
    ];

    // 7. Parse transactions and filter by last_xp_sync
    const lastSync = wallet.last_xp_sync ? new Date(wallet.last_xp_sync).getTime() : null;

    if (allTx.length === 0) {
      result.success = true;
      result.new_level = wallet.level || 1;
      return result;
    }

    const parseVal = (v: any): number => {
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

    let totalBets = 0;
    let totalDeposits = 0;
    let newestTs = 0;
    let processedCount = 0;

    for (const tx of allTx) {
      const tipo = tx.tipo;
      const valor = parseVal(tx.valor);
      const txTs = parseDate(tx.data_registro || '');

      // Skip transactions we already processed
      if (lastSync && txTs && txTs <= lastSync) continue;

      // Track newest transaction date
      if (txTs > newestTs) newestTs = txTs;

      // Classify transaction
      const isBet = tipo.includes('COMPRA') || tipo.includes('APOSTA') || tipo.includes('BET') || tipo.includes('PURCHASE');
      const isDeposit = tipo.includes('DEPOSITO') || tipo.includes('DEPOSIT') || tipo.includes('PIX_IN');

      if (isBet && valor > 0) {
        totalBets += valor;
        processedCount++;
      } else if (isDeposit && valor > 0) {
        totalDeposits += valor;
        processedCount++;
      }
    }

    result.total_bets = totalBets;
    result.total_deposits = totalDeposits;
    result.transactions_processed = processedCount;

    if (processedCount === 0) {
      // Nothing new to process
      result.success = true;
      result.new_level = wallet.level || 1;
      return result;
    }

    // 8. Calculate XP
    const betXp = Math.floor(totalBets * apostaWeight);
    const depXp = Math.floor(totalDeposits * depositoWeight);
    const totalXpEarned = betXp + depXp;

    result.bet_xp = betXp;
    result.deposit_xp = depXp;
    result.xp_earned = totalXpEarned;

    if (totalXpEarned <= 0) {
      result.success = true;
      result.new_level = wallet.level || 1;
      return result;
    }

    // 9. Update player wallet XP
    const currentXp = (wallet.xp || 0) + totalXpEarned;
    const currentTotalXp = (wallet.total_xp_earned || 0) + totalXpEarned;

    // 10. Check level ups
    const { data: levels } = await supabase.from('levels')
      .select('*').order('level');

    let newLevel = wallet.level || 1;
    const rewardsCredited: any[] = [];

    if (levels && levels.length > 0) {
      for (const lvl of levels) {
        // Check if player crossed this level threshold
        if (lvl.level > (wallet.level || 1) && currentTotalXp >= lvl.xp_required) {
          newLevel = lvl.level;

          // Credit level-up rewards
          const rewardUpdate: any = {};
          const rewardDesc = [];

          if (lvl.reward_coins && lvl.reward_coins > 0) {
            rewardUpdate.coins_bonus = lvl.reward_coins;
            rewardDesc.push(`+${lvl.reward_coins} moedas`);
          }
          if (lvl.reward_gems && lvl.reward_gems > 0) {
            rewardUpdate.gems_bonus = lvl.reward_gems;
            rewardDesc.push(`+${lvl.reward_gems} gemas`);
          }
          if (lvl.reward_diamonds && lvl.reward_diamonds > 0) {
            rewardUpdate.diamonds_bonus = lvl.reward_diamonds;
            rewardDesc.push(`+${lvl.reward_diamonds} diamantes`);
          }

          // Log level-up reward
          try {
            await supabase.from('level_rewards_log').insert({
              cpf,
              level: lvl.level,
              tier: lvl.tier,
              level_name: lvl.name,
              reward_coins: lvl.reward_coins || 0,
              reward_gems: lvl.reward_gems || 0,
              reward_diamonds: lvl.reward_diamonds || 0,
            } as any);
          } catch { /* ignore */ }

          rewardsCredited.push({
            level: lvl.level,
            name: lvl.name,
            tier: lvl.tier,
            rewards: rewardDesc,
          });
        }
      }
    }

    result.levels_gained = newLevel - (wallet.level || 1);
    result.new_level = newLevel;
    result.rewards_credited = rewardsCredited;

    // 11. Build wallet update
    const walletUpdate: any = {
      xp: currentXp,
      total_xp_earned: currentTotalXp,
      level: newLevel,
      last_xp_sync: newestTs ? new Date(newestTs).toISOString() : new Date().toISOString(),
    };

    // Add level-up reward currencies
    if (rewardsCredited.length > 0) {
      let bonusCoins = 0, bonusGems = 0, bonusDiamonds = 0;
      for (const reward of rewardsCredited) {
        // Re-fetch level data for reward values
        const lvl = levels?.find((l: any) => l.level === reward.level);
        if (lvl) {
          bonusCoins += lvl.reward_coins || 0;
          bonusGems += lvl.reward_gems || 0;
          bonusDiamonds += lvl.reward_diamonds || 0;
        }
      }
      if (bonusCoins > 0) walletUpdate.coins = (wallet.coins || 0) + bonusCoins;
      if (bonusDiamonds > 0) {
        walletUpdate.diamonds = (wallet.diamonds || 0) + bonusDiamonds;
        walletUpdate.total_diamonds_earned = (wallet.total_diamonds_earned || 0) + bonusDiamonds;
      }
      // gems stored as xp in some setups, but we keep them separate if column exists
    }

    await supabase.from('player_wallets').update(walletUpdate).eq('cpf', cpf);

    // 12. Log XP history
    if (betXp > 0) {
      try {
        await supabase.from('xp_history').insert({
          cpf,
          action: 'aposta',
          amount: totalBets,
          xp_earned: betXp,
          description: `XP de apostas: R$${totalBets.toFixed(2)} x ${apostaWeight} = ${betXp} XP`,
        } as any);
      } catch { /* ignore */ }
    }

    if (depXp > 0) {
      try {
        await supabase.from('xp_history').insert({
          cpf,
          action: 'deposito',
          amount: totalDeposits,
          xp_earned: depXp,
          description: `XP de depósitos: R$${totalDeposits.toFixed(2)} x ${depositoWeight} = ${depXp} XP`,
        } as any);
      } catch { /* ignore */ }
    }

    // 13. Log level-ups in activity log
    for (const reward of rewardsCredited) {
      try {
        await supabase.from('player_activity_log').insert({
          cpf,
          type: 'level_up',
          amount: reward.level,
          source: 'XP Sync',
          description: `Subiu para nível ${reward.level} (${reward.name || reward.tier})! ${reward.rewards.join(', ')}`,
        } as any);
      } catch { /* ignore */ }
    }

    result.success = true;
    return result;

  } catch (e: any) {
    result.error = e.message;
    return result;
  }
}

// --- HTTP handler ---

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let cpf: string | null = null;

    if (req.method === 'POST') {
      const body = await req.json();
      cpf = body.cpf || null;
    } else {
      const url = new URL(req.url);
      cpf = url.searchParams.get('cpf') || null;
    }

    if (!cpf) {
      return new Response(JSON.stringify({ success: false, error: 'CPF é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize CPF
    cpf = cpf.replace(/[.\-\s/]/g, '');

    const result = await syncPlayerXp(cpf, supabase);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
