const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'data';

    // Return all active gamification data
    if (action === 'data') {
      const now = new Date().toISOString();

      const [achievements, missions, tournaments, wheelPrizes] = await Promise.all([
        supabase.from('achievements').select('id, name, description, icon_url, category, condition_type, condition_value, reward_type, reward_value, segment_id, segments(name)')
          .eq('active', true).order('category').order('condition_value'),
        supabase.from('missions').select('id, name, description, icon_url, type, condition_type, condition_value, reward_type, reward_value, segment_id, segments(name)')
          .eq('active', true).order('type').order('condition_value'),
        supabase.from('tournaments').select('id, name, description, image_url, start_date, end_date, metric, game_filter, min_bet, prizes, status, segment_id, segments(name)')
          .eq('status', 'ATIVO').lte('start_date', now).gte('end_date', now).order('end_date'),
        supabase.from('daily_wheel_prizes').select('id, label, value, type, probability, color, icon_url, segment_id, segments(name)')
          .eq('active', true).order('probability', { ascending: false }),
      ]);

      // Also get levels and store items
      const [levels, storeItems] = await Promise.all([
        supabase.from('player_levels').select('*').order('level_number'),
        supabase.from('store_items').select('*').eq('active', true).order('price_coins'),
      ]);

      return new Response(JSON.stringify({
        achievements: achievements.data || [],
        missions: missions.data || [],
        tournaments: tournaments.data || [],
        wheel_prizes: wheelPrizes.data || [],
        levels: levels.data || [],
        store_items: storeItems.data || [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
      });
    }

    // Spin the wheel
    if (action === 'spin') {
      const { data: prizes } = await supabase.from('daily_wheel_prizes')
        .select('id, label, value, type, probability, color')
        .eq('active', true);

      if (!prizes || prizes.length === 0) {
        return new Response(JSON.stringify({ error: 'Nenhum prêmio configurado' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Weighted random selection
      const totalWeight = prizes.reduce((s, p) => s + (p.probability || 1), 0);
      let random = Math.random() * totalWeight;
      let selected = prizes[0];
      for (const prize of prizes) {
        random -= (prize.probability || 1);
        if (random <= 0) { selected = prize; break; }
      }

      return new Response(JSON.stringify({
        prize: selected,
        prizes: prizes, // send all for wheel animation
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Ação desconhecida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
