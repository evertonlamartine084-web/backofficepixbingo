-- =============================================================
-- PHASE 1: Gamification Foundation
-- Player progress tracking, activity log, spin limits, level rewards
-- =============================================================

-- 1. Player Mission Progress
CREATE TABLE IF NOT EXISTS public.player_mission_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  progress NUMERIC NOT NULL DEFAULT 0,
  target NUMERIC NOT NULL DEFAULT 1,
  completed BOOLEAN NOT NULL DEFAULT false,
  opted_in BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_mission_unique ON player_mission_progress(cpf, mission_id);
CREATE INDEX IF NOT EXISTS idx_player_mission_cpf ON player_mission_progress(cpf);

-- 2. Player Achievement Progress
CREATE TABLE IF NOT EXISTS public.player_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL DEFAULT 1,
  progress NUMERIC NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_achievement_unique ON player_achievements(cpf, achievement_id);
CREATE INDEX IF NOT EXISTS idx_player_achievement_cpf ON player_achievements(cpf);

-- 3. Player Activity Log (coins, xp, spins movements)
CREATE TABLE IF NOT EXISTS public.player_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  balance_after NUMERIC,
  source TEXT NOT NULL,
  source_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_cpf ON player_activity_log(cpf);
CREATE INDEX IF NOT EXISTS idx_activity_log_cpf_created ON player_activity_log(cpf, created_at DESC);

-- 4. Store Purchases
CREATE TABLE IF NOT EXISTS public.store_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL,
  store_item_id UUID NOT NULL REFERENCES public.store_items(id) ON DELETE SET NULL,
  price_coins INTEGER NOT NULL DEFAULT 0,
  price_xp INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_purchases_cpf ON store_purchases(cpf);

-- 5. Player Spins Tracking
CREATE TABLE IF NOT EXISTS public.player_spins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL,
  spins_used_today INTEGER NOT NULL DEFAULT 0,
  last_spin_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_spins INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_spins_cpf ON player_spins(cpf);

-- 6. Pending Rewards (claim manual)
CREATE TABLE IF NOT EXISTS public.player_rewards_pending (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  reward_value NUMERIC NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  source_id UUID,
  description TEXT,
  expires_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pending_rewards_cpf ON player_rewards_pending(cpf);
CREATE INDEX IF NOT EXISTS idx_pending_rewards_unclaimed ON player_rewards_pending(cpf) WHERE claimed_at IS NULL;

-- 7. Enhance player_levels with reward_type, reward_value, xp_multiplier
ALTER TABLE public.player_levels ADD COLUMN IF NOT EXISTS reward_type TEXT;
ALTER TABLE public.player_levels ADD COLUMN IF NOT EXISTS reward_value NUMERIC;
ALTER TABLE public.player_levels ADD COLUMN IF NOT EXISTS xp_multiplier NUMERIC DEFAULT 1;
ALTER TABLE public.player_levels ADD COLUMN IF NOT EXISTS perks JSONB DEFAULT '[]'::jsonb;

-- 8. Enhance missions with new fields
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ATIVO';
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 100;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS require_optin BOOLEAN DEFAULT false;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS time_limit_hours INTEGER;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS recurrence TEXT DEFAULT 'none';
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS cta_text TEXT;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS cta_url TEXT;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS manual_claim BOOLEAN DEFAULT false;

-- 9. Mission Tasks (multi-task missions)
CREATE TABLE IF NOT EXISTS public.mission_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'single',
  condition_type TEXT NOT NULL,
  condition_value NUMERIC NOT NULL DEFAULT 1,
  points_reward INTEGER NOT NULL DEFAULT 0,
  progress_weight NUMERIC NOT NULL DEFAULT 100,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mission_tasks_mission ON mission_tasks(mission_id);

-- 10. Enhance achievements with stages and dates
ALTER TABLE public.achievements ADD COLUMN IF NOT EXISTS stages JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.achievements ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE public.achievements ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
ALTER TABLE public.achievements ADD COLUMN IF NOT EXISTS hide_if_not_earned BOOLEAN DEFAULT false;
ALTER TABLE public.achievements ADD COLUMN IF NOT EXISTS manual_claim BOOLEAN DEFAULT false;
ALTER TABLE public.achievements ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 100;

-- 11. Enhance daily_wheel_prizes / wheel config
ALTER TABLE public.daily_wheel_prizes ADD COLUMN IF NOT EXISTS spin_cost_coins INTEGER DEFAULT 0;
-- Global wheel config table
CREATE TABLE IF NOT EXISTS public.wheel_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  max_spins_per_day INTEGER DEFAULT 3,
  spin_cost_coins INTEGER DEFAULT 0,
  free_spins_per_day INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Insert default config if empty
INSERT INTO public.wheel_config (max_spins_per_day, spin_cost_coins, free_spins_per_day)
SELECT 3, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM public.wheel_config);

-- 12. Enhance tournaments with buy-in and more
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS buy_in_cost INTEGER DEFAULT 0;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS min_players INTEGER;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS max_players INTEGER;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS allow_late_join BOOLEAN DEFAULT true;

-- 13. Tournament entries
CREATE TABLE IF NOT EXISTS public.player_tournament_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL DEFAULT 0,
  rank INTEGER,
  opted_in BOOLEAN NOT NULL DEFAULT false,
  bought_in BOOLEAN NOT NULL DEFAULT false,
  coins_paid INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_entry_unique ON player_tournament_entries(cpf, tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_tournament ON player_tournament_entries(tournament_id);

-- 14. Store items: purchase limits
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS purchase_limit INTEGER;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS limit_period TEXT DEFAULT 'none';

-- RLS policies for new tables
ALTER TABLE public.player_mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_spins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_rewards_pending ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wheel_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_tournament_entries ENABLE ROW LEVEL SECURITY;

-- Allow authenticated (back office) full access
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'player_mission_progress', 'player_achievements', 'player_activity_log',
    'store_purchases', 'player_spins', 'player_rewards_pending',
    'mission_tasks', 'wheel_config', 'player_tournament_entries'
  ]) LOOP
    BEGIN
      EXECUTE format('CREATE POLICY "auth_all_%s" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- Allow anon read for widget
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'player_mission_progress', 'player_achievements', 'player_activity_log',
    'store_purchases', 'player_spins', 'player_rewards_pending',
    'mission_tasks', 'wheel_config', 'player_tournament_entries'
  ]) LOOP
    BEGIN
      EXECUTE format('CREATE POLICY "anon_select_%s" ON public.%I FOR SELECT TO anon USING (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- Allow anon insert/update for edge functions (widget actions)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'player_mission_progress', 'player_achievements', 'player_activity_log',
    'store_purchases', 'player_spins', 'player_rewards_pending',
    'player_tournament_entries'
  ]) LOOP
    BEGIN
      EXECUTE format('CREATE POLICY "anon_insert_%s" ON public.%I FOR INSERT TO anon WITH CHECK (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE format('CREATE POLICY "anon_update_%s" ON public.%I FOR UPDATE TO anon USING (true) WITH CHECK (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
