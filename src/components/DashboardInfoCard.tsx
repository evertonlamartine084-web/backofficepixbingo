import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatItem {
  label: string;
  value: string | number;
}

interface DashboardInfoCardProps {
  title: string;
  mainValue: string;
  mainLabel: string;
  icon: LucideIcon;
  iconColor?: string;
  stats?: StatItem[];
  secondaryValue?: string;
  secondaryLabel?: string;
}

export function DashboardInfoCard({
  title,
  mainValue,
  mainLabel,
  icon: Icon,
  iconColor = 'text-primary',
  stats = [],
  secondaryValue,
  secondaryLabel,
}: DashboardInfoCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 hover:shadow-md transition-shadow">
      {/* Header icon + title */}
      {title && (
        <div className="flex items-center gap-2 mb-3">
          <Icon className={cn('w-4 h-4', iconColor)} />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        {/* Left: main value */}
        <div className="space-y-1 min-w-0">
          <p className="tabular-nums text-xl font-bold text-foreground tracking-tight">{mainValue}</p>
          <p className="text-[11px] text-muted-foreground">{mainLabel}</p>
          {secondaryValue && (
            <>
              <p className="tabular-nums text-lg font-bold text-foreground tracking-tight mt-2">{secondaryValue}</p>
              {secondaryLabel && <p className="text-[11px] text-muted-foreground">{secondaryLabel}</p>}
            </>
          )}
        </div>

        {/* Right: stats list */}
        {stats.length > 0 && (
          <div className="text-right space-y-1.5 shrink-0">
            {stats.map((s, i) => (
              <div key={i}>
                <p className="tabular-nums text-sm font-semibold text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
