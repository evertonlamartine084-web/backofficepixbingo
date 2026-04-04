-- Add test widget sections column for staging/test environment
ALTER TABLE public.platform_config
  ADD COLUMN IF NOT EXISTS widget_sections_test JSONB NOT NULL DEFAULT '{
    "missions": true,
    "achievements": true,
    "tournaments": true,
    "wheel": true,
    "mini_games": true,
    "store": true,
    "levels": true,
    "referrals": true
  }'::jsonb;

COMMENT ON COLUMN public.platform_config.widget_sections_test IS 'Toggle individual widget sections on/off for test environment';
