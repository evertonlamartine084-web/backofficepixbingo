-- Swap reward_gems and reward_diamonds values in levels table.
-- Diamonds are less valuable than gems, so diamonds should be given in larger quantities.
-- Currently gems > diamonds at every level — this swaps them so diamonds > gems.

UPDATE public.levels
SET
  reward_gems = reward_diamonds,
  reward_diamonds = reward_gems
WHERE level > 0;
