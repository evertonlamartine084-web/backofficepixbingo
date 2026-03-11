const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const cpf = url.searchParams.get('cpf')?.replace(/\D/g, '') || '';

    if (!cpf || cpf.length < 11) {
      return new Response(JSON.stringify({ popups: [], debug: 'invalid cpf' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();
    const { data: popups, error: popErr } = await supabase
      .from('popups')
      .select('id, title, message, image_url, button_text, button_url, custom_html, style, segment_id, persistent')
      .eq('active', true)
      .lte('start_date', now)
      .gte('end_date', now);

    if (popErr) {
      return new Response(JSON.stringify({ popups: [], debug: 'popups query error', error: popErr.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!popups?.length) {
      return new Response(JSON.stringify({ popups: [], debug: 'no active popups found', now, cpf }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const segmentIds = [...new Set(popups.filter(p => p.segment_id).map(p => p.segment_id))];
    let matchingSegmentIds = new Set<string>();

    if (segmentIds.length > 0) {
      const { data: items } = await supabase
        .from('segment_items')
        .select('segment_id')
        .in('segment_id', segmentIds)
        .eq('cpf', cpf);

      if (items) {
        matchingSegmentIds = new Set(items.map(i => i.segment_id));
      }
    }

    const popupIds = popups.map(p => p.id);
    const { data: dismissedEvents } = await supabase
      .from('popup_events')
      .select('popup_id')
      .in('popup_id', popupIds)
      .eq('cpf', cpf)
      .eq('event_type', 'dismiss');

    const viewedPopupIds = new Set((dismissedEvents || []).map(e => e.popup_id));

    const result = popups
      .filter(p => !p.segment_id || matchingSegmentIds.has(p.segment_id))
      .filter(p => p.persistent || !viewedPopupIds.has(p.id))
      .map(p => ({
        id: p.id,
        title: p.title,
        message: p.message,
        image_url: p.image_url,
        button_text: p.button_text,
        button_url: p.button_url,
        custom_html: p.custom_html,
        style: p.style,
        persistent: p.persistent || false,
      }));

    return new Response(JSON.stringify({
      popups: result,
      debug: {
        now,
        cpf,
        totalActive: popups.length,
        segmentIds: [...segmentIds],
        matchingSegments: [...matchingSegmentIds],
        dismissedCount: viewedPopupIds.size,
        resultCount: result.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ popups: [], debug: 'exception', error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
