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
