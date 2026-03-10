const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_RUNTIME_MS = 50_000; // 50s max to stay within edge function limits
const LOOP_INTERVAL_MS = 10_000; // Check every 10 seconds

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const username = Deno.env.get('PLATFORM_USERNAME');
    const password = Deno.env.get('PLATFORM_PASSWORD');

    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Credenciais da plataforma não configuradas' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const startTime = Date.now();
    const allResults: any[] = [];
    let iterations = 0;

    // Loop processing active campaigns until time runs out
    while (Date.now() - startTime < MAX_RUNTIME_MS) {
      iterations++;

      // Fetch active campaigns
      const { data: campaigns, error: campErr } = await supabase
        .from('campaigns')
        .select('*')
        .eq('status', 'ATIVA');

      if (campErr || !campaigns?.length) break;

      // Check if any campaign still has unprocessed participants
      let hasWork = false;

      for (const campaign of campaigns) {
        if (Date.now() - startTime > MAX_RUNTIME_MS - 5000) break; // Leave 5s buffer

        try {
          const { data, error } = await supabase.functions.invoke('process-campaign', {
            body: { campaign_id: campaign.id, username, password },
          });

          const result = {
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            iteration: iterations,
            success: !error && data?.success,
            data: data?.data || null,
            error: error?.message || data?.error || null,
          };
          allResults.push(result);

          // If there are still pending participants or waiting for opt-ins, we have more work
          if (data?.data?.processed > 0 && data?.data?.processed > data?.data?.credited + data?.data?.errors) {
            hasWork = true;
          }
          // Opt-in campaigns always have potential work (new clicks can arrive anytime)
          if (data?.data?.waiting_for_optins) {
            hasWork = true;
          }
        } catch (e) {
          allResults.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            iteration: iterations,
            success: false,
            error: (e as Error).message,
          });
        }
      }

      // If no more work to do, break early
      if (!hasWork && iterations > 1) break;

      // Wait before next iteration
      if (Date.now() - startTime < MAX_RUNTIME_MS - LOOP_INTERVAL_MS) {
        await new Promise(r => setTimeout(r, LOOP_INTERVAL_MS));
      } else {
        break;
      }
    }

    // Self-reinvoke if there are still active campaigns
    const { data: remaining } = await supabase
      .from('campaigns')
      .select('id')
      .eq('status', 'ATIVA')
      .limit(1);

    if (remaining?.length) {
      // Fire-and-forget: reinvoke ourselves after a short delay
      try {
        await fetch(`${supabaseUrl}/functions/v1/auto-process-campaigns`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ trigger: 'self-reinvoke' }),
          signal: AbortSignal.timeout(5000),
        }).catch(() => {}); // Fire and forget
      } catch {}
    }

    return new Response(JSON.stringify({
      success: true,
      iterations,
      runtime_ms: Date.now() - startTime,
      results: allResults,
      will_continue: !!remaining?.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
