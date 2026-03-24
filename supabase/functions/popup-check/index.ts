import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://backofficepixbingo.vercel.app',
  'https://pixbingobr.com',
  'https://www.pixbingobr.com',
  'https://pixbingobr.concurso.club',
  'http://localhost:8080',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsOrigin(req: Request): string {
  const origin = req.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function getCorsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  };
}

const FREQUENCY_MS: Record<string, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\bon\w+\s*=\s*[^\s>]*/gi, '');
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const cpf = url.searchParams.get('cpf')?.replace(/\D/g, '') || '';

    if (!cpf || cpf.length !== 11) {
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

    // Use 'view' events to control frequency (more reliable than dismiss)
    const { data: viewEvents } = await supabase
      .from('popup_events')
      .select('popup_id, updated_at')
      .in('popup_id', popupIds)
      .eq('cpf', cpf)
      .eq('event_type', 'view');

    // Map popup_id -> last view timestamp
    const viewMap = new Map<string, string>();
    for (const e of (viewEvents || [])) {
      const existing = viewMap.get(e.popup_id);
      if (!existing || e.updated_at > existing) {
        viewMap.set(e.popup_id, e.updated_at);
      }
    }

    const nowMs = Date.now();

    const result = popups
      .filter(p => !p.segment_id || matchingSegmentIds.has(p.segment_id))
      .filter(p => {
        if (p.persistent) return true;
        const viewedAt = viewMap.get(p.id);
        if (!viewedAt) return true; // never viewed

        const freq = p.frequency || 'once';
        if (freq === 'once') return false; // viewed once = don't show again

        // Check if enough time has passed since last view
        const intervalMs = FREQUENCY_MS[freq];
        if (!intervalMs) return false;
        const elapsed = nowMs - new Date(viewedAt).getTime();
        return elapsed >= intervalMs;
      })
      .map(p => ({
        id: p.id,
        title: p.title,
        message: p.message,
        image_url: p.image_url,
        button_text: p.button_text,
        button_url: p.button_url,
        custom_html: p.custom_html ? sanitizeHtml(p.custom_html) : null,
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
