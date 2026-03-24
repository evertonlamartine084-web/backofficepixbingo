-- Add bet requirement fields to referral system

-- Config: bet requirement
ALTER TABLE referral_config
  ADD COLUMN IF NOT EXISTS require_bet BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_bet_amount NUMERIC NOT NULL DEFAULT 10;

-- Referrals: bet tracking
ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS referred_first_bet NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referred_first_bet_at TIMESTAMPTZ;

-- Update default config to require bet
UPDATE referral_config SET require_bet = true, min_bet_amount = 10;
