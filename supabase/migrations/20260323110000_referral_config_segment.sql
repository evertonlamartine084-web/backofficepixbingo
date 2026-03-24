-- Add segment_id to referral_config so referral program can be restricted to specific segments
ALTER TABLE referral_config
  ADD COLUMN IF NOT EXISTS segment_id UUID REFERENCES segments(id) ON DELETE SET NULL;
