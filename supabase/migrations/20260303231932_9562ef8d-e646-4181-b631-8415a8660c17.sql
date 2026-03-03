
-- Drop all restrictive policies on endpoints
DROP POLICY IF EXISTS "Admins can manage endpoints" ON public.endpoints;
DROP POLICY IF EXISTS "Authenticated can read endpoints" ON public.endpoints;

-- Add permissive policies for endpoints
CREATE POLICY "Anyone can read endpoints" ON public.endpoints FOR SELECT USING (true);
CREATE POLICY "Anyone can insert endpoints" ON public.endpoints FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update endpoints" ON public.endpoints FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete endpoints" ON public.endpoints FOR DELETE USING (true);

-- Drop all restrictive policies on credentials
DROP POLICY IF EXISTS "Admins can manage credentials" ON public.credentials;
DROP POLICY IF EXISTS "Authenticated users can read credentials" ON public.credentials;

CREATE POLICY "Anyone can read credentials" ON public.credentials FOR SELECT USING (true);
CREATE POLICY "Anyone can insert credentials" ON public.credentials FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update credentials" ON public.credentials FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete credentials" ON public.credentials FOR DELETE USING (true);

-- Drop all restrictive policies on flows
DROP POLICY IF EXISTS "Admins can manage flows" ON public.flows;
DROP POLICY IF EXISTS "Authenticated can read flows" ON public.flows;

CREATE POLICY "Anyone can read flows" ON public.flows FOR SELECT USING (true);
CREATE POLICY "Anyone can insert flows" ON public.flows FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update flows" ON public.flows FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete flows" ON public.flows FOR DELETE USING (true);

-- Drop all restrictive policies on bonus_rules
DROP POLICY IF EXISTS "Admins can manage bonus_rules" ON public.bonus_rules;
DROP POLICY IF EXISTS "Authenticated can read bonus_rules" ON public.bonus_rules;

CREATE POLICY "Anyone can read bonus_rules" ON public.bonus_rules FOR SELECT USING (true);
CREATE POLICY "Anyone can insert bonus_rules" ON public.bonus_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update bonus_rules" ON public.bonus_rules FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete bonus_rules" ON public.bonus_rules FOR DELETE USING (true);

-- Drop all restrictive policies on batches
DROP POLICY IF EXISTS "Operators and admins can manage batches" ON public.batches;
DROP POLICY IF EXISTS "Authenticated can read batches" ON public.batches;

CREATE POLICY "Anyone can read batches" ON public.batches FOR SELECT USING (true);
CREATE POLICY "Anyone can insert batches" ON public.batches FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update batches" ON public.batches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete batches" ON public.batches FOR DELETE USING (true);

-- Drop all restrictive policies on batch_items
DROP POLICY IF EXISTS "Operators and admins can manage batch_items" ON public.batch_items;
DROP POLICY IF EXISTS "Authenticated can read batch_items" ON public.batch_items;

CREATE POLICY "Anyone can read batch_items" ON public.batch_items FOR SELECT USING (true);
CREATE POLICY "Anyone can insert batch_items" ON public.batch_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update batch_items" ON public.batch_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete batch_items" ON public.batch_items FOR DELETE USING (true);
