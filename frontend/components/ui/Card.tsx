import { cn } from '@/lib/utils';

export function Card({ children, className, hover }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={cn(
      'rounded-xl border border-border bg-white shadow-card',
      hover && 'transition-all duration-200 hover:shadow-elevated hover:border-border-strong',
      className
    )}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between px-5 pt-5 pb-3">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle && <p className="text-xs text-text-tertiary mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, sublabel, trend, icon }: {
  label: string; value: string | number; sublabel?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral'; icon?: React.ReactNode;
}) {
  const trendColor = trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-text-tertiary';
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-text-primary mt-2 tabular-nums">{value}</p>
          {sublabel && <p className={cn('text-xs mt-1', trendColor)}>{sublabel}</p>}
        </div>
        {icon && <div className="text-text-tertiary/30">{icon}</div>}
      </div>
    </Card>
  );
}
