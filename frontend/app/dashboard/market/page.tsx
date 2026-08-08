'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, SectorHeat, MarketRegime } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select, Label } from '@/components/ui/Input';
import { TableSkeleton, EmptyState } from '@/components/ui/States';
import { fmt, fmtPct, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, ArrowUpDown, BarChart3, AlertCircle } from 'lucide-react';
import { InstructionsBanner } from '@/components/ui/Instructions';

type SortKey = 'perf_5d' | 'perf_20d' | 'sector';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'perf_5d', label: '5-Day Performance' },
  { value: 'perf_20d', label: '20-Day Performance' },
  { value: 'sector', label: 'Sector Name' },
];

export default function MarketPage() {
  const [sectors, setSectors] = useState<SectorHeat[]>([]);
  const [regime, setRegime] = useState<MarketRegime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('perf_5d');
  const [sortDesc, setSortDesc] = useState(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.allSettled([api.sectorHeat(), api.marketRegime()]).then(([s, r]) => {
      if (s.status === 'fulfilled') setSectors(s.value);
      else toast.error('Failed to load sector data');
      if (r.status === 'fulfilled') setRegime(r.value);
      if (s.status === 'rejected' && r.status === 'rejected') {
        setError('Unable to load market data. Please try again.');
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sortedSctors = useMemo(() => {
    const sorted = [...sectors].sort((a, b) => {
      let valA: number | string;
      let valB: number | string;
      if (sortKey === 'sector') {
        valA = a.sector;
        valB = b.sector;
        return sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
      }
      valA = a[sortKey] ?? -Infinity;
      valB = b[sortKey] ?? -Infinity;
      return sortDesc ? valB - valA : valA - valB;
    });
    return sorted;
  }, [sectors, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(key !== 'sector');
    }
  };

  const perfColor = (val: number | null | undefined) =>
    cn('tabular-nums font-medium', (val ?? 0) >= 0 ? 'text-success' : 'text-danger');

  const isRiskOn = regime?.status === 'RISK_ON';

  return (
    <div className="space-y-6 animate-fade-in">
      <InstructionsBanner
        storageKey="market"
        title="How to read the market overview"
        icon={BarChart3}
        steps={[
          { title: 'Market regime', description: 'RISK_ON = Nifty above 200 DMA (bullish). RISK_OFF = Nifty below 200 DMA (defensive). Shows how far Nifty is from the 200 DMA line.' },
          { title: 'Sector heat map', description: 'Shows 5-day and 20-day returns for each NSE sector. Green = outperforming, red = underperforming. Use this to pick hot sectors for scans.' },
          { title: 'Signal', description: 'BULLISH = sector in uptrend (5d + 20d both positive). BEARISH = both negative. MIXED = one positive, one negative.' },
          { title: 'How to use', description: 'Before running a scan, check which sectors are hot. Run Smart Daily scan — it automatically focuses on hot sectors.' },
        ]}
      />
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Market</h1>
        <p className="text-sm text-text-tertiary mt-1">Sector rotation and market regime</p>
      </div>

      {loading ? (
        <div className="space-y-6">
          {/* Regime skeleton */}
          <Card className="p-5">
            <div className="h-4 w-32 bg-bg-hover rounded animate-pulse mb-4" />
            <div className="flex gap-6">
              <div className="h-10 w-10 bg-bg-hover rounded-lg animate-pulse" />
              <div className="space-y-2">
                <div className="h-5 w-24 bg-bg-hover rounded animate-pulse" />
                <div className="h-4 w-48 bg-bg-hover rounded animate-pulse" />
              </div>
            </div>
          </Card>
          {/* Sector table skeleton */}
          <Card>
            <TableSkeleton rows={10} cols={5} />
          </Card>
        </div>
      ) : error ? (
        <Card>
          <EmptyState
            icon={<AlertCircle className="h-12 w-12" />}
            title="Unable to load market data"
            description={error}
            action={
              <Button variant="outline" onClick={fetchData}>
                Retry
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* Market regime */}
          <Card>
            <CardHeader title="Market Regime" subtitle="Nifty vs 200-day moving average" />
            {regime ? (
              <div className="px-5 pb-5">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-xl',
                      isRiskOn ? 'bg-success-subtle' : 'bg-danger-subtle'
                    )}
                  >
                    {isRiskOn ? (
                      <TrendingUp className="h-6 w-6 text-success" />
                    ) : (
                      <TrendingDown className="h-6 w-6 text-danger" />
                    )}
                  </div>
                  <div className="flex-1">
                    <Badge variant={regime.status}>{regime.status}</Badge>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3">
                      <div>
                        <span className="text-xs text-text-tertiary">Nifty Close</span>
                        <p className="text-sm font-medium text-text-primary tabular-nums">
                          {fmt(regime.close, 0)}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-text-tertiary">200 DMA</span>
                        <p className="text-sm font-medium text-text-primary tabular-nums">
                          {fmt(regime.dma200, 0)}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-text-tertiary">Distance from 200DMA</span>
                        <p className={cn('text-sm font-medium tabular-nums', perfColor(regime.pct_from_dma))}>
                          {fmtPct(regime.pct_from_dma)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-5 pb-5">
                <EmptyState
                  icon={<BarChart3 className="h-10 w-10" />}
                  title="Regime data unavailable"
                  description="Market regime data could not be loaded."
                />
              </div>
            )}
          </Card>

          {/* Sector rotation */}
          <Card>
            <CardHeader
              title="Sector Rotation"
              subtitle="Performance by sector with momentum signals"
              action={
                <div className="flex items-center gap-2">
                  <Label className="mb-0">
                    <ArrowUpDown className="h-3 w-3 inline mr-1" />
                    Sort
                  </Label>
                  <Select
                    value={sortKey}
                    onChange={(e) => {
                      setSortKey(e.target.value as SortKey);
                      setSortDesc(e.target.value !== 'sector');
                    }}
                    className="w-44"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSortDesc(!sortDesc)}
                    aria-label="Toggle sort direction"
                  >
                    {sortDesc ? '↓ Desc' : '↑ Asc'}
                  </Button>
                </div>
              }
            />
            {sectors.length === 0 ? (
              <EmptyState
                icon={<BarChart3 className="h-12 w-12" />}
                title="No sector data available"
                description="Sector rotation data will appear here once the market data service is running."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-tertiary">
                      <th
                        className="py-2.5 px-3 font-medium cursor-pointer select-none hover:text-text-secondary transition-colors"
                        onClick={() => toggleSort('sector')}
                      >
                        Sector {sortKey === 'sector' && (sortDesc ? '↓' : '↑')}
                      </th>
                      <th className="py-2.5 px-3 font-medium">Signal</th>
                      <th
                        className="py-2.5 px-3 text-right font-medium cursor-pointer select-none hover:text-text-secondary transition-colors"
                        onClick={() => toggleSort('perf_5d')}
                      >
                        5d Perf {sortKey === 'perf_5d' && (sortDesc ? '↓' : '↑')}
                      </th>
                      <th
                        className="py-2.5 px-3 text-right font-medium cursor-pointer select-none hover:text-text-secondary transition-colors"
                        onClick={() => toggleSort('perf_20d')}
                      >
                        20d Perf {sortKey === 'perf_20d' && (sortDesc ? '↓' : '↑')}
                      </th>
                      <th className="py-2.5 px-3 text-right font-medium">Score Bonus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSctors.map((s) => (
                      <tr
                        key={s.sector}
                        className="border-b border-border-subtle transition-colors duration-150 hover:bg-bg-hover"
                      >
                        <td className="py-2.5 px-3 font-medium text-text-primary">{s.sector}</td>
                        <td className="py-2.5 px-3">
                          <Badge variant={s.signal}>{s.signal}</Badge>
                        </td>
                        <td className={cn('py-2.5 px-3 text-right', perfColor(s.perf_5d))}>
                          {fmtPct(s.perf_5d)}
                        </td>
                        <td className={cn('py-2.5 px-3 text-right', perfColor(s.perf_20d))}>
                          {fmtPct(s.perf_20d)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-text-secondary tabular-nums">
                          {s.score_bonus > 0 ? '+' : ''}{s.score_bonus}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
