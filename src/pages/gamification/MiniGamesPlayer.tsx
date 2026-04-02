import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ArrowLeft, Info } from 'lucide-react';
import { ChestGame } from '@/components/mini-games/ChestGame';

interface MiniGamePrize {
  label: string;
  value: number;
  type: string;
  icon?: string;
  color?: string;
}

interface MiniGame {
  id: string;
  name: string;
  description?: string;
  type: string;
  active: boolean;
  free_attempts_per_day?: number;
  created_at: string;
  mini_game_prizes: MiniGamePrize[];
}

const CATEGORIES = [
  { value: 'all', label: 'TODOS' },
  { value: 'gift_box', label: 'BAÚS' },
  { value: 'prize_drop', label: 'ROLETAS' },
  { value: 'scratch_card', label: 'RASPADINHAS' },
];

const CHEST_IMAGE = 'https://d146b4m7rkvjkw.cloudfront.net/62ee214dd40e7486ffd929-image7761.webp';

const DEFAULT_PRIZES = [
  { label: '50 Moedas', value: 50, type: 'coins', icon: '🪙', color: '#f5ae00' },
  { label: '100 Moedas', value: 100, type: 'coins', icon: '🪙', color: '#f5ae00' },
  { label: '500 Moedas', value: 500, type: 'coins', icon: '💰', color: '#f5ae00' },
  { label: '10 XP', value: 10, type: 'xp', icon: '⭐', color: '#8b5cf6' },
  { label: '50 XP', value: 50, type: 'xp', icon: '🌟', color: '#8b5cf6' },
  { label: 'R$ 5 Bônus', value: 5, type: 'bonus', icon: '💎', color: '#22c55e' },
  { label: 'R$ 10 Bônus', value: 10, type: 'bonus', icon: '💎', color: '#22c55e' },
  { label: 'Tente novamente', value: 0, type: 'nothing', icon: '😔', color: '#666' },
];

/* Open chest SVG icon for the ABRIR button */
function ChestIcon() {
  return (
    <svg width="14" height="11" viewBox="0 0 23 17" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.36797 0.236328L11.168 1.37919L19.968 0.236328L22.168 4.80776L19.968 5.46133L14.468 7.09347L12.488 3.6649L11.168 1.37919L9.84797 3.6649L7.86797 7.09347L2.36797 5.46133L0.167969 4.80776L2.36797 0.236328ZM2.36797 13.9506V6.65061L7.56547 8.19347L8.37672 8.43276L8.80984 7.68276L11.1302 3.6649H11.2058L13.5261 7.68276L13.9592 8.43276L14.7705 8.19347L19.968 6.65061V13.9506L11.168 16.2363L2.36797 13.9506Z" fill="white" />
    </svg>
  );
}

export default function MiniGamesPlayer() {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedGame, setSelectedGame] = useState<MiniGame | null>(null);
  const [gameOpen, setGameOpen] = useState(false);
  const [playerKeys, setPlayerKeys] = useState(3);

  const { data: games = [], isLoading } = useQuery({
    queryKey: ['mini_games_active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mini_games')
        .select('*, mini_game_prizes(*)')
        .eq('active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as MiniGame[];
    },
  });

  const filteredGames = activeTab === 'all'
    ? games
    : games.filter(g => g.type === activeTab);

  const openChestGame = (game: MiniGame) => {
    setSelectedGame(game);
    setGameOpen(true);
  };

  const gamePrizes = selectedGame?.mini_game_prizes?.length > 0
    ? selectedGame.mini_game_prizes.map((p: MiniGamePrize) => ({
        label: p.label,
        value: p.value,
        type: p.type,
        icon: p.icon || '🎁',
        color: p.color || '#f5ae00',
      }))
    : DEFAULT_PRIZES;

  return (
    <div className="minigames-page">
      {/* Header */}
      <div className="minigames-header">
        <ArrowLeft className="w-5 h-5 text-white/70 cursor-pointer hover:text-white transition-colors" />
        <h1 className="minigames-title">Mini Games</h1>
      </div>

      {/* Category Tabs */}
      <div className="minigames-tabs">
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            className={`minigames-tab ${activeTab === cat.value ? 'minigames-tab--active' : ''}`}
            onClick={() => setActiveTab(cat.value)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Games Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-white/30" />
        </div>
      ) : (
        <div className="minigames-grid">
          {filteredGames.map(game => {
            const freeAttempts = game.free_attempts_per_day || 0;

            return (
              <div key={game.id} className="minigame-card">
                {/* Info button */}
                <button className="minigame-card-info">
                  <Info className="w-3 h-3" />
                </button>

                {/* Chest image */}
                <div className="minigame-card-image">
                  <img
                    src={CHEST_IMAGE}
                    alt={game.name}
                    draggable={false}
                    loading="lazy"
                  />
                </div>

                {/* Text */}
                <div className="minigame-card-text">
                  <div className="minigame-card-title">{game.name}</div>
                  <div className="minigame-card-description">
                    {game.description || `Baú de ${game.name}`}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="minigame-card-actions">
                  {freeAttempts > 0 && (
                    <div
                      className="minigame-badge-free"
                      onClick={() => openChestGame(game)}
                    >
                      GRÁTIS
                    </div>
                  )}
                  <button
                    className="minigame-btn-open"
                    onClick={() => openChestGame(game)}
                  >
                    <ChestIcon />
                    <span>ABRIR ({playerKeys})</span>
                  </button>
                </div>
              </div>
            );
          })}

          {/* Show a default card if no games exist */}
          {filteredGames.length === 0 && (
            <div className="minigame-card">
              <button className="minigame-card-info">
                <Info className="w-3 h-3" />
              </button>
              <div className="minigame-card-image">
                <img
                  src={CHEST_IMAGE}
                  alt="FICHAS DOURADAS"
                  draggable={false}
                  loading="lazy"
                />
              </div>
              <div className="minigame-card-text">
                <div className="minigame-card-title">FICHAS DOURADAS</div>
                <div className="minigame-card-description">Baú de Fichas Douradas</div>
              </div>
              <div className="minigame-card-actions">
                <div className="minigame-badge-free" onClick={() => {
                  setSelectedGame({ id: 'default', name: 'FICHAS DOURADAS', type: 'gift_box', active: true, created_at: '', mini_game_prizes: [] });
                  setGameOpen(true);
                }}>
                  GRÁTIS
                </div>
                <button className="minigame-btn-open" onClick={() => {
                  setSelectedGame({ id: 'default', name: 'FICHAS DOURADAS', type: 'gift_box', active: true, created_at: '', mini_game_prizes: [] });
                  setGameOpen(true);
                }}>
                  <ChestIcon />
                  <span>ABRIR ({playerKeys})</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chest Game Dialog */}
      {selectedGame && (
        <ChestGame
          open={gameOpen}
          onOpenChange={setGameOpen}
          gameName={selectedGame.name?.split(' ')[0] || 'FICHAS'}
          gameHighlight={selectedGame.name?.split(' ').slice(1).join(' ') || 'DOURADAS'}
          keys={playerKeys}
          onKeysChange={setPlayerKeys}
          prizes={gamePrizes}
        />
      )}
    </div>
  );
}
