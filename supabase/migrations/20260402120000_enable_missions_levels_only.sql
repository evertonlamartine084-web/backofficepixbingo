-- Enable only missions and levels for production launch
UPDATE public.platform_config
SET widget_sections = '{
  "missions": true,
  "achievements": false,
  "tournaments": false,
  "wheel": false,
  "mini_games": false,
  "store": false,
  "levels": true,
  "referrals": false
}'::jsonb
WHERE active = true;
