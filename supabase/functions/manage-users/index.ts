import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the caller is an admin
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const token = authHeader.replace('Bearer ', '');
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    
    // Use getClaims for robust validation on Lovable Cloud (ES256)
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error('Auth error:', claimsError?.message);
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: corsHeaders });
    }
    
    const callerId = claimsData.claims.sub as string;

    // Check if caller is admin using service role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Apenas admins podem gerenciar usuários' }), { status: 403, headers: corsHeaders });
    }

    const { action, ...params } = await req.json();

    if (action === 'list') {
      const { data: { users }, error } = await adminClient.auth.admin.listUsers({ perPage: 100 });
      if (error) throw error;

      // Get all roles
      const { data: roles } = await adminClient.from('user_roles').select('*');
      const roleMap = new Map<string, string>();
      (roles || []).forEach((r: any) => roleMap.set(r.user_id, r.role));

      const result = users.map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        role: roleMap.get(u.id) || 'sem_role',
      }));

      return new Response(JSON.stringify({ users: result }), { headers: corsHeaders });
    }

    if (action === 'create') {
      const { email, password, role } = params;
      if (!email || !password || !role) {
        return new Response(JSON.stringify({ error: 'Email, senha e role são obrigatórios' }), { status: 400, headers: corsHeaders });
      }
      if (!['admin', 'operador', 'visualizador'].includes(role)) {
        return new Response(JSON.stringify({ error: 'Role inválida' }), { status: 400, headers: corsHeaders });
      }

      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (authError) throw authError;

      const { error: roleError } = await adminClient
        .from('user_roles')
        .insert({ user_id: authData.user.id, role });
      if (roleError) throw roleError;

      return new Response(JSON.stringify({ success: true, user_id: authData.user.id }), { headers: corsHeaders });
    }

    if (action === 'update_role') {
      const { user_id, role } = params;
      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: 'user_id e role são obrigatórios' }), { status: 400, headers: corsHeaders });
      }
      if (!['admin', 'operador', 'visualizador'].includes(role)) {
        return new Response(JSON.stringify({ error: 'Role inválida' }), { status: 400, headers: corsHeaders });
      }

      // Upsert role
      const { data: existing } = await adminClient
        .from('user_roles')
        .select('id')
        .eq('user_id', user_id)
        .maybeSingle();

      if (existing) {
        await adminClient.from('user_roles').update({ role }).eq('user_id', user_id);
      } else {
        await adminClient.from('user_roles').insert({ user_id, role });
      }

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (action === 'delete') {
      const { user_id } = params;
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'user_id é obrigatório' }), { status: 400, headers: corsHeaders });
      }
      if (user_id === callerId) {
        return new Response(JSON.stringify({ error: 'Não é possível deletar a si mesmo' }), { status: 400, headers: corsHeaders });
      }

      await adminClient.from('user_roles').delete().eq('user_id', user_id);
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (action === 'reset_password') {
      const { user_id, new_password } = params;
      if (!user_id || !new_password) {
        return new Response(JSON.stringify({ error: 'user_id e new_password são obrigatórios' }), { status: 400, headers: corsHeaders });
      }

      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password: new_password });
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'Ação não reconhecida' }), { status: 400, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
