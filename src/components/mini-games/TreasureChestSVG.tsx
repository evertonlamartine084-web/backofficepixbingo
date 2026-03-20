import { cn } from '@/lib/utils';

interface TreasureChestSVGProps {
  variant?: 'gold' | 'silver';
  state?: 'locked' | 'opening' | 'won' | 'lost';
  size?: number;
  className?: string;
  onClick?: () => void;
}

/**
 * Silver/metallic locked treasure chest for the game screen.
 * Matches the reference: 3D metallic gray chest with dark lock.
 */
export function TreasureChestSVG({ variant = 'silver', state = 'locked', size = 120, className, onClick }: TreasureChestSVGProps) {
  const isInteractive = state === 'locked';

  return (
    <div
      className={cn(
        'relative transition-all duration-300 select-none',
        isInteractive && 'cursor-pointer hover:scale-105 active:scale-95',
        state === 'opening' && 'animate-chest-shake',
        state === 'won' && 'animate-chest-glow',
        className
      )}
      onClick={isInteractive ? onClick : undefined}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 200 180" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Silver gradient for metallic look */}
          <linearGradient id={`chest-body-${variant}`} x1="0%" y1="0%" x2="0%" y2="100%">
            {variant === 'silver' ? (
              <>
                <stop offset="0%" stopColor="#8a8a8a" />
                <stop offset="30%" stopColor="#6b6b6b" />
                <stop offset="70%" stopColor="#4a4a4a" />
                <stop offset="100%" stopColor="#333" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#d4a017" />
                <stop offset="30%" stopColor="#b8860b" />
                <stop offset="70%" stopColor="#8b6914" />
                <stop offset="100%" stopColor="#6b4f10" />
              </>
            )}
          </linearGradient>
          <linearGradient id={`chest-lid-${variant}`} x1="0%" y1="0%" x2="0%" y2="100%">
            {variant === 'silver' ? (
              <>
                <stop offset="0%" stopColor="#999" />
                <stop offset="50%" stopColor="#777" />
                <stop offset="100%" stopColor="#555" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#f0c040" />
                <stop offset="50%" stopColor="#c89820" />
                <stop offset="100%" stopColor="#a07818" />
              </>
            )}
          </linearGradient>
          <linearGradient id={`chest-trim-${variant}`} x1="0%" y1="0%" x2="100%" y2="0%">
            {variant === 'silver' ? (
              <>
                <stop offset="0%" stopColor="#aaa" />
                <stop offset="50%" stopColor="#ccc" />
                <stop offset="100%" stopColor="#aaa" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#e8b830" />
                <stop offset="50%" stopColor="#ffd700" />
                <stop offset="100%" stopColor="#e8b830" />
              </>
            )}
          </linearGradient>
          <radialGradient id={`lock-bg-${variant}`} cx="50%" cy="40%" r="50%">
            {variant === 'silver' ? (
              <>
                <stop offset="0%" stopColor="#555" />
                <stop offset="100%" stopColor="#2a2a2a" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#8b6914" />
                <stop offset="100%" stopColor="#4a3508" />
              </>
            )}
          </radialGradient>
          {/* Drop shadow */}
          <filter id="chest-shadow">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.5" />
          </filter>
        </defs>

        <g filter="url(#chest-shadow)">
          {/* === CHEST BASE (bottom box) === */}
          <rect x="30" y="95" width="140" height="65" rx="6" fill={`url(#chest-body-${variant})`} stroke={variant === 'silver' ? '#555' : '#6b4f10'} strokeWidth="2" />

          {/* Base horizontal bands */}
          <rect x="30" y="95" width="140" height="10" rx="3" fill={`url(#chest-trim-${variant})`} opacity="0.7" />
          <rect x="30" y="150" width="140" height="10" rx="3" fill={`url(#chest-trim-${variant})`} opacity="0.5" />

          {/* Vertical bands on base */}
          <rect x="55" y="95" width="8" height="65" fill={`url(#chest-trim-${variant})`} opacity="0.4" />
          <rect x="137" y="95" width="8" height="65" fill={`url(#chest-trim-${variant})`} opacity="0.4" />

          {/* Corner studs */}
          <circle cx="40" cy="102" r="4" fill={`url(#chest-trim-${variant})`} />
          <circle cx="160" cy="102" r="4" fill={`url(#chest-trim-${variant})`} />
          <circle cx="40" cy="152" r="4" fill={`url(#chest-trim-${variant})`} />
          <circle cx="160" cy="152" r="4" fill={`url(#chest-trim-${variant})`} />

          {/* === CHEST LID (top dome) === */}
          {state === 'won' ? (
            /* Open lid - tilted back */
            <g transform="rotate(-30, 100, 95)">
              <path d="M30 95 Q35 45 100 35 Q165 45 170 95 Z" fill={`url(#chest-lid-${variant})`} stroke={variant === 'silver' ? '#666' : '#8b6914'} strokeWidth="2" />
              <path d="M30 95 Q35 52 100 42 Q165 52 170 95" fill="none" stroke={`url(#chest-trim-${variant})`} strokeWidth="4" opacity="0.6" />
            </g>
          ) : (
            /* Closed lid */
            <>
              <path d="M30 95 Q35 45 100 35 Q165 45 170 95 Z" fill={`url(#chest-lid-${variant})`} stroke={variant === 'silver' ? '#666' : '#8b6914'} strokeWidth="2" />
              {/* Lid arch band */}
              <path d="M30 95 Q35 52 100 42 Q165 52 170 95" fill="none" stroke={`url(#chest-trim-${variant})`} strokeWidth="4" opacity="0.6" />
              {/* Top ridge */}
              <ellipse cx="100" cy="38" rx="20" ry="4" fill={`url(#chest-trim-${variant})`} opacity="0.5" />
            </>
          )}

          {/* === LOCK MECHANISM === */}
          {(state === 'locked' || state === 'opening') && (
            <g>
              {/* Lock plate */}
              <rect x="82" y="80" width="36" height="32" rx="5" fill={`url(#lock-bg-${variant})`} stroke={variant === 'silver' ? '#777' : '#c89820'} strokeWidth="2" />
              {/* Keyhole - circle */}
              <circle cx="100" cy="91" r="6" fill={variant === 'silver' ? '#1a1a1a' : '#2a1a05'} />
              {/* Keyhole - slot */}
              <rect x="97" y="91" width="6" height="10" rx="1" fill={variant === 'silver' ? '#1a1a1a' : '#2a1a05'} />
              {/* Lock ring on top */}
              <path d="M90 82 Q90 72 100 72 Q110 72 110 82" fill="none" stroke={variant === 'silver' ? '#888' : '#c89820'} strokeWidth="3" strokeLinecap="round" />
            </g>
          )}

          {/* === WIN STATE: Inner glow === */}
          {state === 'won' && (
            <>
              <ellipse cx="100" cy="95" rx="50" ry="15" fill="#ffe429" opacity="0.6" />
              <ellipse cx="100" cy="85" rx="35" ry="25" fill="#ffd700" opacity="0.3" />
              {/* Sparkles */}
              <circle cx="70" cy="60" r="3" fill="#ffe429" opacity="0.9">
                <animate attributeName="opacity" values="0.9;0.2;0.9" dur="1s" repeatCount="indefinite" />
              </circle>
              <circle cx="130" cy="55" r="2" fill="#fff" opacity="0.8">
                <animate attributeName="opacity" values="0.8;0.1;0.8" dur="0.8s" repeatCount="indefinite" />
              </circle>
              <circle cx="100" cy="45" r="2.5" fill="#ffe429" opacity="0.7">
                <animate attributeName="opacity" values="0.7;0.2;0.7" dur="1.2s" repeatCount="indefinite" />
              </circle>
            </>
          )}

          {/* === LOST STATE: dimmed overlay === */}
          {state === 'lost' && (
            <rect x="25" y="30" width="150" height="135" rx="8" fill="#000" opacity="0.4" />
          )}
        </g>
      </svg>
    </div>
  );
}
