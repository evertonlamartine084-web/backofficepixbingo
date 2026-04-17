import { Gift, Star, Coins } from 'lucide-react';

export interface SkinData {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    accent: string;
    text: string;
    text_secondary: string;
    success: string;
    card_bg: string;
  };
  images: {
    background_url: string;
    logo_url: string;
    prize_icon_url: string;
    scratch_overlay_url: string;
  };
  fonts: {
    primary: string;
    secondary: string;
  };
  border_radius: string;
  animation_speed: string;
  custom_css: string;
}

export const DEFAULT_SKIN_DATA: SkinData = {
  colors: {
    primary: '#8b5cf6',
    secondary: '#6366f1',
    background: '#1a1a2e',
    accent: '#f59e0b',
    text: '#ffffff',
    text_secondary: '#a1a1aa',
    success: '#22c55e',
    card_bg: '#27273a',
  },
  images: {
    background_url: '',
    logo_url: '',
    prize_icon_url: '',
    scratch_overlay_url: '',
  },
  fonts: {
    primary: 'Space Grotesk',
    secondary: 'JetBrains Mono',
  },
  border_radius: '12',
  animation_speed: 'normal',
  custom_css: '',
};

interface SkinPreviewProps {
  skinData: SkinData;
}

const PRIZES = [
  { label: '50 Moedas', icon: 'coins' },
  { label: '100 XP', icon: 'star' },
  { label: 'R$ 10', icon: 'gift' },
];

function PrizeIcon({ type, color, size = 28 }: { type: string; color: string; size?: number }) {
  const props = { size, color, strokeWidth: 1.5 };
  if (type === 'coins') return <Coins {...props} />;
  if (type === 'star') return <Star {...props} />;
  return <Gift {...props} />;
}

export function SkinPreview({ skinData }: SkinPreviewProps) {
  const { colors, images, fonts, border_radius } = skinData;
  const br = `${border_radius}px`;

  return (
    <div
      className="relative w-full max-w-[400px] mx-auto overflow-hidden shadow-2xl"
      style={{
        height: 600,
        backgroundColor: colors.background,
        backgroundImage: images.background_url ? `url(${images.background_url})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderRadius: br,
        fontFamily: fonts.primary,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 pt-6 pb-4"
        style={{ borderBottom: `1px solid ${colors.card_bg}` }}
      >
        {images.logo_url ? (
          <img
            src={images.logo_url}
            alt="Logo"
            className="w-10 h-10 object-contain"
            style={{ borderRadius: br }}
          />
        ) : (
          <div
            className="w-10 h-10 flex items-center justify-center"
            style={{ backgroundColor: colors.primary, borderRadius: br }}
          >
            <Gift size={20} color={colors.text} />
          </div>
        )}
        <div>
          <h2
            className="text-lg font-bold leading-tight"
            style={{ color: colors.text, fontFamily: fonts.primary }}
          >
            Raspadinha da Sorte
          </h2>
          <p
            className="text-xs mt-0.5"
            style={{ color: colors.text_secondary, fontFamily: fonts.secondary }}
          >
            Escolha um card e descubra seu premio
          </p>
        </div>
      </div>

      {/* Prize Grid */}
      <div className="px-5 py-6 flex flex-col gap-4">
        {PRIZES.map((prize, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-4 transition-all"
            style={{
              backgroundColor: colors.card_bg,
              borderRadius: br,
              border: `1.5px solid ${colors.accent}`,
            }}
          >
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 52,
                height: 52,
                borderRadius: br,
                backgroundColor: `${colors.primary}22`,
              }}
            >
              {images.prize_icon_url ? (
                <img src={images.prize_icon_url} alt="" className="w-7 h-7 object-contain" />
              ) : (
                <PrizeIcon type={prize.icon} color={colors.accent} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="font-semibold text-sm"
                style={{ color: colors.text, fontFamily: fonts.primary }}
              >
                {prize.label}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: colors.text_secondary, fontFamily: fonts.secondary }}
              >
                Toque para revelar
              </p>
            </div>
            <div
              className="w-8 h-8 flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: `${colors.accent}33`,
                borderRadius: br,
              }}
            >
              <span style={{ color: colors.accent, fontSize: 16 }}>?</span>
            </div>
          </div>
        ))}
      </div>

      {/* Action Button */}
      <div className="px-5 mt-auto">
        <button
          className="w-full py-3.5 font-bold text-sm tracking-wide transition-all"
          style={{
            backgroundColor: colors.primary,
            color: colors.text,
            borderRadius: br,
            fontFamily: fonts.primary,
            border: 'none',
            cursor: 'pointer',
            boxShadow: `0 4px 20px ${colors.primary}55`,
          }}
        >
          RASPAR AGORA
        </button>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 mt-4 text-center">
        <p
          className="text-[10px]"
          style={{ color: colors.text_secondary, fontFamily: fonts.secondary }}
        >
          Tentativas restantes: 3 &bull; Custo: 0 moedas
        </p>
      </div>

      {/* Scratch overlay indicator */}
      {images.scratch_overlay_url && (
        <div className="absolute top-2 right-2 opacity-40">
          <img src={images.scratch_overlay_url} alt="" className="w-6 h-6 object-contain" />
        </div>
      )}

      {/* Custom CSS (rendered as a style tag) */}
      {skinData.custom_css && (
        <style dangerouslySetInnerHTML={{ __html: skinData.custom_css }} />
      )}
    </div>
  );
}
