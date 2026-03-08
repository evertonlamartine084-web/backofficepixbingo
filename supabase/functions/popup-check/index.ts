const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const cpf = url.searchParams.get('cpf')?.replace(/\D/g, '') || '';

    if (!cpf || cpf.length < 11) {
      return new Response(JSON.stringify({ popups: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get active popups (RLS already filters by active + date range for anon, but we use service role)
    const now = new Date().toISOString();
    const { data: popups, error: popErr } = await supabase
      .from('popups')
      .select('id, title, message, image_url, button_text, button_url, custom_html, style, segment_id, persistent')
      .eq('active', true)
      .lte('start_date', now)
      .gte('end_date', now);

    if (popErr || !popups?.length) {
      return new Response(JSON.stringify({ popups: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check which popups apply to this CPF via segment
    const segmentIds = [...new Set(popups.filter(p => p.segment_id).map(p => p.segment_id))];
    
    let matchingSegmentIds = new Set<string>();

    if (segmentIds.length > 0) {
      // Check if CPF exists in any of these segments
      const { data: items } = await supabase
        .from('segment_items')
        .select('segment_id')
        .in('segment_id', segmentIds)
        .eq('cpf', cpf);

      if (items) {
        matchingSegmentIds = new Set(items.map(i => i.segment_id));
      }
    }

    // Filter: popups with no segment (show to all) OR popups whose segment contains this CPF
    const result = popups
      .filter(p => !p.segment_id || matchingSegmentIds.has(p.segment_id))
      .map(p => ({
        id: p.id,
        title: p.title,
        message: p.message,
        image_url: p.image_url,
        button_text: p.button_text,
        button_url: p.button_url,
        custom_html: p.custom_html,
        style: p.style,
      }));

    return new Response(JSON.stringify({ popups: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ popups: [], error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
