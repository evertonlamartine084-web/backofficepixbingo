import { useState, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { TreasureChestSVG } from './TreasureChestSVG';
import { KeyRound } from 'lucide-react';

type ChestState = 'locked' | 'opening' | 'won' | 'lost';

interface Prize {
  label: string;
  value: number;
  type: string;
  icon: string;
  color: string;
}

interface ChestGameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameName: string;
  gameHighlight?: string;
  keys: number;
  onKeysChange: (keys: number) => void;
  prizes: Prize[];
}

const REVEAL_DELAY = 1000;

export function ChestGame({ open, onOpenChange, gameName, gameHighlight, keys, onKeysChange, prizes }: ChestGameProps) {
  const [chests, setChests] = useState<ChestState[]>(['locked', 'locked', 'locked']);
  const [result, setResult] = useState<{ won: boolean; prize?: Prize } | null>(null);
  const [showPrizes, setShowPrizes] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const resetGame = useCallback(() => {
    setChests(['locked', 'locked', 'locked']);
    setResult(null);
    setIsProcessing(false);
  }, []);

  const handleChestClick = useCallback((index: number) => {
    if (isProcessing || keys <= 0 || chests[index] !== 'locked') return;

    setIsProcessing(true);
    onKeysChange(keys - 1);

    // Animate opening
    const newChests: ChestState[] = chests.map((s, i) => i === index ? 'opening' : s);
    setChests(newChests);

    setTimeout(() => {
      // Weighted random prize selection
      const totalWeight = prizes.reduce((sum, p) => sum + (p.type === 'nothing' ? 3 : 1), 0);
      let random = Math.random() * totalWeight;
      let selectedPrize: Prize | undefined;

      for (const prize of prizes) {
        const weight = prize.type === 'nothing' ? 3 : 1;
        random -= weight;
        if (random <= 0) {
          selectedPrize = prize;
          break;
        }
      }
      if (!selectedPrize) selectedPrize = prizes[prizes.length - 1];

      const won = selectedPrize.type !== 'nothing';

      const finalChests: ChestState[] = chests.map((_, i) => {
        if (i === index) return won ? 'won' : 'lost';
        return 'locked';
      });

      setChests(finalChests);
      setResult({ won, prize: selectedPrize });
      setIsProcessing(false);
    }, REVEAL_DELAY);
  }, [isProcessing, keys, chests, prizes, onKeysChange]);

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) resetGame();
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="chest-game-dialog border-0 p-0 overflow-hidden max-w-[480px]">
        <div className="chest-game-container">
          {/* Title */}
          <div className="chest-game-title">
            <span className="chest-game-title-main">{gameName}</span>
            {gameHighlight && (
              <span className="chest-game-title-highlight">{gameHighlight}</span>
            )}
          </div>

          {/* Result message */}
          <div className="chest-game-message">
            {result ? (
              result.won ? (
                <span className="chest-game-win">
                  {result.prize?.icon} {result.prize?.label}!
                </span>
              ) : (
                <span className="chest-game-lose">Tente novamente</span>
              )
            ) : (
              <span className="chest-game-instruction">Escolha um baú</span>
            )}
          </div>

          {/* 3 Chests */}
          <div className="chest-game-board">
            {chests.map((state, i) => (
              <div key={i} className="chest-game-slot">
                <TreasureChestSVG
                  variant="silver"
                  state={state}
                  size={110}
                  onClick={() => handleChestClick(i)}
                />
              </div>
            ))}
          </div>

          {/* Keys counter */}
          <div className="chest-game-keys">
            <KeyRound className="w-4 h-4" />
            <span>{keys} CHAVES RESTANTES</span>
          </div>

          {/* Play again */}
          {result && keys > 0 && (
            <button className="chest-game-replay" onClick={resetGame}>
              Jogar novamente
            </button>
          )}

          {/* Possible prizes toggle */}
          <button
            className="chest-game-prizes-toggle"
            onClick={() => setShowPrizes(!showPrizes)}
          >
            POSSIBLE PRIZES
          </button>

          {showPrizes && (
            <div className="chest-game-prizes-list">
              {prizes.filter(p => p.type !== 'nothing').map((prize, i) => (
                <div key={i} className="chest-game-prize-item">
                  <span className="chest-game-prize-icon">{prize.icon}</span>
                  <span className="chest-game-prize-label">{prize.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
