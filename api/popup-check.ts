import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse } from './_cors.js';

export const config = { runtime: 'edge' };

function sanitizeHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '');
}

const FREQUENCY_MS: Record<string, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);

  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url);
    const cpf = url.searchParams.get('cpf')?.replace(/\D/g, '') || '';

    if (!cpf || !isValidCPF(cpf)) {
      return new Response(JSON.stringify({ popups: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (items) matchingSegmentIds = new Set(items.map((i: any) => i.segment_id));
    }

    const popupIds = popups.map(p => p.id);

    const { data: viewEvents } = await supabase
      .from('popup_events')
      .select('popup_id, updated_at')
      .in('popup_id', popupIds)
      .eq('cpf', cpf)
      .eq('event_type', 'view');

    const viewMap = new Map<string, string>();
    for (const e of (viewEvents || [])) {
      const existing = viewMap.get(e.popup_id);
      if (!existing || e.updated_at > existing) viewMap.set(e.popup_id, e.updated_at);
    }

    const nowMs = Date.now();

    const result = popups
      .filter(p => !p.segment_id || matchingSegmentIds.has(p.segment_id))
      .filter(p => {
        if (p.persistent) return true;
        const viewedAt = viewMap.get(p.id);
        if (!viewedAt) return true;
        const freq = p.frequency || 'once';
        if (freq === 'once') return false;
        const intervalMs = FREQUENCY_MS[freq];
        if (!intervalMs) return false;
        return (nowMs - new Date(viewedAt).getTime()) >= intervalMs;
      })
      .map(p => ({
        id: p.id, title: p.title, message: p.message,
        image_url: p.image_url, button_text: p.button_text,
        button_url: p.button_url, custom_html: sanitizeHtml(p.custom_html),
        style: p.style, persistent: p.persistent || false,
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
}
