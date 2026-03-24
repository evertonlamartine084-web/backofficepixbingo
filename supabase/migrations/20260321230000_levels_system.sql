-- =============================================================
-- Levels System: 100 levels + Supremo MAX
-- XP Sources: apostas (1 XP/R$1), depositos (0.3 XP/R$1)
-- =============================================================

-- 1. Levels definition table
CREATE TABLE IF NOT EXISTS public.levels (
  id SERIAL PRIMARY KEY,
  level INTEGER NOT NULL UNIQUE,
  tier TEXT NOT NULL,
  name TEXT NOT NULL,
  xp_required INTEGER NOT NULL DEFAULT 0,
  icon_url TEXT,
  reward_coins INTEGER DEFAULT 0,
  reward_gems INTEGER DEFAULT 0,
  reward_diamonds INTEGER DEFAULT 0,
  color TEXT DEFAULT '#8b5cf6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. XP config (weights per action)
CREATE TABLE IF NOT EXISTS public.xp_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL UNIQUE, -- 'aposta', 'deposito'
  xp_per_real NUMERIC NOT NULL DEFAULT 1,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Player XP tracking (extend player_wallets or separate)
-- Add XP fields to player_wallets
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='player_wallets' AND column_name='xp') THEN
    ALTER TABLE public.player_wallets ADD COLUMN xp INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='player_wallets' AND column_name='level') THEN
    ALTER TABLE public.player_wallets ADD COLUMN level INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='player_wallets' AND column_name='total_xp_earned') THEN
    ALTER TABLE public.player_wallets ADD COLUMN total_xp_earned INTEGER DEFAULT 0;
  END IF;
END $$;

-- 4. XP history log
CREATE TABLE IF NOT EXISTS public.xp_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL,
  action TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xp_history_cpf ON xp_history(cpf);
CREATE INDEX IF NOT EXISTS idx_xp_history_created ON xp_history(created_at DESC);

-- 5. Level-up rewards log
CREATE TABLE IF NOT EXISTS public.level_rewards_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL,
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  reward_coins INTEGER DEFAULT 0,
  reward_gems INTEGER DEFAULT 0,
  reward_diamonds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_level_rewards_cpf ON level_rewards_log(cpf);

