const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const username = Deno.env.get('PLATFORM_USERNAME');
    const password = Deno.env.get('PLATFORM_PASSWORD');

    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Credenciais da plataforma não configuradas' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch all active campaigns
    const { data: campaigns, error: campErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'ATIVA');

    if (campErr) {
      return new Response(JSON.stringify({ success: false, error: campErr.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!campaigns?.length) {
      return new Response(JSON.stringify({ success: true, message: 'Nenhuma campanha ativa', results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results = [];

    for (const campaign of campaigns) {
      try {
        // Call the existing process-campaign function
        const { data, error } = await supabase.functions.invoke('process-campaign', {
          body: {
            campaign_id: campaign.id,
            username,
            password,
          },
        });

        results.push({
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          success: !error && data?.success,
          data: data?.data || null,
          error: error?.message || data?.error || null,
        });
      } catch (e) {
        results.push({
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          success: false,
          error: (e as Error).message,
        });
      }
    }

    return new Response(JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
