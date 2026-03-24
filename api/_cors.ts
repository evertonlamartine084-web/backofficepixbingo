import { createClient } from '@supabase/supabase-js';

// Allowed origins for CORS — add your production domain(s) here
const ALLOWED_ORIGINS = [
  'https://backofficepixbingo.vercel.app',
  'https://pixbingobr.com',
  'https://www.pixbingobr.com',
  'https://pixbingobr.concurso.club',
  'http://localhost:8080',
  'http://localhost:5173',
  'http://localhost:3000',
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function optionsResponse(req: Request): Response {
  return new Response(null, { headers: getCorsHeaders(req) });
}

export function jsonResponse(body: Record<string, unknown>, req: Request, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/**
 * Verify JWT from Authorization header using Supabase,
 * or verify CRON_SECRET for automated cron calls.
 * Returns the authenticated user or null.
 */
export async function verifyAuth(req: Request): Promise<{ user: { id: string; email?: string } } | null> {
  // Allow cron calls with shared secret (pg_cron + pg_net)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const reqSecret = req.headers.get('x-cron-secret');
    if (reqSecret === cronSecret) {
      return { user: { id: 'cron', email: 'cron@system' } };
    }
  }

  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseKey) return null;

  const client = createClient(supabaseUrl, supabaseKey);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return null;

  return { user: { id: user.id, email: user.email } };
}
