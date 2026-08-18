'use client';

/**
 * StockChartModal — shared interactive chart modal.
 *
 * Used from scan results, paper tracker, and PEAD pages. Renders the
 * InteractiveChart with timeframe switching plus optional detail grid
 * and category tagging.
 */
import { useEffect, useState, ReactNode } from 'react';
import { X } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { InteractiveChart, PriceLevel } from '@/components/charts/InteractiveChart';
import { CategoryTagger } from '@/components/categories/CategoryTagger';

interface Props {
  symbol: string;              // raw symbol (with or without .NS)
  title?: string;              // defaults to symbol
  subtitle?: string;
  levels?: PriceLevel[];
  initialTimeframe?: string;
  details?: ReactNode;         // optional detail grid below the chart
  onClose: () => void;
}

export function StockChartModal({
  symbol, title, subtitle, levels = [], initialTimeframe = 'daily', details, onClose,
}: Props) {
  const [timeframe, setTimeframe] = useState(
    ['daily', 'weekly', 'monthly'].includes(initialTimeframe?.toLowerCase() || '')
      ? initialTimeframe.toLowerCase() : 'daily'
  );
  const cleanSymbol = symbol.toUpperCase().replace('.NS', '');

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${cleanSymbol} interactive chart`}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="animate-slide-up">
          <CardHeader
            title={title || cleanSymbol}
            subtitle={subtitle}
            action={
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close chart">
                <X className="h-4 w-4" />
              </Button>
            }
          />
          <div className="px-5 pb-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              {/* Timeframe switcher */}
              <div className="flex gap-2">
                {['daily', 'weekly', 'monthly'].map(tf => (
                  <Button
                    key={tf}
                    variant={timeframe === tf ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setTimeframe(tf)}
                    aria-pressed={timeframe === tf}
                  >
                    {tf.charAt(0).toUpperCase() + tf.slice(1)}
                  </Button>
                ))}
              </div>
              {/* Category tagging */}
              <CategoryTagger symbol={cleanSymbol} />
            </div>

            {/* Interactive chart */}
            <div className="bg-bg rounded-lg border border-border p-2">
              <InteractiveChart symbol={cleanSymbol} timeframe={timeframe} levels={levels} />
            </div>

            {/* Level legend */}
            {levels.length > 0 && (
              <div className="flex flex-wrap gap-3 text-xs">
                {levels.filter(l => l.price != null && !isNaN(l.price as number)).map((l) => (
                  <span key={l.label} className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: l.color }} />
                    <span className="text-text-tertiary">{l.label}</span>
                    <span className="text-text-primary font-medium tabular-nums">{(l.price as number).toFixed(2)}</span>
                  </span>
                ))}
              </div>
            )}

            {details}
          </div>
        </Card>
      </div>
    </div>
  );
}
