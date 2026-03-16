import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Content-Type': 'application/json',
};

// Always return 200 so supabase-js SDK can read the body. Errors go in { error: "..." }.
const json = (body: Record<string, any>) =>
  new Response(JSON.stringify(body), { headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Não autorizado — token ausente' });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: userError } = await callerClient.auth.getUser();
    if (userError || !callerUser) {
      console.error('Auth error:', userError?.message);
      return json({ error: 'Sessão inválida — faça login novamente' });
    }

    const callerId = callerUser.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check caller role
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .maybeSingle();

    // Auto-assign admin to first user if table is empty
    if (!roleData) {
      const { count } = await adminClient.from('user_roles').select('*', { count: 'exact', head: true });
      if (count === 0) {
        await adminClient.from('user_roles').insert({ user_id: callerId, role: 'admin' });
        console.log('Auto-assigned admin role to first user:', callerId);
      } else {
        return json({ error: 'Apenas admins podem gerenciar usuários' });
      }
    } else if (roleData.role !== 'admin') {
      return json({ error: 'Apenas admins podem gerenciar usuários' });
    }

    const { action, ...params } = await req.json();

    if (action === 'list') {
      const { data: { users }, error } = await adminClient.auth.admin.listUsers({ perPage: 100 });
      if (error) throw error;

      const { data: roles } = await adminClient.from('user_roles').select('*');
      const roleMap = new Map<string, { role: string; allowed_pages: string[] | null }>();
      (roles || []).forEach((r: any) => roleMap.set(r.user_id, { role: r.role, allowed_pages: r.allowed_pages }));

      const result = users.map(u => {
        const info = roleMap.get(u.id);
        return {
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          role: info?.role || 'sem_role',
          allowed_pages: info?.allowed_pages || null,
        };
      });

      return json({ users: result });
    }

    if (action === 'create') {
      const { email, password, role, allowed_pages } = params;
      if (!email || !password || !role) {
        return json({ error: 'Email, senha e role são obrigatórios' });
      }
      if (!['admin', 'operador', 'visualizador'].includes(role)) {
        return json({ error: 'Role inválida' });
      }

      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (authError) throw authError;

      const insertData: any = { user_id: authData.user.id, role };
      if (allowed_pages && Array.isArray(allowed_pages)) {
        insertData.allowed_pages = allowed_pages;
      }

      const { error: roleError } = await adminClient.from('user_roles').insert(insertData);
      if (roleError) throw roleError;

      return json({ success: true, user_id: authData.user.id });
    }

    if (action === 'update_role') {
      const { user_id, role } = params;
      if (!user_id || !role) {
        return json({ error: 'user_id e role são obrigatórios' });
      }
      if (!['admin', 'operador', 'visualizador'].includes(role)) {
        return json({ error: 'Role inválida' });
      }

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

      return json({ success: true });
    }

    if (action === 'update_permissions') {
      const { user_id, allowed_pages } = params;
      if (!user_id) {
        return json({ error: 'user_id é obrigatório' });
      }

      const updateData: any = { allowed_pages: allowed_pages || null };

      const { data: existing } = await adminClient
        .from('user_roles')
        .select('id')
        .eq('user_id', user_id)
        .maybeSingle();

      if (existing) {
        const { error } = await adminClient.from('user_roles').update(updateData).eq('user_id', user_id);
        if (error) throw error;
      } else {
        const { error } = await adminClient.from('user_roles').insert({ user_id, role: 'visualizador', ...updateData });
        if (error) throw error;
      }

      return json({ success: true });
    }

    if (action === 'delete') {
      const { user_id } = params;
      if (!user_id) {
        return json({ error: 'user_id é obrigatório' });
      }
      if (user_id === callerId) {
        return json({ error: 'Não é possível deletar a si mesmo' });
      }

      await adminClient.from('user_roles').delete().eq('user_id', user_id);
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) throw error;

      return json({ success: true });
    }

    if (action === 'reset_password') {
      const { user_id, new_password } = params;
      if (!user_id || !new_password) {
        return json({ error: 'user_id e new_password são obrigatórios' });
      }

      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password: new_password });
      if (error) throw error;

      return json({ success: true });
    }

    return json({ error: 'Ação não reconhecida' });
  } catch (err) {
    console.error('manage-users error:', (err as Error).message);
    return json({ error: (err as Error).message });
  }
});
