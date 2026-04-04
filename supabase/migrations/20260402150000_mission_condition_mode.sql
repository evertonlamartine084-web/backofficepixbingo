-- Add condition_mode to missions: 'amount' (R$ value) or 'count' (number of bets/actions)
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS condition_mode TEXT NOT NULL DEFAULT 'amount';

COMMENT ON COLUMN public.missions.condition_mode IS 'How to measure progress: amount = sum of R$ values, count = number of transactions';
