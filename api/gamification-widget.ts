import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse } from './_cors.js';
export const config = { runtime: 'edge' };

interface XpConfigRow {
  action: string;
  xp_per_real: number;
}

interface TransactionRow {
  tipo?: string;
  operacao?: string;
  valor: string | number;
  data_registro?: string;
}

interface NormalizedTransaction {
  tipo: string;
  valor: string | number;
  data_registro?: string;
}

interface DebugEntry {
  strategy: Record<string, string> | string;
  found?: number;
  error?: string;
  status?: number;
  snippet?: string;
}

interface MiniGamePrize {
  id: string;
  label: string;
  type: string;
  value: number;
  probability?: number;
  sort_order?: number;
  active?: boolean;
  game_id?: string;
}

interface GameCell {
  prize: MiniGamePrize;
  winning: boolean;
}

interface ReferralConfig {
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

interface LevelGained {
  level: number;
  xp_required: number;
  reward_coins?: number;
  reward_diamonds?: number;
  reward_gems?: number;
  tier?: string;
  name?: string;
}

interface LeaderboardEntry {
  tournament_id: string;
  cpf: string;
  score: number;
  rank: number;
}

function isValidCPF(cpf: string): boolean {
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

// Inline XP sync to avoid import issues with Vercel Edge
async function syncPlayerXpInline(cpf: string, supabase: SupabaseClient): Promise<void> {
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
    const login = await platformLogin(siteUrl, platformConfig.username, platformConfig.password, platformConfig.login_url);
    if (!login.success) return;

    const hdrs: Record<string, string> = {
      'Accept': 'application/json, text/javascript, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': login.cookies, 'Referer': siteUrl,
    };

    // Find player UUID (needed for /usuarios/transacoes endpoint)
    const searchResult = await searchPlayerByCpf(siteUrl, hdrs, cpf);
    if (!searchResult.uuid) return;

    // Fetch real game transactions via /usuarios/transacoes (has bets, deposits, wins)
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
      // Fix level if it drifted (e.g. was set from total_xp_earned instead of xp)
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

// corsHeaders is set per-request in handler() via getCorsHeaders(req)
let corsHeaders: Record<string, string> = {};

// --- Platform login/credit helpers (for store reward delivery) ---

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

function buildPlatformHeaders(cookies: string, baseUrl: string): Record<string, string> {
  return {
    'Accept': 'application/json, text/javascript, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'Cookie': cookies, 'Referer': baseUrl,
  };
}

async function searchPlayerByCpf(baseUrl: string, headers: Record<string, string>, cpf: string): Promise<{ uuid: string | null; debug: DebugEntry[] }> {
  const userCols = ['username', 'celular', 'cpf', 'created_at', 'ultimo_login', 'situacao', 'uuid'];
  const debugInfo: DebugEntry[] = [];

  // Strategy 1: Try /usuarios/listar with multiple search params
  const strategies = [
    { busca_cpf: cpf },
    { busca_username: cpf },
    { 'search[value]': cpf },
    { 'columns[2][search][value]': cpf },
  ];
  for (const extra of strategies) {
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
      const res = await fetch(`${baseUrl}/usuarios/listar?${params.toString()}`, {
        method: 'GET', headers, signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      const data = JSON.parse(text);
      // Support both DataTables formats: data[] (new) and aaData[] (legacy)
      const rows = data?.data || data?.aaData || [];
      debugInfo.push({ strategy: extra, found: rows.length });
      if (rows.length > 0) return { uuid: rows[0].uuid || null, debug: debugInfo };
    } catch (e: unknown) {
      debugInfo.push({ strategy: extra, error: e instanceof Error ? e.message : 'Erro' });
    }
  }

  // Strategy 2: Try /usuarios/buscar endpoint directly
  try {
    const res = await fetch(`${baseUrl}/usuarios/buscar?q=${encodeURIComponent(cpf)}`, {
      method: 'GET', headers, signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    debugInfo.push({ strategy: 'buscar', status: res.status, snippet: text.slice(0, 300) });
    const data = JSON.parse(text);
    if (Array.isArray(data) && data.length > 0) return { uuid: data[0].uuid || data[0].id || null, debug: debugInfo };
    if (data?.data?.length > 0) return { uuid: data.data[0].uuid || null, debug: debugInfo };
  } catch (e: unknown) {
    debugInfo.push({ strategy: 'buscar', error: e instanceof Error ? e.message : 'Erro' });
  }

  // Strategy 3: Try /api/usuarios or /api/users
  for (const path of ['/api/usuarios', '/api/users']) {
    try {
      const res = await fetch(`${baseUrl}${path}?cpf=${encodeURIComponent(cpf)}`, {
        method: 'GET', headers, signal: AbortSignal.timeout(10000),
      });
      const text = await res.text();
      debugInfo.push({ strategy: path, status: res.status, snippet: text.slice(0, 300) });
      const data = JSON.parse(text);
      if (Array.isArray(data) && data.length > 0) return { uuid: data[0].uuid || data[0].id || null, debug: debugInfo };
      if (data?.data?.length > 0) return { uuid: data.data[0].uuid || null, debug: debugInfo };
    } catch (e: unknown) {
      debugInfo.push({ strategy: path, error: e instanceof Error ? e.message : 'Erro' });
    }
  }

  return { uuid: null, debug: debugInfo };
}

async function creditBonusOnPlatform(baseUrl: string, headers: Record<string, string>, playerUuid: string, amount: number, password: string): Promise<{ success: boolean; msg?: string }> {
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

// Process referral rewards for both referrer and referred
async function processReferralRewards(supabase: SupabaseClient, referralId: string, referrerCpf: string, referredCpf: string, config: ReferralConfig | null) {
  if (!config) return;
  // Reward referrer
  if (config.referrer_reward_value > 0) {
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
  if (config.referred_reward_value > 0) {
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);

  corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'data';
    const segmentId = url.searchParams.get('segment') || null;
    const widgetEnv = url.searchParams.get('env') || 'prod';
    const rawCpf = (url.searchParams.get('player') || '').replace(/\D/g, '');
    const playerCpf = rawCpf && isValidCPF(rawCpf) ? rawCpf : (rawCpf ? null : null);

    // Reject invalid CPF early for actions that require it
    if (rawCpf && !isValidCPF(rawCpf) && ['sync_progress', 'store_buy', 'spin', 'play_mini_game', 'claim_reward'].includes(action)) {
      return new Response(JSON.stringify({ error: 'CPF inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Helper: filter by segment (show items matching segment OR items with no segment)
    const applySegmentFilter = <T extends { or: (filter: string) => T }>(query: T): T => {
      if (!segmentId) return query;
      return query.or(`segment_id.eq.${segmentId},segment_id.is.null`);
    };

    // Return all active gamification data
    if (action === 'data') {
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
    }

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
              const { data: refCfg, error: refCfgErr } = await supabase.from('referral_config')
                .select('require_deposit, require_bet, referrer_reward_type, referrer_reward_value')
                .eq('active', true).limit(1).maybeSingle();
              const cfg = refCfg || {};
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
                      p_cpf: codeData.cpf, p_field: cfg.referrer_reward_type || 'coins', p_amount: cfg.referrer_reward_value || 100,
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
        applySegmentFilter(achievementsQ),          // 0
        applySegmentFilter(missionsQ),              // 1
        applySegmentFilter(tournamentsQ),           // 2
        applySegmentFilter(wheelPrizesQ),           // 3
        applySegmentFilter(                         // 4 mini_games
          supabase.from('mini_games').select('id, type, name, description, theme, config, max_attempts_per_day, free_attempts_per_day, attempt_cost_coins, segment_id, segments(name)').eq('active', true)
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
      const miniGames = miniGamesResult.data || [];

      // Get mini game prizes (depends on mini game IDs)
      const miniGameIds = miniGames.map((g: Record<string, unknown>) => g.id);
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
      let referralConfig: ReferralConfig | null = (referralConfigResult?.data as ReferralConfig | null) || null;
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

        wallet = walletResult?.data || null;
        playerSpins = spinsResult?.data || null;
        missionProgress = missionProgressResult?.data || [];
        achievementProgress = achievementProgressResult?.data || [];
        activityLog = activityLogResult?.data || [];
        pendingRewards = pendingRewardsResult?.data || [];
        tournamentEntries = tournamentEntriesResult?.data || [];
        miniGameAttempts = miniGameAttemptsResult?.data || [];

        // Referral player data
        const referralCodeResult = allResults[17];
        const referralsResult = allResults[18];
        referralCode = referralCodeResult?.data || null;
        playerReferrals = referralsResult?.data || [];

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
        if (playerSpins && playerSpins.last_spin_date !== new Date().toISOString().slice(0, 10)) {
          await supabase.from('player_spins')
            .update({ spins_used_today: 0, last_spin_date: new Date().toISOString().slice(0, 10) } as Record<string, unknown>)
            .eq('cpf', playerCpf);
          playerSpins.spins_used_today = 0;
        }

        // Sync XP from platform transactions (fire-and-forget to avoid blocking widget)
        syncPlayerXpInline(playerCpf, supabase).catch(() => {});
      }

      // Get tournament leaderboards for active tournaments
      const tournamentIds = (tournaments.data || []).map((t: Record<string, unknown>) => t.id);
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

      const wheelCfg = wheelConfigResult?.data || { max_spins_per_day: 3, spin_cost_coins: 0, free_spins_per_day: 1 };

      // Apply widget section toggles — return empty arrays for disabled sections
      const ws = widgetSections;

      return new Response(JSON.stringify({
        achievements: ws.achievements ? (achievements.data || []) : [],
        missions: ws.missions ? (missions.data || []) : [],
        tournaments: ws.tournaments ? (tournaments.data || []) : [],
        wheel_prizes: ws.wheel ? (wheelPrizes.data || []) : [],
        levels: ws.levels ? (levels.data || []) : [],
        store_items: ws.store ? (storeItems.data || []) : [],
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

    // Spin the wheel
    if (action === 'spin') {
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

    // Tournament opt-in / buy-in
    if (action === 'tournament_join') {
      if (!playerCpf) {
        return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const tournamentId = url.searchParams.get('tournament_id');
      if (!tournamentId) {
        return new Response(JSON.stringify({ error: 'tournament_id obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get tournament
      const { data: tournament } = await supabase.from('tournaments').select('*').eq('id', tournamentId).single();
      if (!tournament) {
        return new Response(JSON.stringify({ error: 'Torneio não encontrado' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if already joined
      const { data: existing } = await supabase.from('player_tournament_entries')
        .select('id').eq('cpf', playerCpf).eq('tournament_id', tournamentId).maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ error: 'Já inscrito neste torneio' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check buy-in
      let coinsPaid = 0;
      if (tournament.buy_in_cost && tournament.buy_in_cost > 0) {
        coinsPaid = tournament.buy_in_cost;
        const { data: wallet } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
        if (!wallet || (wallet.coins || 0) < coinsPaid) {
          return new Response(JSON.stringify({ error: 'Moedas insuficientes', cost: coinsPaid, balance: wallet?.coins || 0 }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // Deduct
        await supabase.from('player_wallets')
          .update({ coins: (wallet.coins || 0) - coinsPaid } as Record<string, unknown>)
          .eq('cpf', playerCpf);
      }

      // Create entry
      await supabase.from('player_tournament_entries').insert({
        cpf: playerCpf,
        tournament_id: tournamentId,
        opted_in: true,
        bought_in: coinsPaid > 0,
        coins_paid: coinsPaid,
      } as Record<string, unknown>);

      // Log
      try {
        await supabase.from('player_activity_log').insert({
          cpf: playerCpf,
          type: 'tournament',
          amount: coinsPaid > 0 ? -coinsPaid : 0,
          source: 'Torneio',
          source_id: tournamentId,
          description: `Inscreveu-se no torneio: ${tournament.name}`,
        } as Record<string, unknown>);
      } catch { /* ignore */ }

      return new Response(JSON.stringify({ success: true, coins_paid: coinsPaid }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if player belongs to segment
    if (action === 'check_segment') {
      if (!segmentId || !playerCpf) {
        return new Response(JSON.stringify({ belongs: !segmentId }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Normalize CPF: remove dots, dashes, spaces
      const cleanCpf = playerCpf.replace(/[.\-\s/]/g, '');
      const { data: match } = await supabase.from('segment_items')
        .select('id')
        .eq('segment_id', segmentId)
        .eq('cpf', cleanCpf)
        .maybeSingle();
      return new Response(JSON.stringify({ belongs: !!match }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Platform balance
    if (action === 'platform_balance') {
      if (!playerCpf) {
        return new Response(JSON.stringify({ saldo: 0, bonus: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      try {
        const { data: config } = await supabase.from('platform_config').select('*').limit(1).maybeSingle();
        if (!config?.username || !config?.password) {
          return new Response(JSON.stringify({ saldo: 0, bonus: 0, error: 'config' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const loginDomain = (config.login_url || config.site_url || 'https://pixbingobr.concurso.club').replace(/\/+$/, '');
        const login = await platformLogin(loginDomain, config.username, config.password, config.login_url);
        if (!login.success) {
          return new Response(JSON.stringify({ saldo: 0, bonus: 0, error: 'login' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const headers2: Record<string, string> = {
          'Cookie': login.cookies,
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        };
        let saldo = 0, bonus = 0;
        // First find uuid by CPF
        const searchResult = await searchPlayerByCpf(loginDomain, headers2, playerCpf);
        const uuid = searchResult.uuid;
        if (uuid) {
          // Fetch /usuarios/transacoes which returns carteiras
          const txRes = await fetch(`${loginDomain}/usuarios/transacoes?id=${uuid}`, {
            headers: headers2, signal: AbortSignal.timeout(10000),
          });
          const txText = await txRes.text();
          let txData: Record<string, unknown> | null;
          try { txData = JSON.parse(txText); } catch { txData = null; }
          const carteiras = txData?.carteiras;
          // Parse BR currency format: "4.279,46" → 4279.46
          const parseBR = (v: unknown): number => {
            if (typeof v === 'number') return v;
            if (!v) return 0;
            return Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
          };

          if (Array.isArray(carteiras)) {
            for (const c of carteiras) {
              const nome = (c.carteira || c.nome || c.tipo || '').toUpperCase();
              const val = parseBR(c.saldo || c.valor);
              if (nome.includes('BONUS')) bonus = val;
              else if (nome.includes('PREMIO') || nome.includes('CREDITO') || nome.includes('REAL') || nome.includes('PRINCIPAL')) {
                saldo += val;
              }
            }
          } else if (carteiras && typeof carteiras === 'object') {
            // Direct key format: { CREDITO: "0,00", BONUS: "4.279,46", PREMIO: "207,71" }
            for (const [key, val] of Object.entries(carteiras)) {
              const k = key.toUpperCase();
              if (k.includes('BONUS')) bonus = parseBR(val);
              else if (k === 'PREMIO' || k === 'CREDITO' || k === 'REAL' || k === 'SALDO') {
                saldo += parseBR(val);
              }
            }
          }
        }
        return new Response(JSON.stringify({ saldo, bonus }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e: unknown) {
        return new Response(JSON.stringify({ saldo: 0, bonus: 0, error: e instanceof Error ? e.message : 'Erro' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Store purchase
    if (action === 'store_buy') {
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
        // Saldo Real → credit on platform
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
        // Giros grátis → entrega manual
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

    // Claim pending reward
    if (action === 'claim_reward') {
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

    // Mission opt-in
    if (action === 'mission_optin') {
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

    // Mission claim (manual claim)
    if (action === 'mission_claim') {
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

    // Play mini game (scratch_card, gift_box, prize_drop)
    if (action === 'play_mini_game') {
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
        const nothing = prizes.find((p: MiniGamePrize) => p.type === 'nothing') || { label: 'Tente novamente', type: 'nothing', value: 0 };
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

    // ─── Referral: generate code ───
    if (action === 'referral_generate') {
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

    // ─── Referral: track click ───
    if (action === 'referral_click') {
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

    // ─── Referral: register referred player ───
    if (action === 'referral_register') {
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
        await processReferralRewards(supabase, referral.id, codeData.cpf, playerCpf, config);
      }
      return new Response(JSON.stringify({ ok: true, status, referral_id: referral?.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Referral: check qualification (deposit + bet) ───
    if (action === 'referral_check') {
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
        // Fetch player wallet to check deposit
        const { data: wallet } = await supabase.from('player_wallets').select('total_deposited').eq('cpf', playerCpf).maybeSingle();
        const totalDeposited = wallet?.total_deposited || 0;
        if (totalDeposited >= (config.min_deposit_amount || 0)) {
          updates.referred_first_deposit = totalDeposited;
          updates.referred_first_deposit_at = new Date().toISOString();
          // Move to next step
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
          await processReferralRewards(supabase, pendingRef.id, pendingRef.referrer_cpf, playerCpf, config);
        }
      }
      return new Response(JSON.stringify({ ok: true, status: newStatus, previous: pendingRef.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Referral: claim tier reward ───
    if (action === 'referral_claim_tier') {
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

    // ─── Sync player progress for missions & achievements ───
    if (action === 'sync_progress') {
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

      // ── MISSIONS ──
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

      // ── ACHIEVEMENTS ──
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

      // ── XP + LEVEL-UP (on bet/deposit events) ──
      let xpEarned = 0;
      let newLevel = 0;
      let leveledUp = false;

      if ((eventType === 'bet' || eventType === 'deposit') && eventValue > 0) {
        try {
          // Get XP weights
          const { data: xpConfigs } = await supabase.from('xp_config').select('*').eq('active', true);
          const apostaWeight = xpConfigs?.find((c: XpConfigRow) => c.action === 'aposta')?.xp_per_real ?? 1;
          const depositoWeight = xpConfigs?.find((c: XpConfigRow) => c.action === 'deposito')?.xp_per_real ?? 0.3;

          const weight = eventType === 'bet' ? apostaWeight : depositoWeight;
          xpEarned = Math.floor(eventValue * weight);

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
            const levelsGained: LevelGained[] = [];

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

            const { error: xpUpdateErr, count: xpUpdateCount } = await supabase.from('player_wallets').update(walletUpdate).eq('cpf', playerCpf);
            // Debug: include update result in response
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

      // ── TOURNAMENT SCORE UPDATE (on bet events) ──
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
                  const newScore = (entry.score || 0) + scoreIncrement;
                  await supabase.from('player_tournament_entries')
                    .update({ score: newScore, updated_at: new Date().toISOString() } as Record<string, unknown>)
                    .eq('id', entry.id);
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

    // ─── Debug: scrape platform page ───
    if (action === 'scrape_platform') {
      const path = url.searchParams.get('path') || '/';
      const { data: config } = await supabase.from('platform_config').select('*').limit(1).maybeSingle();
      if (!config?.username || !config?.password) {
        return new Response(JSON.stringify({ error: 'No platform config' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const siteUrl = (config.site_url || 'https://pixbingobr.concurso.club').replace(/\/+$/, '');
      const login = await platformLogin(siteUrl, config.username, config.password, config.login_url);
      if (!login.success) {
        return new Response(JSON.stringify({ error: 'Login failed' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const hdrs: Record<string, string> = {
        'Cookie': login.cookies, 'Accept': 'text/html,*/*', 'X-Requested-With': 'XMLHttpRequest', 'Referer': siteUrl,
      };
      const pageRes = await fetch(`${siteUrl}${path}`, { method: 'GET', headers: hdrs, signal: AbortSignal.timeout(12000) });
      const html = await pageRes.text();
      const menuLinks = [...html.matchAll(/href=['"]([^'"]+)['"]/gi)].map(m => m[1]).filter(h => h.startsWith('/'));
      const ajaxUrls = [...html.matchAll(/ajax\s*:\s*['"`]([^'"`]+)['"`]/gi)].map(m => m[1]);
      const formActions = [...html.matchAll(/action=['"]([^'"]+)['"]/gi)].map(m => m[1]);
      const selectOptions = [...html.matchAll(/<option[^>]*value=['"]([^'"]*?)['"][^>]*>([^<]*?)<\/option>/gi)].map(m => ({ value: m[1], label: m[2].trim() }));
      const inputFields = [...html.matchAll(/<input[^>]*name=['"]([^'"]+)['"][^>]*/gi)].map(m => m[0]);
      const labels = [...html.matchAll(/<label[^>]*>(.*?)<\/label>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      return new Response(JSON.stringify({
        status: pageRes.status,
        html_length: html.length,
        title: html.match(/<title>(.*?)<\/title>/i)?.[1] || '',
        menu_links: [...new Set(menuLinks)],
        ajax_urls: ajaxUrls,
        form_actions: formActions,
        select_options: selectOptions,
        input_fields: inputFields.slice(0, 50),
        labels: labels.slice(0, 50),
        html_snippet: html.slice(0, 5000),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Ação desconhecida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
