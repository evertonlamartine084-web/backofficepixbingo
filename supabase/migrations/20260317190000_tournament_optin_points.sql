-- Add opt-in and points configuration to tournaments
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS require_optin BOOLEAN DEFAULT false;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS points_per TEXT DEFAULT '1_real';
-- points_per values: '1_centavo' (1pt per R$0.01), '10_centavos' (1pt per R$0.10), '1_real' (1pt per R$1.00)
