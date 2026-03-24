-- Seed store items matching the reference platform design
-- Categories: gems (price_xp), coins (price_coins), diamonds (price_diamonds)

-- ===== GEMS SECTION (Saldo Real items, priced in XP/gems) =====
INSERT INTO store_items (name, description, image_url, price_xp, price_coins, price_diamonds, category, active, reward_type, reward_value, reward_description, discount_percent)
VALUES
  ('R$ 5,00 de Saldo Real', 'R$ 5,00 de Saldo Real e você pode comprar esse item com Gems', 'https://d146b4m7rkvjkw.cloudfront.net/c651d018d935ebf65107d5-SALDO-REAL-4.webp', 50, 0, 0, 'saldo_real', true, 'bonus_deposit', '5', 'R$ 5,00 em saldo real', 0),
  ('R$ 10,00 de Saldo Real', 'R$ 10,00 de Saldo Real e você pode comprar esse item com Gems', 'https://d146b4m7rkvjkw.cloudfront.net/dde6f751c52313ed06904e-SALDO-REAL3.webp', 100, 0, 0, 'saldo_real', true, 'bonus_deposit', '10', 'R$ 10,00 em saldo real', 0),
  ('R$ 25,00 de Saldo Real', 'R$ 25,00 de Saldo Real e você pode comprar esse item com Gems', 'https://d146b4m7rkvjkw.cloudfront.net/48f5bb410a7591e3fadbda-SALDO-REAL.webp', 236, 0, 0, 'saldo_real', true, 'bonus_deposit', '25', 'R$ 25,00 em saldo real', 9),
  ('R$ 50,00 de Saldo Real', 'R$ 50,00 de Saldo Real e você pode comprar esse item com Gems', 'https://d146b4m7rkvjkw.cloudfront.net/e1c4fd2a049b6d5184fa2b-SALDO-REAL6.webp', 450, 0, 0, 'saldo_real', true, 'bonus_deposit', '50', 'R$ 50,00 em saldo real', 10),
  ('R$ 100,00 de Saldo Real', 'R$ 100,00 de Saldo Real e você pode comprar esse item com Gems', 'https://d146b4m7rkvjkw.cloudfront.net/030d879c64f1cd872c43b1-SALDO-REAL5.webp', 850, 0, 0, 'saldo_real', true, 'bonus_deposit', '100', 'R$ 100,00 em saldo real', 15);

