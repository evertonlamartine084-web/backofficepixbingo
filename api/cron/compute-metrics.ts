import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse, verifyAuth } from '../_cors.js';
import { platformLogin, buildPlatformHeaders, buildDataTableParams } from '../_platform.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export const config = { runtime: 'edge', maxDuration: 300 };

// --- BR date/currency helpers ---

function parseBRDate(raw: string): Date | null {
  // "dd/mm/yyyy HH:mm:ss" → Date
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-03:00`);
}

function parseBRCurrency(val: string | number): number {
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
}

// --- Types ---

interface NormalizedTx {
  tipo: string;
  valor: number;
  data: Date;
  jogo: string;
}

interface PlayerMetrics {
  cpf: string;
  favorite_game: string | null;
  favorite_game_category: string | null;
  total_bet_7d: number;
  total_bet_30d: number;
  bet_count_7d: number;
  bet_count_30d: number;
  avg_bet_value: number;
  total_deposit_7d: number;
  total_deposit_30d: number;
  deposit_count_7d: number;
  deposit_count_30d: number;
  last_deposit_date: string | null;
  days_since_last_bet: number | null;
  days_since_last_deposit: number | null;
  days_since_last_login: number | null;
  active_days_7d: number;
  active_days_30d: number;
  engagement_score: number;
  churn_risk: number;
  computed_at: string;
}

// --- Main handler ---

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  const cors = getCorsHeaders(req);
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const auth = await verifyAuth(req);
  if (!auth) return json({ error: 'Não autorizado' }, 401);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Config missing' }, 500);
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Get all active players (those with wallets)
    const { data: wallets, error: walletsErr } = await supabase
      .from('player_wallets')
      .select('cpf')
      .limit(10000);

    if (walletsErr) throw walletsErr;
    if (!wallets || wallets.length === 0) return json({ message: 'No players found', processed: 0 });

    // 2. Login to platform
    const { data: platformConfig } = await supabase
      .from('platform_config')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!platformConfig) return json({ error: 'Platform config not found' }, 500);

    const siteUrl = (platformConfig.site_url || 'https://pixbingobr.concurso.club').replace(/\/+$/, '');
    const login = await platformLogin(siteUrl, platformConfig.username, platformConfig.password, platformConfig.login_url);
    if (!login.success) return json({ error: 'Platform login failed' }, 500);

    const headers = buildPlatformHeaders(login.cookies, siteUrl);
    const now = new Date();

    // 3. Process players in batches
    const BATCH_SIZE = 20;
    let processed = 0;
    let errors = 0;
    const allMetrics: PlayerMetrics[] = [];

    for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
      const batch = wallets.slice(i, i + BATCH_SIZE);

      // Re-login every 100 players to avoid session expiry
      if (i > 0 && i % 100 === 0) {
        const relogin = await platformLogin(siteUrl, platformConfig.username, platformConfig.password, platformConfig.login_url);
        if (relogin.success) {
          headers['Cookie'] = relogin.cookies;
        }
      }

      const promises = batch.map(async ({ cpf }) => {
        try {
          const metrics = await computePlayerMetrics(cpf, siteUrl, headers, now);
          if (metrics) {
            allMetrics.push(metrics);
            processed++;
          }
        } catch {
          errors++;
        }
      });

      await Promise.all(promises);

      // Upsert batch to database
      if (allMetrics.length >= BATCH_SIZE) {
        await upsertMetrics(supabase as AnySupabase, allMetrics.splice(0));
      }
    }

    // Upsert remaining
    if (allMetrics.length > 0) {
      await upsertMetrics(supabase as AnySupabase, allMetrics.splice(0));
    }

    // 4. Update lifecycle stages based on computed metrics
    const lifecycleUpdated = await updateLifecycleStages(supabase as AnySupabase);

    return json({ message: 'Metrics computed', processed, errors, total: wallets.length, lifecycle_updated: lifecycleUpdated });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : 'Erro ao computar métricas' }, 500);
  }
}

// --- Compute metrics for a single player ---

async function computePlayerMetrics(
  cpf: string,
  siteUrl: string,
  headers: Record<string, string>,
  now: Date,
): Promise<PlayerMetrics | null> {
  // Fetch last 30 days of transactions
  const txParams = buildDataTableParams({
    columns: ['tipo', 'operacao', 'valor', 'carteira', 'jogo', 'data_registro'],
    length: 1000,
    orderColumn: 5,
    orderDir: 'desc',
    extraParams: { busca_cpf: cpf },
  });

  const res = await fetch(`${siteUrl}/transferencias/listar?${txParams.toString()}`, {
    method: 'GET', headers, signal: AbortSignal.timeout(20000),
  });

  const text = await res.text();
  if (text.startsWith('<!')) return null; // HTML = session expired

  const data = JSON.parse(text);
  const rows = data?.data || data?.aaData || [];

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Normalize transactions
  const txs: NormalizedTx[] = [];
  for (const r of rows) {
    const tipo = String(r.tipo || r.operacao || '').toUpperCase();
    const valor = parseBRCurrency(r.valor);
    const dateStr = String(r.data_registro || '');
    const d = parseBRDate(dateStr);
    if (!d || d < thirtyDaysAgo) continue;

    txs.push({
      tipo,
      valor,
      data: d,
      jogo: String(r.jogo || '').trim(),
    });
  }

  // --- Calculate metrics ---

  // Bets
  const bets = txs.filter(t => ['APOSTA', 'CASSINO', 'KENO', 'SPORT'].some(k => t.tipo.includes(k)));
  const bets7d = bets.filter(t => t.data >= sevenDaysAgo);
  const totalBet7d = bets7d.reduce((s, t) => s + t.valor, 0);
  const totalBet30d = bets.reduce((s, t) => s + t.valor, 0);
  const avgBetValue = bets.length > 0 ? totalBet30d / bets.length : 0;

  // Deposits
  const deposits = txs.filter(t => t.tipo.includes('DEPOSITO') || t.tipo.includes('DEPÓSITO') || t.tipo === 'PIX');
  const deposits7d = deposits.filter(t => t.data >= sevenDaysAgo);
  const totalDeposit7d = deposits7d.reduce((s, t) => s + t.valor, 0);
  const totalDeposit30d = deposits.reduce((s, t) => s + t.valor, 0);
  const lastDeposit = deposits.length > 0 ? deposits.reduce((latest, t) => t.data > latest.data ? t : latest) : null;

  // Last bet
  const lastBet = bets.length > 0 ? bets.reduce((latest, t) => t.data > latest.data ? t : latest) : null;

  // Favorite game (by bet volume)
  const gameVolume: Record<string, number> = {};
  for (const b of bets) {
    if (b.jogo) {
      gameVolume[b.jogo] = (gameVolume[b.jogo] || 0) + b.valor;
    }
  }
  const favoriteGame = Object.entries(gameVolume).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Game category
  let favoriteGameCategory: string | null = null;
  if (favoriteGame) {
    const lower = favoriteGame.toLowerCase();
    if (lower.includes('keno') || lower.includes('bingo')) favoriteGameCategory = 'keno';
    else if (lower.includes('sport') || lower.includes('futebol')) favoriteGameCategory = 'sport';
    else favoriteGameCategory = 'casino';
  }

  // Active days
  const daySet7d = new Set<string>();
  const daySet30d = new Set<string>();
  for (const t of txs) {
    const dayKey = t.data.toISOString().slice(0, 10);
    daySet30d.add(dayKey);
    if (t.data >= sevenDaysAgo) daySet7d.add(dayKey);
  }

  // Days since last actions
  const daysSinceLastBet = lastBet ? Math.floor((now.getTime() - lastBet.data.getTime()) / 86400000) : null;
  const daysSinceLastDeposit = lastDeposit ? Math.floor((now.getTime() - lastDeposit.data.getTime()) / 86400000) : null;

  // Days since last login — approximate from any transaction
  const lastTx = txs.length > 0 ? txs.reduce((latest, t) => t.data > latest.data ? t : latest) : null;
  const daysSinceLastLogin = lastTx ? Math.floor((now.getTime() - lastTx.data.getTime()) / 86400000) : null;

  // --- Engagement Score (0-100) ---
  // Weighted: active_days_7d (40%), bet_frequency (30%), deposit_recency (30%)
  const activeDayScore = Math.min(100, (daySet7d.size / 7) * 100);
  const betFreqScore = Math.min(100, (bets7d.length / 20) * 100); // 20+ bets/week = max
  const depositRecencyScore = daysSinceLastDeposit !== null
    ? Math.max(0, 100 - (daysSinceLastDeposit * 10)) // loses 10pts per day
    : 0;
  const engagementScore = Math.round(
    activeDayScore * 0.4 + betFreqScore * 0.3 + depositRecencyScore * 0.3
  );

  // --- Churn Risk (0-100) ---
  // Higher = more likely to churn
  const inactivityScore = daysSinceLastLogin !== null
    ? Math.min(100, daysSinceLastLogin * 8) // 12+ days inactive = max risk
    : 100;
  const activityDecline = daySet7d.size < daySet30d.size / 4
    ? 80 // significant drop
    : daySet7d.size < daySet30d.size / 3 ? 40 : 0;
  const depositDropoff = deposits7d.length === 0 && deposits.length > 0 ? 60 : 0;
  const churnRisk = Math.min(100, Math.round(
    inactivityScore * 0.5 + activityDecline * 0.3 + depositDropoff * 0.2
  ));

  return {
    cpf,
    favorite_game: favoriteGame,
    favorite_game_category: favoriteGameCategory,
    total_bet_7d: round2(totalBet7d),
    total_bet_30d: round2(totalBet30d),
    bet_count_7d: bets7d.length,
    bet_count_30d: bets.length,
    avg_bet_value: round2(avgBetValue),
    total_deposit_7d: round2(totalDeposit7d),
    total_deposit_30d: round2(totalDeposit30d),
    deposit_count_7d: deposits7d.length,
    deposit_count_30d: deposits.length,
    last_deposit_date: lastDeposit ? lastDeposit.data.toISOString() : null,
    days_since_last_bet: daysSinceLastBet,
    days_since_last_deposit: daysSinceLastDeposit,
    days_since_last_login: daysSinceLastLogin,
    active_days_7d: daySet7d.size,
    active_days_30d: daySet30d.size,
    engagement_score: Math.max(0, Math.min(100, engagementScore)),
    churn_risk: Math.max(0, Math.min(100, churnRisk)),
    computed_at: now.toISOString(),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- Upsert to Supabase ---

async function upsertMetrics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  metrics: PlayerMetrics[],
): Promise<void> {
  if (metrics.length === 0) return;

  const { error } = await supabase
    .from('player_computed_metrics')
    .upsert(metrics, { onConflict: 'cpf' });

  if (error) {
    console.error('Upsert metrics error:', error.message);
  }
}

// --- Lifecycle stage calculation ---

interface MetricRow {
  cpf: string;
  engagement_score: number;
  churn_risk: number;
  days_since_last_login: number | null;
  days_since_last_bet: number | null;
  total_bet_30d: number;
  active_days_30d: number;
}

function classifyLifecycleStage(m: MetricRow): string {
  const daysSinceLogin = m.days_since_last_login ?? 999;
  const daysSinceBet = m.days_since_last_bet ?? 999;

  // Churned: inactive 15+ days
  if (daysSinceLogin >= 15 && daysSinceBet >= 15) return 'churned';

  // At risk: 7-14 days inactive or churn_risk > 65
  if (daysSinceLogin >= 7 || daysSinceBet >= 7 || m.churn_risk > 65) return 'at_risk';

  // Loyal: high engagement, active 20+ days in 30d, betting regularly
  if (m.engagement_score >= 70 && m.active_days_30d >= 20 && m.total_bet_30d > 0) return 'loyal';

  // Active: some engagement
  if (m.engagement_score >= 30 && m.active_days_30d >= 5) return 'active';

  // New: low activity, recently joined (we'll assume new if very low data)
  if (m.active_days_30d <= 3 && m.total_bet_30d === 0) return 'new';

  return 'active';
}

async function updateLifecycleStages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<number> {
  // Fetch all computed metrics
  const { data: metrics, error } = await supabase
    .from('player_computed_metrics')
    .select('cpf, engagement_score, churn_risk, days_since_last_login, days_since_last_bet, total_bet_30d, active_days_30d')
    .limit(50000);

  if (error || !metrics) return 0;

  // Fetch existing lifecycle data
  const { data: existingLc } = await supabase
    .from('player_lifecycle')
    .select('cpf, stage')
    .limit(50000);

  const currentStages: Record<string, string> = {};
  if (existingLc) {
    for (const lc of existingLc) {
      currentStages[lc.cpf] = lc.stage;
    }
  }

  const now = new Date().toISOString();
  const upserts: Record<string, unknown>[] = [];

  for (const m of metrics as MetricRow[]) {
    const newStage = classifyLifecycleStage(m);
    const prevStage = currentStages[m.cpf];

    // Check reactivation: was churned, now active/loyal
    let finalStage = newStage;
    if (prevStage === 'churned' && (newStage === 'active' || newStage === 'loyal')) {
      finalStage = 'reactivated';
    }

    // Only upsert if stage changed or doesn't exist
    if (prevStage !== finalStage) {
      upserts.push({
        cpf: m.cpf,
        stage: finalStage,
        previous_stage: prevStage || 'new',
        stage_changed_at: now,
        updated_at: now,
      });
    }
  }

  // Batch upsert
  const BATCH = 500;
  for (let i = 0; i < upserts.length; i += BATCH) {
    await supabase.from('player_lifecycle').upsert(
      upserts.slice(i, i + BATCH),
      { onConflict: 'cpf' },
    );
  }

  return upserts.length;
}
