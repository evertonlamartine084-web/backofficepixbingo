const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FREQUENCY_MS: Record<string, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

Deno.serve(async (req: Request) => {
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

    const now = new Date().toISOString();
    const { data: popups, error: popErr } = await supabase
      .from('popups')
      .select('id, title, message, image_url, button_text, button_url, custom_html, style, segment_id, persistent, frequency')
      .eq('active', true)
      .lte('start_date', now)
      .gte('end_date', now);

    if (popErr || !popups?.length) {
      return new Response(JSON.stringify({ popups: [] }), {
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
      .select('popup_id, updated_at')
      .in('popup_id', popupIds)
      .eq('cpf', cpf)
      .eq('event_type', 'dismiss');

    // Map popup_id -> last dismiss timestamp
    const dismissMap = new Map<string, string>();
    for (const e of (dismissedEvents || [])) {
      dismissMap.set(e.popup_id, e.updated_at);
    }

    const nowMs = Date.now();

    const result = popups
      .filter(p => !p.segment_id || matchingSegmentIds.has(p.segment_id))
      .filter(p => {
        if (p.persistent) return true;
        const dismissedAt = dismissMap.get(p.id);
        if (!dismissedAt) return true; // never dismissed

        const freq = p.frequency || 'once';
        if (freq === 'once') return false; // dismissed once = gone

        // Check if enough time has passed since last dismiss
        const intervalMs = FREQUENCY_MS[freq];
        if (!intervalMs) return false;
        const elapsed = nowMs - new Date(dismissedAt).getTime();
        return elapsed >= intervalMs;
      })
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
        frequency: p.frequency || 'once',
      }));

    return new Response(JSON.stringify({ popups: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ popups: [], error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