-- ===== COINS SECTION (Game spins, priced in coins) =====
INSERT INTO store_items (name, description, image_url, price_coins, price_xp, price_diamonds, category, active, reward_type, reward_value, reward_description, discount_percent)
VALUES
  -- Master Joker
  ('10 Giros no Master Joker', '10X Giros no Master Joker da Pragmatic e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/f7d9b4a75bcfe54afcb1bf-MASTER-JOKER.webp', 45, 0, 0, 'giros', true, 'free_spins', '10', '10 giros grátis no Master Joker', 0),
  -- Yo Dragon
  ('01 Giro no Yo Dragon', '01X Giro no Yo Dragon da PopOk e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/fbf54863218064bd788bd8-YO-DRAGON-2.webp', 84, 0, 0, 'giros', true, 'free_spins', '1', '1 giro grátis no Yo Dragon', 0),
  -- Tigre Sortudo
  ('05 Giros no Tigre Sortudo', '05X Giros no Tigre Sortudo da Pragmatic e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/8966daf1a2323715debca7-TIGRE-SORTUDO.webp', 120, 0, 0, 'giros', true, 'free_spins', '5', '5 giros grátis no Tigre Sortudo', 0),
  -- Touro Sortudo
  ('10 Giros no Touro Sortudo', '10X Giros no Touro Sortudo da Pragmatic e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/0162c2f738020463438b0b-TOURO-SORTUDO4.webp', 540, 0, 0, 'giros', true, 'free_spins', '10', '10 giros grátis no Touro Sortudo', 0),
  -- Gates Of Olympus
  ('01 Giro no Gates Of Olympus', '01X Giro no Gates Of Olympus da Pragmatic e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/6f97cbde4b97fa59759c7c-GATES.webp', 108, 0, 0, 'giros', true, 'free_spins', '1', '1 giro grátis no Gates Of Olympus', 0),
  -- Sweet Bonanza
  ('01 Giro no Sweet Bonanza 1000', '01X Giro no Sweet Bonanza 1000 da Pragmatic e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/6d09103a3301bc995f29ce-SWEET-BONANZA5.webp', 95, 0, 0, 'giros', true, 'free_spins', '1', '1 giro grátis no Sweet Bonanza 1000', 0),
  -- Fortune Tiger
  ('01 Giro no Fortune Tiger', '01X Giro no Fortune Tiger da PG Soft e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/df3d9c93c5a8a02f98ec7f-TIGER-1.webp', 75, 0, 0, 'giros', true, 'free_spins', '1', '1 giro grátis no Fortune Tiger', 0),
  -- Fortune Dragon
  ('01 Giro no Fortune Dragon', '01X Giro no Fortune Dragon da PG Soft e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/ce49a1c5537460f011e554-FORTUNE-DRAGON-2.webp', 90, 0, 0, 'giros', true, 'free_spins', '1', '1 giro grátis no Fortune Dragon', 0),
  -- Fortune Rabbit
  ('01 Giro no Fortune Rabbit', '01X Giro no Fortune Rabbit da PG Soft e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/75e0f12b30fb89d37e8728-GIROS-RABBIT-4.webp', 80, 0, 0, 'giros', true, 'free_spins', '1', '1 giro grátis no Fortune Rabbit', 0),
  -- Rico Gorila
  ('10 Giros no Rico Gorila', '10X Giros no Rico Gorila e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/6e1f8bd9d60e6b86852458-RICO-GORILA-4.webp', 150, 0, 0, 'giros', true, 'free_spins', '10', '10 giros grátis no Rico Gorila', 0);

-- ===== DIAMONDS SECTION (Gem roulette/chests, priced in diamonds) =====
INSERT INTO store_items (name, description, image_url, price_diamonds, price_coins, price_xp, category, active, reward_type, reward_value, reward_description, discount_percent)
VALUES
  ('01 Roleta de Gemas', '01X Roleta de Gemas e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/47ee5fa9d8ca31df9f064f-image219.webp', 104, 0, 0, 'roleta_gemas', true, 'gem_roulette', '1', '1 rodada na Roleta de Gemas', 0),
  ('01 Baú de Gemas', '01X Baú de Gemas e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/3f3b2b29c0c3a0e63f954c-baudegemas.webp', 160, 0, 0, 'bau_gemas', true, 'gem_chest', '1', '1 Baú de Gemas', 0),
  ('02 Roleta de Gemas', '02X Roleta de Gemas e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/47ee5fa9d8ca31df9f064f-image219.webp', 210, 0, 0, 'roleta_gemas', true, 'gem_roulette', '2', '2 rodadas na Roleta de Gemas', 0),
  ('02 Baús de Gemas', '02X Baús de Gemas e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/3f3b2b29c0c3a0e63f954c-baudegemas.webp', 320, 0, 0, 'bau_gemas', true, 'gem_chest', '2', '2 Baús de Gemas', 0),
  ('05 Roletas de Gemas', '05X Roletas de Gemas e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/47ee5fa9d8ca31df9f064f-image219.webp', 499, 0, 0, 'roleta_gemas', true, 'gem_roulette', '5', '5 rodadas na Roleta de Gemas', 5),
  ('01 Baú de Diamante', '01X Baú de Diamante e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/15e84bd1c14fa9f625e890-image1981214335.webp', 200, 0, 0, 'bau_diamante', true, 'diamond_chest', '1', '1 Baú de Diamante', 0),
  ('02 Baús de Diamante', '02X Baús de Diamante e você pode comprar esse item 5 vezes por dia.', 'https://d146b4m7rkvjkw.cloudfront.net/15e84bd1c14fa9f625e890-image1981214335.webp', 380, 0, 0, 'bau_diamante', true, 'diamond_chest', '2', '2 Baús de Diamante', 5);
