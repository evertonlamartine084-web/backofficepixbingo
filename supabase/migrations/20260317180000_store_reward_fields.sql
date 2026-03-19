-- Add reward delivery fields to store_items
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS reward_type TEXT DEFAULT 'bonus_deposit';
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS reward_value TEXT;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS reward_description TEXT;

-- Add type field to tournament prizes (stored in JSONB, no schema change needed)
