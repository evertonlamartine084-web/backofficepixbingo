-- Reset all gamification player data for clean launch
-- All players start fresh at Iniciante (level 0)

-- Reset wallets to zero
UPDATE public.player_wallets SET
  coins = 0,
  xp = 0,
  level = 0,
  diamonds = 0,
  total_coins_earned = 0,
  total_xp_earned = 0,
  total_diamonds_earned = 0,
  last_xp_sync = NULL;

-- Clear mission progress
DELETE FROM public.player_mission_progress;

-- Clear achievement progress
DELETE FROM public.player_achievements;

-- Clear pending rewards
DELETE FROM public.player_rewards_pending;

-- Clear activity log
DELETE FROM public.player_activity_log;

-- Clear XP history
DELETE FROM public.xp_history;

-- Clear level rewards log
DELETE FROM public.level_rewards_log;

-- Clear spin data
DELETE FROM public.player_spins;

-- Clear mini game attempts
DELETE FROM public.player_mini_game_attempts;

-- Clear tournament entries
DELETE FROM public.player_tournament_entries;
