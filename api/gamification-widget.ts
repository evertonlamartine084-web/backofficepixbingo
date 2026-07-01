import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse } from './_cors.js';
import { isValidCPF, HandlerContext } from './widget/types.js';
import { handleData } from './widget/data.js';
import { handleSpin } from './widget/wheel.js';
import { handleMissionOptin, handleMissionClaim, handleSyncProgress } from './widget/missions.js';
import { handleStoreBuy, handleClaimReward } from './widget/store.js';
import {
  handleReferralGenerate, handleReferralClick,
  handleReferralRegister, handleReferralCheck, handleReferralClaimTier,
} from './widget/referrals.js';
import {
  handleTournamentJoin, handleCheckSegment,
  handlePlatformBalance, handleScrapePlatform,
} from './widget/leaderboard.js';
import { handlePlayMiniGame } from './widget/mini-games.js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);

  const corsHeaders = getCorsHeaders(req);

  // DESATIVADO (2026-07-01): este widget legado não tinha autenticação de posse do CPF
  // (IDOR — qualquer um creditava valor por qualquer CPF). Substituído pelo backend Railway
  // (/api/gamification-widget com JWT de jogador). Respondemos 410 Gone para fechar a exposição.
  return new Response(
    JSON.stringify({ error: 'gone', message: 'Endpoint desativado. Use o backend de gamificação (Railway).' }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );

   
  try {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'data';
    const segmentId = url.searchParams.get('segment') || null;
    const widgetEnv = url.searchParams.get('env') || 'prod';
    const rawCpf = (url.searchParams.get('player') || '').replace(/\D/g, '');
    const playerCpf = rawCpf && isValidCPF(rawCpf) ? rawCpf : null;

    // Reject invalid CPF early for actions that require it
    if (rawCpf && !isValidCPF(rawCpf) && ['sync_progress', 'store_buy', 'spin', 'play_mini_game', 'claim_reward'].includes(action)) {
      return new Response(JSON.stringify({ error: 'CPF inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ctx: HandlerContext = { supabase, url, playerCpf, segmentId, corsHeaders, widgetEnv };

    // Route to the appropriate handler
    switch (action) {
      case 'data':
        return handleData(ctx);
      case 'spin':
        return handleSpin(ctx);
      case 'tournament_join':
        return handleTournamentJoin(ctx);
      case 'check_segment':
        return handleCheckSegment(ctx);
      case 'platform_balance':
        return handlePlatformBalance(ctx);
      case 'store_buy':
        return handleStoreBuy(ctx);
      case 'claim_reward':
        return handleClaimReward(ctx);
      case 'mission_optin':
        return handleMissionOptin(ctx);
      case 'mission_claim':
        return handleMissionClaim(ctx);
      case 'play_mini_game':
        return handlePlayMiniGame(ctx);
      case 'referral_generate':
        return handleReferralGenerate(ctx);
      case 'referral_click':
        return handleReferralClick(ctx);
      case 'referral_register':
        return handleReferralRegister(ctx);
      case 'referral_check':
        return handleReferralCheck(ctx);
      case 'referral_claim_tier':
        return handleReferralClaimTier(ctx);
      case 'sync_progress':
        return handleSyncProgress(ctx);
      case 'scrape_platform':
        return handleScrapePlatform(ctx);
      case 'sync_missions': {
        if (!playerCpf) return new Response(JSON.stringify({ error: 'CPF obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        try {
          const { cachedPlatformLogin, cachedSearchPlayerByCpf, buildPlatformHeaders } = await import('./_platform.js');
          const { data: config } = await supabase.from('platform_config').select('*').eq('active', true).limit(1).single();
          if (!config) return new Response(JSON.stringify({ error: 'No config' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          const siteUrl = (config.site_url || '').replace(/\/+$/, '');
          const loginResult = await cachedPlatformLogin(supabase, config);
          if (!loginResult.success) return new Response(JSON.stringify({ error: 'Login failed' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          const hdrs = buildPlatformHeaders(loginResult.cookies, siteUrl);
          const playerUuid = await cachedSearchPlayerByCpf(supabase, siteUrl, hdrs, playerCpf);
          if (!playerUuid) return new Response(JSON.stringify({ error: 'Player not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          // Fetch transactions
          const txRes = await fetch(`${siteUrl}/usuarios/transacoes?id=${playerUuid}`, { headers: hdrs, signal: AbortSignal.timeout(15000) });
          const txData = JSON.parse(await txRes.text());
          const { syncMissionsFromTransactions } = await import('./widget/types.js');
          await syncMissionsFromTransactions(playerCpf, supabase, txData?.movimentacoes || [], txData?.historico || [], siteUrl, hdrs, playerUuid, config.password);
          // Return updated progress
          const { data: progress } = await supabase.from('player_mission_progress').select('*').eq('cpf', playerCpf);
          return new Response(JSON.stringify({ success: true, mission_progress: progress || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (e: unknown) {
          return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Erro' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
      case 'debug_reset_mission': {
        const mid = url.searchParams.get('mission_id');
        if (!mid || !playerCpf) return new Response(JSON.stringify({ error: 'mission_id e player obrigatórios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const nowIso = new Date().toISOString();
        const { error } = await supabase.from('player_mission_progress').update({ progress: 0, completed: false, claimed: false, completed_at: null, claimed_at: null, reset_at: nowIso, started_at: nowIso } as Record<string, unknown>).eq('cpf', playerCpf).eq('mission_id', mid);
        return new Response(JSON.stringify({ success: !error, error: error?.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      default:
        return new Response(JSON.stringify({ error: 'Ação desconhecida' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
