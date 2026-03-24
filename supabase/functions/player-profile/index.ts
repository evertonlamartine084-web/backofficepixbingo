/* eslint-disable @typescript-eslint/no-explicit-any */
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

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth check: require valid Bearer token
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado — token ausente' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerUser }, error: userError } = await callerClient.auth.getUser();
    if (userError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const cpf = url.searchParams.get('cpf')?.replace(/\D/g, '') || '';

    if (!cpf || cpf.length < 11) {
      return new Response(JSON.stringify({ error: 'CPF inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();

    // Fetch all in parallel: inbox messages, levels, store items, player segments
    const [inboxRes, levelsRes, storeRes, segItemsRes] = await Promise.all([
      supabase
        .from('inbox_messages')
        .select('id, title, message, image_url, button_text, button_url, segment_id, start_date, end_date')
        .eq('active', true)
        .lte('start_date', now)
        .gte('end_date', now),
      supabase
        .from('player_levels')
        .select('id, level_number, name, min_xp, color, icon_url, rewards_description')
        .order('level_number', { ascending: true }),
      supabase
        .from('store_items')
        .select('id, name, description, category, price_coins, price_xp, image_url, min_level, stock')
        .eq('active', true),
      supabase
        .from('segment_items')
        .select('segment_id')
        .eq('cpf', cpf),
    ]);

    // Player's segment IDs
    const playerSegmentIds = new Set(
      (segItemsRes.data || []).map((s: any) => s.segment_id)
    );

    // Filter inbox: no segment (global) OR player is in segment
    const inbox = (inboxRes.data || [])
      .filter((m: any) => !m.segment_id || playerSegmentIds.has(m.segment_id))
      .map((m: any) => ({
        id: m.id,
        title: m.title,
        message: m.message,
        image_url: m.image_url,
        button_text: m.button_text,
        button_url: m.button_url,
      }));

    const levels = levelsRes.data || [];
    const store = (storeRes.data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      price_coins: item.price_coins,
      price_xp: item.price_xp,
      image_url: item.image_url,
      min_level: item.min_level,
      stock: item.stock,
    }));

    return new Response(JSON.stringify({
      cpf_masked: cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4'),
      inbox,
      inbox_count: inbox.length,
      levels,
      store,
      store_count: store.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