-- RLS
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_rewards_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['levels', 'xp_config', 'xp_history', 'level_rewards_log']) LOOP
    BEGIN
      EXECUTE format('CREATE POLICY "auth_all_%s" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE format('CREATE POLICY "anon_select_%s" ON public.%I FOR SELECT TO anon USING (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
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

-- ===== SEED XP CONFIG =====
INSERT INTO xp_config (action, xp_per_real, description, active) VALUES
  ('aposta', 1.0, 'Ganhe 1 XP por cada R$1 apostado', true),
  ('deposito', 0.3, 'Ganhe 0.3 XP por cada R$1 depositado', true)
ON CONFLICT (action) DO NOTHING;

-- ===== SEED LEVELS =====
-- Progressive XP curve: each tier requires increasingly more XP
-- Total XP to reach Supremo MAX ≈ 150,000

-- Tier: Iniciante (Level 0) - Starting level
INSERT INTO levels (level, tier, name, xp_required, icon_url, reward_coins, reward_gems, reward_diamonds, color) VALUES
  (0, 'Iniciante', 'Iniciante', 0, '/widget/levels/level-0.png', 0, 0, 0, '#71717a');

-- Tier: Bronze (Levels 1-10) - 100 to 500 XP each
INSERT INTO levels (level, tier, name, xp_required, icon_url, reward_coins, reward_gems, reward_diamonds, color) VALUES
  (1, 'Bronze', 'Bronze 1', 100, '/widget/levels/level-1.png', 10, 5, 0, '#cd7f32'),
  (2, 'Bronze', 'Bronze 2', 220, '/widget/levels/level-2.png', 12, 5, 0, '#cd7f32'),
  (3, 'Bronze', 'Bronze 3', 360, '/widget/levels/level-3.png', 14, 5, 0, '#cd7f32'),
  (4, 'Bronze', 'Bronze 4', 520, '/widget/levels/level-4.png', 16, 6, 0, '#cd7f32'),
  (5, 'Bronze', 'Bronze 5', 700, '/widget/levels/level-5.png', 18, 6, 0, '#cd7f32'),
  (6, 'Bronze', 'Bronze 6', 900, '/widget/levels/level-6.png', 20, 7, 0, '#cd7f32'),
  (7, 'Bronze', 'Bronze 7', 1120, '/widget/levels/level-7.png', 22, 7, 0, '#cd7f32'),
  (8, 'Bronze', 'Bronze 8', 1360, '/widget/levels/level-8.png', 24, 8, 0, '#cd7f32'),
  (9, 'Bronze', 'Bronze 9', 1620, '/widget/levels/level-9.png', 26, 8, 0, '#cd7f32'),
  (10, 'Bronze', 'Bronze 10', 1900, '/widget/levels/level-10.png', 30, 10, 1, '#cd7f32');

-- Tier: Prata (Levels 11-20) - 500 to 800 XP each
INSERT INTO levels (level, tier, name, xp_required, icon_url, reward_coins, reward_gems, reward_diamonds, color) VALUES
  (11, 'Prata', 'Prata 11', 2400, '/widget/levels/level-11.png', 35, 10, 1, '#c0c0c0'),
  (12, 'Prata', 'Prata 12', 2950, '/widget/levels/level-12.png', 38, 11, 1, '#c0c0c0'),
  (13, 'Prata', 'Prata 13', 3550, '/widget/levels/level-13.png', 40, 12, 1, '#c0c0c0'),
  (14, 'Prata', 'Prata 14', 4200, '/widget/levels/level-14.png', 42, 13, 2, '#c0c0c0'),
  (15, 'Prata', 'Prata 15', 4900, '/widget/levels/level-15.png', 45, 14, 2, '#c0c0c0'),
  (16, 'Prata', 'Prata 16', 5650, '/widget/levels/level-16.png', 48, 15, 2, '#c0c0c0'),
  (17, 'Prata', 'Prata 17', 6450, '/widget/levels/level-17.png', 50, 16, 2, '#c0c0c0'),
  (18, 'Prata', 'Prata 18', 7300, '/widget/levels/level-18.png', 52, 17, 3, '#c0c0c0'),
  (19, 'Prata', 'Prata 19', 8200, '/widget/levels/level-19.png', 55, 18, 3, '#c0c0c0'),
  (20, 'Prata', 'Prata 20', 9150, '/widget/levels/level-20.png', 60, 20, 5, '#c0c0c0');

-- Tier: Ouro (Levels 21-30) - 800 to 1200 XP each
INSERT INTO levels (level, tier, name, xp_required, icon_url, reward_coins, reward_gems, reward_diamonds, color) VALUES
  (21, 'Ouro', 'Ouro 21', 10200, '/widget/levels/level-21.png', 65, 20, 5, '#ffd700'),
  (22, 'Ouro', 'Ouro 22', 11350, '/widget/levels/level-22.png', 68, 22, 5, '#ffd700'),
  (23, 'Ouro', 'Ouro 23', 12600, '/widget/levels/level-23.png', 70, 24, 6, '#ffd700'),
  (24, 'Ouro', 'Ouro 24', 13950, '/widget/levels/level-24.png', 72, 26, 6, '#ffd700'),
  (25, 'Ouro', 'Ouro 25', 15400, '/widget/levels/level-25.png', 75, 28, 7, '#ffd700'),
  (26, 'Ouro', 'Ouro 26', 16950, '/widget/levels/level-26.png', 78, 30, 7, '#ffd700'),
  (27, 'Ouro', 'Ouro 27', 18600, '/widget/levels/level-27.png', 80, 32, 8, '#ffd700'),
  (28, 'Ouro', 'Ouro 28', 20350, '/widget/levels/level-28.png', 82, 34, 8, '#ffd700'),
  (29, 'Ouro', 'Ouro 29', 22200, '/widget/levels/level-29.png', 85, 36, 9, '#ffd700'),
  (30, 'Ouro', 'Ouro 30', 24150, '/widget/levels/level-30.png', 90, 40, 10, '#ffd700');

-- Tier: Titanio (Levels 31-40) - 1200 to 1800 XP each
INSERT INTO levels (level, tier, name, xp_required, icon_url, reward_coins, reward_gems, reward_diamonds, color) VALUES
  (31, 'Titanio', 'Titanio 31', 26300, '/widget/levels/level-31.png', 95, 42, 10, '#878681'),
  (32, 'Titanio', 'Titanio 32', 28600, '/widget/levels/level-32.png', 98, 44, 11, '#878681'),
  (33, 'Titanio', 'Titanio 33', 31050, '/widget/levels/level-33.png', 100, 46, 12, '#878681'),
  (34, 'Titanio', 'Titanio 34', 33650, '/widget/levels/level-34.png', 105, 48, 12, '#878681'),
  (35, 'Titanio', 'Titanio 35', 36400, '/widget/levels/level-35.png', 108, 50, 13, '#878681'),
  (36, 'Titanio', 'Titanio 36', 39300, '/widget/levels/level-36.png', 110, 52, 14, '#878681'),
  (37, 'Titanio', 'Titanio 37', 42350, '/widget/levels/level-37.png', 115, 54, 14, '#878681'),
  (38, 'Titanio', 'Titanio 38', 45550, '/widget/levels/level-38.png', 118, 56, 15, '#878681'),
  (39, 'Titanio', 'Titanio 39', 48900, '/widget/levels/level-39.png', 120, 58, 16, '#878681'),
  (40, 'Titanio', 'Titanio 40', 52400, '/widget/levels/level-40.png', 130, 60, 18, '#878681');

-- Tier: Platina (Levels 41-50) - 1800 to 2500 XP each
INSERT INTO levels (level, tier, name, xp_required, icon_url, reward_coins, reward_gems, reward_diamonds, color) VALUES
  (41, 'Platina', 'Platina 41', 56200, '/widget/levels/level-41.png', 135, 62, 18, '#e5e4e2'),
  (42, 'Platina', 'Platina 42', 60200, '/widget/levels/level-42.png', 140, 64, 19, '#e5e4e2'),
  (43, 'Platina', 'Platina 43', 64400, '/widget/levels/level-43.png', 145, 66, 20, '#e5e4e2'),
  (44, 'Platina', 'Platina 44', 68800, '/widget/levels/level-44.png', 150, 68, 21, '#e5e4e2'),
  (45, 'Platina', 'Platina 45', 73400, '/widget/levels/level-45.png', 155, 70, 22, '#e5e4e2'),
  (46, 'Platina', 'Platina 46', 78200, '/widget/levels/level-46.png', 160, 72, 23, '#e5e4e2'),
  (47, 'Platina', 'Platina 47', 83200, '/widget/levels/level-47.png', 165, 74, 24, '#e5e4e2'),
  (48, 'Platina', 'Platina 48', 88400, '/widget/levels/level-48.png', 170, 76, 25, '#e5e4e2'),
  (49, 'Platina', 'Platina 49', 93800, '/widget/levels/level-49.png', 175, 78, 26, '#e5e4e2'),
  (50, 'Platina', 'Platina 50', 99400, '/widget/levels/level-50.png', 185, 80, 30, '#e5e4e2');

-- Tier: Rubi (Levels 51-60) - 2500 to 3500 XP each
INSERT INTO levels (level, tier, name, xp_required, icon_url, reward_coins, reward_gems, reward_diamonds, color) VALUES
  (51, 'Rubi', 'Rubi 51', 105400, '/widget/levels/level-51.png', 190, 82, 30, '#e0115f'),
  (52, 'Rubi', 'Rubi 52', 111700, '/widget/levels/level-52.png', 195, 84, 32, '#e0115f'),
  (53, 'Rubi', 'Rubi 53', 118300, '/widget/levels/level-53.png', 200, 86, 33, '#e0115f'),
  (54, 'Rubi', 'Rubi 54', 125200, '/widget/levels/level-54.png', 205, 88, 34, '#e0115f'),
  (55, 'Rubi', 'Rubi 55', 132400, '/widget/levels/level-55.png', 210, 90, 35, '#e0115f'),
  (56, 'Rubi', 'Rubi 56', 139900, '/widget/levels/level-56.png', 220, 92, 36, '#e0115f'),
  (57, 'Rubi', 'Rubi 57', 147700, '/widget/levels/level-57.png', 225, 94, 38, '#e0115f'),
  (58, 'Rubi', 'Rubi 58', 155800, '/widget/levels/level-58.png', 230, 96, 39, '#e0115f'),
  (59, 'Rubi', 'Rubi 59', 164200, '/widget/levels/level-59.png', 240, 98, 40, '#e0115f'),
  (60, 'Rubi', 'Rubi 60', 172900, '/widget/levels/level-60.png', 250, 100, 45, '#e0115f');

-- Tier: Diamante (Levels 61-70) - 3500 to 5000 XP each
INSERT INTO levels (level, tier, name, xp_required, icon_url, reward_coins, reward_gems, reward_diamonds, color) VALUES
  (61, 'Diamante', 'Diamante 61', 182200, '/widget/levels/level-61.png', 260, 105, 45, '#06b6d4'),
  (62, 'Diamante', 'Diamante 62', 191900, '/widget/levels/level-62.png', 270, 110, 48, '#06b6d4'),
  (63, 'Diamante', 'Diamante 63', 202000, '/widget/levels/level-63.png', 280, 115, 50, '#06b6d4'),
  (64, 'Diamante', 'Diamante 64', 212500, '/widget/levels/level-64.png', 290, 120, 52, '#06b6d4'),
  (65, 'Diamante', 'Diamante 65', 223400, '/widget/levels/level-65.png', 300, 125, 55, '#06b6d4'),
  (66, 'Diamante', 'Diamante 66', 234700, '/widget/levels/level-66.png', 310, 130, 58, '#06b6d4'),
  (67, 'Diamante', 'Diamante 67', 246400, '/widget/levels/level-67.png', 320, 135, 60, '#06b6d4'),
  (68, 'Diamante', 'Diamante 68', 258500, '/widget/levels/level-68.png', 330, 140, 62, '#06b6d4'),
  (69, 'Diamante', 'Diamante 69', 271000, '/widget/levels/level-69.png', 340, 145, 65, '#06b6d4'),
  (70, 'Diamante', 'Diamante 70', 283900, '/widget/levels/level-70.png', 360, 150, 70, '#06b6d4');

-- Tier: Black (Levels 71-80) - 5000 to 7000 XP each
INSERT INTO levels (level, tier, name, xp_required, icon_url, reward_coins, reward_gems, reward_diamonds, color) VALUES
  (71, 'Black', 'Black 71', 297500, '/widget/levels/level-71.png', 370, 155, 70, '#1a1a2e'),
  (72, 'Black', 'Black 72', 311500, '/widget/levels/level-72.png', 380, 160, 75, '#1a1a2e'),
  (73, 'Black', 'Black 73', 326000, '/widget/levels/level-73.png', 390, 165, 78, '#1a1a2e'),
  (74, 'Black', 'Black 74', 341000, '/widget/levels/level-74.png', 400, 170, 80, '#1a1a2e'),
  (75, 'Black', 'Black 75', 356500, '/widget/levels/level-75.png', 420, 175, 85, '#1a1a2e'),
  (76, 'Black', 'Black 76', 372500, '/widget/levels/level-76.png', 430, 180, 88, '#1a1a2e'),
  (77, 'Black', 'Black 77', 389000, '/widget/levels/level-77.png', 440, 185, 90, '#1a1a2e'),
  (78, 'Black', 'Black 78', 406000, '/widget/levels/level-78.png', 450, 190, 95, '#1a1a2e'),
  (79, 'Black', 'Black 79', 423500, '/widget/levels/level-79.png', 470, 195, 98, '#1a1a2e'),
  (80, 'Black', 'Black 80', 441500, '/widget/levels/level-80.png', 500, 200, 100, '#1a1a2e');

-- Tier: Elite (Levels 81-90) - 7000 to 10000 XP each
INSERT INTO levels (level, tier, name, xp_required, icon_url, reward_coins, reward_gems, reward_diamonds, color) VALUES
  (81, 'Elite', 'Elite 81', 460500, '/widget/levels/level-81.png', 520, 210, 105, '#7c3aed'),
  (82, 'Elite', 'Elite 82', 480500, '/widget/levels/level-82.png', 540, 220, 110, '#7c3aed'),
  (83, 'Elite', 'Elite 83', 501500, '/widget/levels/level-83.png', 560, 230, 115, '#7c3aed'),
  (84, 'Elite', 'Elite 84', 523500, '/widget/levels/level-84.png', 580, 240, 120, '#7c3aed'),
  (85, 'Elite', 'Elite 85', 546500, '/widget/levels/level-85.png', 600, 250, 125, '#7c3aed'),
  (86, 'Elite', 'Elite 86', 570500, '/widget/levels/level-86.png', 620, 260, 130, '#7c3aed'),
  (87, 'Elite', 'Elite 87', 595500, '/widget/levels/level-87.png', 650, 270, 135, '#7c3aed'),
  (88, 'Elite', 'Elite 88', 621500, '/widget/levels/level-88.png', 680, 280, 140, '#7c3aed'),
  (89, 'Elite', 'Elite 89', 648500, '/widget/levels/level-89.png', 700, 290, 145, '#7c3aed'),
  (90, 'Elite', 'Elite 90', 676500, '/widget/levels/level-90.png', 750, 300, 150, '#7c3aed');

-- Tier: Lendario (Levels 91-100) - 10000+ XP each
INSERT INTO levels (level, tier, name, xp_required, icon_url, reward_coins, reward_gems, reward_diamonds, color) VALUES
  (91, 'Lendario', 'Lendário 91', 706500, '/widget/levels/level-91.png', 780, 320, 160, '#f59e0b'),
  (92, 'Lendario', 'Lendário 92', 738500, '/widget/levels/level-92.png', 800, 340, 170, '#f59e0b'),
  (93, 'Lendario', 'Lendário 93', 772500, '/widget/levels/level-93.png', 830, 360, 180, '#f59e0b'),
  (94, 'Lendario', 'Lendário 94', 808500, '/widget/levels/level-94.png', 860, 380, 190, '#f59e0b'),
  (95, 'Lendario', 'Lendário 95', 846500, '/widget/levels/level-95.png', 900, 400, 200, '#f59e0b'),
  (96, 'Lendario', 'Lendário 96', 886500, '/widget/levels/level-96.png', 940, 420, 210, '#f59e0b'),
  (97, 'Lendario', 'Lendário 97', 928500, '/widget/levels/level-97.png', 980, 440, 220, '#f59e0b'),
  (98, 'Lendario', 'Lendário 98', 972500, '/widget/levels/level-98.png', 1020, 460, 230, '#f59e0b'),
  (99, 'Lendario', 'Lendário 99', 1018500, '/widget/levels/level-99.png', 1060, 480, 240, '#f59e0b'),
  (100, 'Lendario', 'Lendário 100', 1066500, '/widget/levels/level-100.png', 1200, 500, 250, '#f59e0b');

-- Tier: Supremo (MAX)
INSERT INTO levels (level, tier, name, xp_required, icon_url, reward_coins, reward_gems, reward_diamonds, color) VALUES
  (101, 'Supremo', 'Supremo MAX', 1150000, '/widget/levels/level-max.png', 2000, 1000, 500, '#ef4444');
