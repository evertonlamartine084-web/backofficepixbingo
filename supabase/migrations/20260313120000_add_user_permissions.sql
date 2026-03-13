-- Add allowed_pages column to user_roles
-- NULL means all pages allowed (backward compatible)
-- When set, only listed page keys are accessible
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS allowed_pages text[];

-- Create a function to get user permissions (callable from frontend)
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('role', ur.role, 'allowed_pages', ur.allowed_pages)
     FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()),
    jsonb_build_object('role', 'sem_role', 'allowed_pages', null)
  );
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;
