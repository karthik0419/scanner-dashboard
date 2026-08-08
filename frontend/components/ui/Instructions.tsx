'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Info, X, ChevronDown } from 'lucide-react';

interface InstructionStep {
  title: string;
  description: string;
}

interface InstructionsBannerProps {
  title: string;
  steps: InstructionStep[];
  /** Which lucide icon to show. Defaults to Info. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Color theme: blue (info), green (success), amber (warning) */
  variant?: 'blue' | 'green' | 'amber';
  /** localStorage key to remember dismissed state */
  storageKey?: string;
}

const variantStyles = {
  blue: 'border-blue-200 bg-blue-50 text-blue-900',
  green: 'border-green-200 bg-green-50 text-green-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
};

const iconStyles = {
  blue: 'text-blue-500',
  green: 'text-green-500',
  amber: 'text-amber-500',
};

export function InstructionsBanner({
  title,
  steps,
  icon: Icon = Info,
  variant = 'blue',
  storageKey,
}: InstructionsBannerProps) {
  const dismissedKey = storageKey ? `instr-dismissed-${storageKey}` : null;
  const [dismissed, setDismissed] = useState(() => {
    if (!dismissedKey || typeof window === 'undefined') return false;
    return localStorage.getItem(dismissedKey) === 'true';
  });
  const [expanded, setExpanded] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    if (dismissedKey) localStorage.setItem(dismissedKey, 'true');
    setDismissed(true);
  };

  const handleRestore = () => {
    if (dismissedKey) localStorage.removeItem(dismissedKey);
    setDismissed(false);
  };

  // When dismissed, show a small "show instructions" link
  if (dismissed) {
    return (
      <button
        onClick={handleRestore}
        className="text-xs text-text-tertiary hover:text-text-secondary flex items-center gap-1 mb-2"
      >
        <Info className="h-3 w-3" /> Show instructions
      </button>
    );
  }

  return (
    <div className={cn('rounded-lg border p-4 mb-4', variantStyles[variant])}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-1">
          <Icon className={cn('h-5 w-5 mt-0.5 flex-shrink-0', iconStyles[variant])} />
          <div className="flex-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-sm font-semibold w-full text-left"
            >
              {title}
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            </button>
            {expanded && (
              <ol className="mt-3 space-y-2 text-sm">
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={cn('flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold', iconStyles[variant], 'bg-white/60')}>
                      {i + 1}
                    </span>
                    <div>
                      <span className="font-medium">{step.title}</span>
                      <span className="block text-xs opacity-80 mt-0.5">{step.description}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-current opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Dismiss instructions"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
