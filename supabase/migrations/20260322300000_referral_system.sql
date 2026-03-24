-- Referral system tables (Indique e Ganhe)

-- Referral configuration (admin-managed)
CREATE TABLE IF NOT EXISTS referral_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  active BOOLEAN NOT NULL DEFAULT true,
  -- Rewards for referrer (who invites)
  referrer_reward_type TEXT NOT NULL DEFAULT 'coins', -- coins | xp | diamonds | bonus
  referrer_reward_value NUMERIC NOT NULL DEFAULT 50,
  -- Rewards for referred (who signs up)
  referred_reward_type TEXT NOT NULL DEFAULT 'coins',
  referred_reward_value NUMERIC NOT NULL DEFAULT 25,
  -- Requirements
  require_deposit BOOLEAN NOT NULL DEFAULT true,
  min_deposit_amount NUMERIC NOT NULL DEFAULT 20,
  -- Limits
  max_referrals_per_player INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited
  -- Commission (recurring)
  commission_enabled BOOLEAN NOT NULL DEFAULT false,
  commission_percent NUMERIC NOT NULL DEFAULT 5, -- % of referred deposits
  commission_duration_days INTEGER NOT NULL DEFAULT 30, -- how long commission lasts
  -- Display
  title TEXT NOT NULL DEFAULT 'Indique e Ganhe',
  description TEXT NOT NULL DEFAULT 'Convide amigos e ganhe recompensas!',
  banner_url TEXT,
  terms_text TEXT DEFAULT 'Indique amigos para a plataforma. Quando seu amigo se cadastrar e fizer o primeiro depósito, ambos ganham recompensas!',
  -- Tiers (JSONB array of tier objects)
  tiers JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Player referral codes
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  custom_code TEXT, -- player can set a custom code
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fk_referral_codes_cpf UNIQUE (cpf)
);

-- Referral relationships
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_cpf TEXT NOT NULL, -- who invited
  referred_cpf TEXT NOT NULL, -- who was invited
  referral_code_id UUID REFERENCES referral_codes(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | deposit_required | completed | expired
  -- Rewards tracking
  referrer_rewarded BOOLEAN NOT NULL DEFAULT false,
  referred_rewarded BOOLEAN NOT NULL DEFAULT false,
  referrer_reward_amount NUMERIC DEFAULT 0,
  referred_reward_amount NUMERIC DEFAULT 0,
  -- Deposit tracking
  referred_first_deposit NUMERIC DEFAULT 0,
  referred_first_deposit_at TIMESTAMPTZ,
  -- Commission tracking
  total_commission_earned NUMERIC DEFAULT 0,
  commission_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT unique_referral UNIQUE (referrer_cpf, referred_cpf)
);

-- Commission history
CREATE TABLE IF NOT EXISTS referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID REFERENCES referrals(id),
  referrer_cpf TEXT NOT NULL,
  referred_cpf TEXT NOT NULL,
  deposit_amount NUMERIC NOT NULL,
  commission_percent NUMERIC NOT NULL,
  commission_amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referral_codes_cpf ON referral_codes(cpf);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_cpf);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_cpf);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer ON referral_commissions(referrer_cpf);

-- RLS
ALTER TABLE referral_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_commissions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read config
CREATE POLICY "referral_config_read" ON referral_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "referral_config_all" ON referral_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "referral_codes_read" ON referral_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "referral_codes_all" ON referral_codes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "referrals_read" ON referrals FOR SELECT TO authenticated USING (true);
CREATE POLICY "referrals_all" ON referrals FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "referral_commissions_read" ON referral_commissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "referral_commissions_all" ON referral_commissions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Insert default config
INSERT INTO referral_config (
  active, referrer_reward_type, referrer_reward_value, referred_reward_type, referred_reward_value,
  require_deposit, min_deposit_amount, max_referrals_per_player,
  commission_enabled, commission_percent, commission_duration_days,
  title, description, terms_text,
  tiers
) VALUES (
  true, 'coins', 50, 'coins', 25,
  true, 20, 0,
  false, 5, 30,
  'Indique e Ganhe',
  'Convide amigos e ganhe recompensas a cada indicação!',
  'Convide seus amigos para a plataforma usando seu link exclusivo. Quando seu amigo se cadastrar e fizer o primeiro depósito mínimo, ambos ganham recompensas! Sem limite de indicações.',
  '[{"min_referrals":5,"reward_type":"coins","reward_value":100,"label":"5 indicações = 100 Moedas bônus"},{"min_referrals":10,"reward_type":"diamonds","reward_value":5,"label":"10 indicações = 5 Diamantes"},{"min_referrals":25,"reward_type":"bonus","reward_value":50,"label":"25 indicações = R$50 Bônus"}]'
);
