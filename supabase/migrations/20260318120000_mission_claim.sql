-- Add claimed/claimed_at columns to player_mission_progress
ALTER TABLE public.player_mission_progress
  ADD COLUMN IF NOT EXISTS claimed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
