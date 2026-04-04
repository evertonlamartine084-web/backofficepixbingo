-- Reset XP sync timestamp for test player so next sync reprocesses all transactions
-- with correct keno/cassino classification for mission progress
UPDATE public.player_wallets
SET last_xp_sync = NULL, xp = 0, level = 0, coins = 0, diamonds = 0, total_xp_earned = 0, total_diamonds_earned = 0
WHERE cpf = '70791576418';

-- Clear mission progress so it recalculates cleanly
DELETE FROM public.player_mission_progress WHERE cpf = '70791576418';
DELETE FROM public.player_rewards_pending WHERE cpf = '70791576418';
DELETE FROM public.player_activity_log WHERE cpf = '70791576418';
DELETE FROM public.xp_history WHERE cpf = '70791576418';
DELETE FROM public.level_rewards_log WHERE cpf = '70791576418';
