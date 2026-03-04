import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FinancialKPICardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  variant?: 'default' | 'green' | 'red' | 'blue' | 'amber' | 'purple';
}

const variantConfig = {
  default: { bg: 'bg-secondary/60', iconBg: 'bg-muted', iconColor: 'text-muted-foreground', border: 'border-border/50' },
  green: { bg: 'bg-success/5', iconBg: 'bg-success/15', iconColor: 'text-success', border: 'border-success/20' },
  red: { bg: 'bg-destructive/5', iconBg: 'bg-destructive/15', iconColor: 'text-destructive', border: 'border-destructive/20' },
  blue: { bg: 'bg-primary/5', iconBg: 'bg-primary/15', iconColor: 'text-primary', border: 'border-primary/20' },
  amber: { bg: 'bg-warning/5', iconBg: 'bg-warning/15', iconColor: 'text-warning', border: 'border-warning/20' },
  purple: { bg: 'from-[hsl(270,60%,50%)]/5 to-transparent', iconBg: 'bg-[hsl(270,60%,50%)]/15', iconColor: 'text-[hsl(270,60%,50%)]', border: 'border-[hsl(270,60%,50%)]/20' },
};

export function FinancialKPICard({ title, value, icon: Icon, trend, trendValue, variant = 'default' }: FinancialKPICardProps) {
  const v = variantConfig[variant];

  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl border p-5 transition-all hover:scale-[1.02] hover:shadow-lg',
      v.border, v.bg, 'bg-gradient-to-br'
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground font-mono break-all leading-tight">{value}</p>
          {trend && trendValue && (
            <div className={cn(
              'inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5',
              trend === 'up' && 'bg-success/10 text-success',
              trend === 'down' && 'bg-destructive/10 text-destructive',
              trend === 'neutral' && 'bg-muted text-muted-foreground',
            )}>
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
            </div>
          )}
        </div>
        <div className={cn('p-3 rounded-xl', v.iconBg)}>
          <Icon className={cn('w-5 h-5', v.iconColor)} />
        </div>
      </div>
    </div>
  );
}
