import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse } from './_cors';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);

  const corsHeaders = getCorsHeaders(req);

  try {
    const { popup_id, cpf, event_type } = await req.json();
    const cleanCpf = (cpf || '').replace(/\D/g, '');

    if (!popup_id || !cleanCpf || cleanCpf.length < 11 || !['view', 'click', 'dismiss'].includes(event_type)) {
      return new Response(JSON.stringify({ error: 'Parâmetros inválidos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cpfMasked = cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4');

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error } = await supabase
      .from('popup_events')
      .upsert(
        { popup_id, cpf: cleanCpf, cpf_masked: cpfMasked, event_type, updated_at: new Date().toISOString() },
        { onConflict: 'popup_id,cpf,event_type' }
      );

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
