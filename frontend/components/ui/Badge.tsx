import { cn } from '@/lib/utils';

const variants: Record<string, string> = {
  // Status — vibrant on light backgrounds
  BREAKOUT: 'bg-success-subtle text-success border-success/20',
  NEAR: 'bg-warning-subtle text-warning border-warning/20',
  WATCH: 'bg-gray-100 text-gray-500 border-gray-200',
  // Regime
  RISK_ON: 'bg-success-subtle text-success border-success/20',
  RISK_OFF: 'bg-danger-subtle text-danger border-danger/20',
  // Sector signals
  BOOM: 'bg-success-subtle text-success border-success/20',
  RISING: 'bg-accent-muted text-accent border-accent/20',
  COOLING: 'bg-warning-subtle text-warning border-warning/20',
  WEAK: 'bg-danger-subtle text-danger border-danger/20',
  // Scan status
  queued: 'bg-gray-100 text-gray-500 border-gray-200',
  running: 'bg-accent-muted text-accent border-accent/20 animate-pulse-soft',
  completed: 'bg-success-subtle text-success border-success/20',
  failed: 'bg-danger-subtle text-danger border-danger/20',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  // Paper trade statuses
  WIN_T1: 'bg-success-subtle text-success border-success/20',
  WIN_T2: 'bg-success-subtle text-success border-success/30',
  LOSS: 'bg-danger-subtle text-danger border-danger/20',
  OPEN: 'bg-accent-muted text-accent border-accent/20',
  WAITING_BREAKOUT: 'bg-warning-subtle text-warning border-warning/20',
  RE_ENTERED: 'bg-purple-50 text-purple-600 border-purple-200',
  TIME_EXIT: 'bg-gray-100 text-gray-500 border-gray-200',
};

export function Badge({ children, variant, className }: { children: React.ReactNode; variant?: string; className?: string }) {
  const colorClass = variants[variant || String(children)] || 'bg-gray-100 text-gray-500 border-gray-200';
  return (
    <span className={cn(
      'inline-flex items-center rounded-md border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide',
      colorClass, className
    )}>
      {children}
    </span>
  );
}
