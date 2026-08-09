'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Scan, Pick, ScanStats, PicksResponse } from '@/lib/api';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Label, Select } from '@/components/ui/Input';
import { TableSkeleton, EmptyState, LoadingState } from '@/components/ui/States';
import { fmt, fmtPct, fmtDate, fmtDuration, cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  ArrowLeft, RefreshCw, Save, BarChart3, X, AlertCircle,
  TrendingUp, Target, Layers,
} from 'lucide-react';

type SortKey = 'score' | 'rr' | 'symbol';

export default function ScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [scan, setScan] = useState<Scan | null>(null);
  const [picksData, setPicksData] = useState<PicksResponse | null>(null);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [picksLoading, setPicksLoading] = useState(false);
  const [chartPick, setChartPick] = useState<Pick | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState('daily');
  const [savingScreen, setSavingScreen] = useState(false);

  // Filters
  const [fPattern, setFPattern] = useState('');
  const [fTimeframe, setFTimeframe] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fSector, setFSector] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [sortDesc, setSortDesc] = useState(true);

  // Derived option lists from stats
  const patternOptions = useMemo(() => stats ? Object.keys(stats.by_pattern).sort() : [], [stats]);
  const sectorOptions = useMemo(() => stats ? Object.keys(stats.by_sector).sort() : [], [stats]);

  const fetchPicks = useCallback(() => {
    if (scan?.status !== 'completed') return;
    setPicksLoading(true);
    const filters: Record<string, string | number | boolean> = { limit: 200 };
    if (fPattern) filters.pattern = fPattern;
    if (fTimeframe) filters.timeframe = fTimeframe;
    if (fStatus) filters.status = fStatus;
    if (fSector) filters.sector = fSector;
    // server-side sort mapping
    const sortMap: Record<SortKey, string> = { score: 'score', rr: 'rr', symbol: 'symbol' };
    filters.sort_by = sortMap[sortBy];
    filters.sort_desc = sortDesc;
    api.listPicks(id, filters)
      .then(setPicksData)
      .catch((e) => toast.error(e.message))
      .finally(() => setPicksLoading(false));
  }, [id, scan?.status, sortBy, sortDesc, fPattern, fTimeframe, fStatus, fSector]);

  // Initial load
  useEffect(() => {
    Promise.all([api.getScan(id), api.scanStats(id)])
      .then(([s, st]) => { setScan(s); setStats(st); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Fetch picks when scan completes or filters change
  useEffect(() => { if (scan?.status === 'completed') fetchPicks(); }, [scan?.status, fetchPicks]);

  // Poll for running/queued scans
  useEffect(() => {
    if (scan?.status !== 'queued' && scan?.status !== 'running') return;
    const interval = setInterval(() => {
      api.getScan(id).then(s => {
        setScan(s);
        if (s.status === 'completed') {
          api.scanStats(id).then(setStats);
          fetchPicks();
        }
      }).catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [scan?.status, id, fetchPicks]);

  const handleSaveScreen = async () => {
    const name = window.prompt('Name this screen:');
    if (!name) return;
    setSavingScreen(true);
    try {
      await api.createScreen(name, {
        pattern: fPattern, timeframe: fTimeframe, status: fStatus,
        sector: fSector, sort_by: sortBy, sort_desc: sortDesc,
      });
      toast.success('Screen saved!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save screen');
    } finally {
      setSavingScreen(false);
    }
  };

  const clearFilters = () => {
    setFPattern(''); setFTimeframe(''); setFStatus(''); setFSector('');
    setSortBy('score'); setSortDesc(true);
  };

  const hasActiveFilters = fPattern || fTimeframe || fStatus || fSector;

  // Top 3 patterns for stats
  const topPatterns = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.by_pattern).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [stats]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <BackLink onClick={() => router.push('/dashboard/scans')} />
        <LoadingState text="Loading scan..." />
      </div>
    );
  }
  if (!scan) {
    return (
      <div className="space-y-6 animate-fade-in">
        <BackLink onClick={() => router.push('/dashboard/scans')} />
        <EmptyState icon={<AlertCircle className="h-12 w-12" />} title="Scan not found" description="This scan may have been deleted." />
      </div>
    );
  }

  const isActive = scan.status === 'queued' || scan.status === 'running';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb back link */}
      <BackLink onClick={() => router.push('/dashboard/scans')} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-text-primary">
              {scan.scan_name || 'Scan Detail'}
            </h1>
            <Badge variant={scan.status}>{scan.status}</Badge>
          </div>
          <p className="text-sm text-text-tertiary mt-1.5 tabular-nums">
            {fmtDate(scan.created_at)} · {fmtDuration(scan.duration_seconds)}
          </p>
          <p className="text-sm text-text-secondary mt-1">
            <span className="text-text-primary font-medium">Top {scan.top}</span>
            {' · '}Score ≥ {scan.min_score}
            {' · '}{scan.sl_mode.toUpperCase()}
            {' · '}{scan.timeframe}
            {scan.bearish && <span className="text-warning ml-1">· BEARISH</span>}
            {scan.test_mode && <span className="text-info ml-1">· TEST</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPicks} aria-label="Refresh picks">
          <RefreshCw className={cn('h-4 w-4', picksLoading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {/* Running state */}
      {isActive && (
        <Card className="border-accent/30 animate-slide-up">
          <div className="flex items-center gap-3 p-5">
            <RefreshCw className="h-5 w-5 text-accent animate-spin shrink-0" />
            <div>
              <p className="text-sm text-text-primary font-medium">
                {scan.status === 'queued' ? 'Scan queued, waiting for worker...' : 'Scan running...'}
              </p>
              <p className="text-xs text-text-tertiary mt-0.5">This takes 5-15 minutes. Page auto-refreshes every 3s.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Failed state */}
      {scan.status === 'failed' && (
        <Card className="border-danger/30 animate-slide-up">
          <div className="flex items-start gap-3 p-5">
            <AlertCircle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-danger">Scan failed</p>
              {scan.error_message && <p className="text-sm text-text-secondary mt-1">{scan.error_message}</p>}
            </div>
          </div>
        </Card>
      )}

      {/* Stats grid */}
      {scan.status === 'completed' && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up">
          <StatCard
            label="Total Picks"
            value={stats.total_picks}
            icon={<BarChart3 className="h-6 w-6" />}
          />
          <StatCard
            label="Avg Score"
            value={fmt(stats.avg_score, 1)}
            icon={<Target className="h-6 w-6" />}
            trend={stats.avg_score >= 60 ? 'up' : stats.avg_score < 45 ? 'down' : 'neutral'}
          />
          <StatCard
            label="Avg R:R"
            value={fmt(stats.avg_rr, 2)}
            icon={<TrendingUp className="h-6 w-6" />}
            trend={stats.avg_rr >= 3 ? 'up' : stats.avg_rr < 2 ? 'down' : 'neutral'}
          />
          <StatCard
            label="Top Patterns"
            value={topPatterns.map(([p]) => p).join(', ') || '—'}
            sublabel={topPatterns.map(([p, c]) => `${p}: ${c}`).join(' · ') || undefined}
            icon={<Layers className="h-6 w-6" />}
          />
        </div>
      )}

      {/* By timeframe + by status breakdown */}
      {scan.status === 'completed' && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader title="By Timeframe" />
            <div className="px-5 pb-5 flex flex-wrap gap-2">
              {Object.entries(stats.by_timeframe).sort().map(([tf, c]) => (
                <Badge key={tf} variant={tf}>{tf}: {c}</Badge>
              ))}
              {Object.keys(stats.by_timeframe).length === 0 && <p className="text-sm text-text-tertiary">No data</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="By Status" />
            <div className="px-5 pb-5 flex flex-wrap gap-2">
              {Object.entries(stats.by_status).sort().map(([st, c]) => (
                <Badge key={st} variant={st}>{st}: {c}</Badge>
              ))}
              {Object.keys(stats.by_status).length === 0 && <p className="text-sm text-text-tertiary">No data</p>}
            </div>
          </Card>
        </div>
      )}

      {/* Filters + Picks table */}
      {scan.status === 'completed' && (
        <>
          <Card>
            <CardHeader
              title={`Picks (${picksData?.total ?? 0})`}
              subtitle="Click a row to view the chart"
              action={
                <div className="flex items-center gap-2">
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleSaveScreen} loading={savingScreen} aria-label="Save current filters as a screen">
                    <Save className="h-4 w-4" /> Save as Screen
                  </Button>
                </div>
              }
            />
            {/* Filter bar */}
            <div className="px-5 pb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <div>
                <Label htmlFor="fPattern">Pattern</Label>
                <Select id="fPattern" value={fPattern} onChange={e => setFPattern(e.target.value)}>
                  <option value="">All patterns</option>
                  {patternOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="fTimeframe">Timeframe</Label>
                <Select id="fTimeframe" value={fTimeframe} onChange={e => setFTimeframe(e.target.value)}>
                  <option value="">All</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="fStatus">Status</Label>
                <Select id="fStatus" value={fStatus} onChange={e => setFStatus(e.target.value)}>
                  <option value="">All</option>
                  <option value="BREAKOUT">Breakout</option>
                  <option value="NEAR">Near</option>
                  <option value="WATCH">Watch</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="fSector">Sector</Label>
                <Select id="fSector" value={fSector} onChange={e => setFSector(e.target.value)}>
                  <option value="">All sectors</option>
                  {sectorOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="sortBy">Sort by</Label>
                <div className="flex gap-2">
                  <Select id="sortBy" value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)} className="flex-1">
                    <option value="score">Score</option>
                    <option value="rr">R:R</option>
                    <option value="symbol">Symbol</option>
                  </Select>
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => setSortDesc(!sortDesc)}
                    aria-label={sortDesc ? 'Descending' : 'Ascending'}
                    className="px-3"
                  >
                    {sortDesc ? '↓' : '↑'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Table */}
            {picksLoading && !picksData ? (
              <TableSkeleton rows={8} cols={8} />
            ) : picksData && picksData.items.length > 0 ? (
              <div className="overflow-x-auto animate-fade-in">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border-subtle text-left text-xs text-text-tertiary uppercase tracking-wide">
                      <th className="py-2.5 px-5 font-medium">Symbol</th>
                      <th className="py-2.5 px-3 font-medium">Pattern</th>
                      <th className="py-2.5 px-3 font-medium">TF</th>
                      <th className="py-2.5 px-3 font-medium">Status</th>
                      <th className="py-2.5 px-3 font-medium text-right">CMP</th>
                      <th className="py-2.5 px-3 font-medium text-right">Breakout</th>
                      <th className="py-2.5 px-3 font-medium text-right">Stop Loss</th>
                      <th className="py-2.5 px-3 font-medium text-right">T1</th>
                      <th className="py-2.5 px-3 font-medium text-right">T2</th>
                      <th className="py-2.5 px-3 font-medium text-right">R:R</th>
                      <th className="py-2.5 px-3 font-medium text-right">Score</th>
                      <th className="py-2.5 px-3 font-medium">Sector</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {picksData.items.map(pick => (
                      <tr
                        key={pick.id}
                        onClick={() => { setChartPick(pick); setChartTimeframe(pick.timeframe?.toLowerCase() || 'daily'); }}
                        className={cn(
                          'cursor-pointer hover:bg-bg-hover transition-colors duration-150',
                          'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-inset',
                          chartPick?.id === pick.id && 'bg-accent-muted'
                        )}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') { setChartPick(pick); setChartTimeframe(pick.timeframe?.toLowerCase() || 'daily'); } }}
                      >
                        <td className="py-2.5 px-5 font-medium text-text-primary">{pick.symbol}</td>
                        <td className="py-2.5 px-3 text-text-secondary">{pick.pattern}</td>
                        <td className="py-2.5 px-3"><Badge variant={pick.timeframe}>{pick.timeframe}</Badge></td>
                        <td className="py-2.5 px-3"><Badge variant={pick.status}>{pick.status}</Badge></td>
                        <td className="py-2.5 px-3 text-right text-text-primary tabular-nums">{fmt(pick.cmp)}</td>
                        <td className="py-2.5 px-3 text-right text-text-secondary tabular-nums">{fmt(pick.breakout)}</td>
                        <td className="py-2.5 px-3 text-right text-danger tabular-nums">{fmt(pick.stop_loss)}</td>
                        <td className="py-2.5 px-3 text-right text-success tabular-nums">{fmt(pick.target_1)}</td>
                        <td className="py-2.5 px-3 text-right text-success tabular-nums">{fmt(pick.target_2)}</td>
                        <td className="py-2.5 px-3 text-right text-text-primary tabular-nums font-medium">{fmt(pick.rr)}</td>
                        <td className="py-2.5 px-3 text-right">
                          <ScoreBar score={pick.score} />
                        </td>
                        <td className="py-2.5 px-3 text-text-tertiary text-xs">{pick.sector || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<BarChart3 className="h-12 w-12" />}
                title="No picks match your filters"
                description={hasActiveFilters ? 'Try adjusting or clearing the filters above.' : 'This scan produced no picks.'}
                action={hasActiveFilters ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined}
              />
            )}
          </Card>
        </>
      )}

      {/* Chart modal */}
      {chartPick && (
        <ChartModal
          pick={chartPick}
          timeframe={chartTimeframe}
          onTimeframeChange={setChartTimeframe}
          onClose={() => setChartPick(null)}
        />
      )}
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded px-1 py-0.5"
    >
      <ArrowLeft className="h-4 w-4" /> Back to Scans
    </button>
  );
}

function ScoreBar({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined || isNaN(score)) return <span className="text-text-tertiary tabular-nums">—</span>;
  const s = Math.max(0, Math.min(100, score));
  const color = s >= 70 ? 'bg-success' : s >= 50 ? 'bg-accent' : s >= 35 ? 'bg-warning' : 'bg-danger';
  const textColor = s >= 70 ? 'text-success' : s >= 50 ? 'text-accent' : s >= 35 ? 'text-warning' : 'text-danger';
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden sm:block w-16 h-1.5 rounded-full bg-bg-hover overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-300', color)} style={{ width: `${s}%` }} />
      </div>
      <span className={cn('font-bold tabular-nums w-8 text-right', textColor)}>{Math.round(s)}</span>
    </div>
  );
}

function ChartModal({ pick, timeframe, onTimeframeChange, onClose }: {
  pick: Pick; timeframe: string; onTimeframeChange: (tf: string) => void; onClose: () => void;
}) {
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
      aria-label={`${pick.symbol} chart viewer`}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="animate-slide-up">
          <CardHeader
            title={`${pick.symbol} · ${pick.pattern}`}
            subtitle={`${pick.timeframe} · ${pick.status} · CMP ${fmt(pick.cmp)}`}
            action={
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close chart">
                <X className="h-4 w-4" />
              </Button>
            }
          />
          <div className="px-5 pb-5 space-y-4">
            {/* Timeframe switcher */}
            <div className="flex gap-2">
              {['daily', 'weekly', 'monthly'].map(tf => (
                <Button
                  key={tf}
                  variant={timeframe === tf ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => onTimeframeChange(tf)}
                  aria-pressed={timeframe === tf}
                >
                  {tf.charAt(0).toUpperCase() + tf.slice(1)}
                </Button>
              ))}
            </div>
            {/* Chart image */}
            <div className="flex justify-center bg-bg rounded-lg p-4 min-h-[300px] items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={api.chartUrl(pick.symbol, timeframe)}
                alt={`${pick.symbol} ${timeframe} chart`}
                className="max-w-full rounded-lg"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.style.display = 'none';
                  const parent = img.parentElement;
                  if (parent && !parent.querySelector('.chart-error')) {
                    const msg = document.createElement('p');
                    msg.className = 'chart-error text-sm text-text-tertiary';
                    msg.textContent = 'Chart not available for this symbol.';
                    parent.appendChild(msg);
                  }
                }}
              />
            </div>
            {/* Pick details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <DetailItem label="Breakout" value={fmt(pick.breakout)} />
              <DetailItem label="Stop Loss" value={fmt(pick.stop_loss)} danger />
              <DetailItem label="Target 1" value={fmt(pick.target_1)} success />
              <DetailItem label="Target 2" value={fmt(pick.target_2)} success />
              <DetailItem label="R:R" value={fmt(pick.rr)} />
              <DetailItem label="Score" value={fmt(pick.score, 0)} />
              <DetailItem label="Upside" value={fmtPct(pick.upside_pct)} success />
              <DetailItem label="Sector" value={pick.sector || '—'} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function DetailItem({ label, value, success, danger }: { label: string; value: string; success?: boolean; danger?: boolean }) {
  return (
    <div>
      <p className="text-xs text-text-tertiary uppercase tracking-wide">{label}</p>
      <p className={cn(
        'text-text-primary tabular-nums mt-0.5 font-medium',
        success && 'text-success', danger && 'text-danger'
      )}>{value}</p>
    </div>
  );
}
