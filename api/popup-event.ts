import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse } from './_cors.js';

export const config = { runtime: 'edge' };

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
    const { popup_id, cpf, event_type } = await req.json();
    const cleanCpf = (cpf || '').replace(/\D/g, '');

    if (!popup_id || !cleanCpf || !isValidCPF(cleanCpf) || !['view', 'click', 'dismiss'].includes(event_type)) {
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
    console.error('[popup-event]', (error as Error).message);
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
