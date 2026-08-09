'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, PaperTrade, TrackerSummary, ScanDateInfo } from '@/lib/api';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select, Label, Input } from '@/components/ui/Input';
import { TableSkeleton, EmptyState } from '@/components/ui/States';
import { fmt, fmtPct, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { RefreshCw, Activity, TrendingUp, TrendingDown, Target, Wallet, Calendar, Zap, Clock, CheckCircle, XCircle } from 'lucide-react';
import { InstructionsBanner } from '@/components/ui/Instructions';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'WAITING_BREAKOUT', label: 'Waiting Breakout' },
  { value: 'WIN_T1', label: 'Win T1' },
  { value: 'WIN_T2', label: 'Win T2' },
  { value: 'LOSS', label: 'Loss' },
  { value: 'RE_ENTERED', label: 'Re-entered' },
  { value: 'TIME_EXIT', label: 'Time Exit' },
];

/** Entry signal logic — based on status, days held, and price vs breakout */
function getEntrySignal(t: PaperTrade): { label: string; color: string; icon: typeof Zap } {
  const status = t.current_status;
  const days = t.days_held || 0;

  if (['WIN_T2', 'LOSS', 'TIME_EXIT'].includes(status)) {
    return { label: 'DONE', color: 'text-text-tertiary bg-gray-100', icon: CheckCircle };
  }
  if (status === 'WIN_T1') {
    return { label: 'T1 HIT', color: 'text-success bg-green-50', icon: CheckCircle };
  }
  if (status === 'RE_ENTERED') {
    return { label: 'RE-ENTER', color: 'text-accent bg-blue-50', icon: Zap };
  }
  if (status === 'OPEN') {
    // Open trade — already entered
    if (days <= 3) return { label: 'JUST ENTERED', color: 'text-accent bg-blue-50', icon: Zap };
    return { label: 'ACTIVE', color: 'text-accent bg-blue-50', icon: Activity };
  }
  if (status === 'WAITING_BREAKOUT') {
    // Not yet entered — check if price is near breakout
    const breakout = t.breakout_level;
    const current = t.current_price;
    if (breakout && current) {
      const distPct = ((current - breakout) / breakout) * 100;
      if (distPct >= -2 && distPct < 0) return { label: 'NEAR BO', color: 'text-amber-600 bg-amber-50', icon: Clock };
      if (distPct >= 0) return { label: 'BREAKING!', color: 'text-success bg-green-50', icon: Zap };
      if (distPct < -10) return { label: 'FAR AWAY', color: 'text-text-tertiary bg-gray-100', icon: Clock };
    }
    // Days-based decay
    if (days > 20) return { label: 'STALE', color: 'text-text-tertiary bg-gray-100', icon: Clock };
    return { label: 'WAITING', color: 'text-amber-600 bg-amber-50', icon: Clock };
  }
  return { label: status, color: 'text-text-tertiary bg-gray-100', icon: Activity };
}

/** Format date as "Aug 09" or "Today" / "Yesterday" */
function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  d.setHours(0, 0, 0, 0);

  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

/** Days ago from date string */
function daysAgo(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default function TrackerPage() {
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [dates, setDates] = useState<ScanDateInfo[]>([]);
  const [summary, setSummary] = useState<TrackerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [symbolSearch, setSymbolSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(''); // '' = all dates

  const fetchData = useCallback(() => {
    Promise.allSettled([
      api.listTrades(),
      api.trackerDates(),
      api.trackerSummary(),
    ]).then(([t, d, s]) => {
      if (t.status === 'fulfilled') setTrades(t.value);
      else toast.error('Failed to load trades');
      if (d.status === 'fulfilled') setDates(d.value);
      if (s.status === 'fulfilled') setSummary(s.value);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api.syncTracker();
      toast.success(`Synced ${result.synced} trades`);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (statusFilter && t.current_status !== statusFilter) return false;
      if (symbolSearch && !t.symbol.includes(symbolSearch.toUpperCase())) return false;
      if (selectedDate && t.scan_date && !t.scan_date.startsWith(selectedDate)) return false;
      return true;
    });
  }, [trades, statusFilter, symbolSearch, selectedDate]);

  const pnlColor = (val: number | null | undefined) =>
    cn('tabular-nums font-medium', (val ?? 0) >= 0 ? 'text-success' : 'text-danger');

  return (
    <div className="space-y-6 animate-fade-in">
      <InstructionsBanner
        storageKey="tracker"
        title="How the paper tracker works"
        icon={Activity}
        variant="green"
        steps={[
          { title: 'Date grouping', description: 'Click a date chip below to see only stocks flagged on that scan date. "All Dates" shows everything.' },
          { title: 'Entry Signal', description: 'Each stock has an entry signal: ENTER NOW (breakout confirmed), NEAR BO (within 2% of breakout), WAITING (below breakout), STALE (20+ days no breakout), DONE (closed trade).' },
          { title: 'Sync from scanner-v3', description: 'Click "Sync" to import picks from the local scanner-v3 paper_tracker.csv file.' },
          { title: 'Statuses', description: 'WAITING_BREAKOUT = NEAR pick not yet entered. OPEN = active trade. WIN_T1 = hit target 1. LOSS = stop loss hit. RE_ENTERED = recovered after whipsaw.' },
          { title: 'Re-entry logic', description: 'If a trade hits SL but the stock recovers above breakout within 30 days, it auto re-enters with a tight 2% stop. 49% win rate on re-entries.' },
        ]}
      />
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Paper Tracker</h1>
          <p className="text-sm text-text-tertiary mt-1">Live tracking of scan picks with auto re-entry</p>
        </div>
        <Button onClick={handleSync} loading={syncing} disabled={syncing}>
          <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
          Sync Prices
        </Button>
      </div>

      {/* Stat cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Trades"
            value={summary.total}
            icon={<Activity className="h-6 w-6" />}
          />
          <StatCard
            label="Win Rate"
            value={`${summary.win_rate}%`}
            sublabel={`${summary.wins}W / ${summary.losses}L`}
            trend={summary.win_rate >= 50 ? 'up' : 'down'}
            icon={<Target className="h-6 w-6" />}
          />
          <StatCard
            label="Avg P&L"
            value={fmtPct(summary.avg_pnl)}
            trend={(summary.avg_pnl ?? 0) >= 0 ? 'up' : 'down'}
            icon={(summary.avg_pnl ?? 0) >= 0 ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
          />
          <StatCard
            label="Open Trades"
            value={summary.open}
            sublabel={summary.open > 0 ? 'Active positions' : 'No open trades'}
            trend="neutral"
            icon={<Wallet className="h-6 w-6" />}
          />
        </div>
      )}

      {/* Date selector chips */}
      {dates.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-text-tertiary" />
            <span className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Scan Date</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedDate('')}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
                selectedDate === ''
                  ? 'border-accent bg-accent text-white shadow-sm'
                  : 'border-border bg-white text-text-secondary hover:border-border-strong hover:bg-bg-hover'
              )}
            >
              All Dates
              <span className="ml-1.5 text-xs opacity-70">({trades.length})</span>
            </button>
            {dates.map((d) => {
              const active = selectedDate === d.date;
              const ago = daysAgo(d.date);
              return (
                <button
                  key={d.date}
                  onClick={() => setSelectedDate(active ? '' : d.date)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
                    active
                      ? 'border-accent bg-accent text-white shadow-sm'
                      : 'border-border bg-white text-text-secondary hover:border-border-strong hover:bg-bg-hover'
                  )}
                >
                  <span>{formatDateLabel(d.date)}</span>
                  <span className="ml-1.5 text-xs opacity-70">({d.total})</span>
                  {d.enter_now > 0 && (
                    <span className={cn(
                      'ml-1.5 inline-flex items-center rounded px-1 text-[10px] font-bold',
                      active ? 'bg-white/20 text-white' : 'bg-green-100 text-success'
                    )}>
                      {d.enter_now} ENTER
                    </span>
                  )}
                  {d.wins > 0 && (
                    <span className={cn(
                      'ml-1 inline-flex items-center rounded px-1 text-[10px] font-bold',
                      active ? 'bg-white/20 text-white' : 'bg-green-50 text-success'
                    )}>
                      {d.wins}W
                    </span>
                  )}
                  {d.losses > 0 && (
                    <span className={cn(
                      'ml-1 inline-flex items-center rounded px-1 text-[10px] font-bold',
                      active ? 'bg-white/20 text-white' : 'bg-red-50 text-danger'
                    )}>
                      {d.losses}L
                    </span>
                  )}
                  <span className="ml-1.5 text-[10px] opacity-50">
                    {ago === 0 ? 'today' : ago === 1 ? '1d ago' : `${ago}d ago`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-48">
          <Label htmlFor="status-filter">Status</Label>
          <Select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Label htmlFor="symbol-search">Search Symbol</Label>
          <Input
            id="symbol-search"
            value={symbolSearch}
            onChange={(e) => setSymbolSearch(e.target.value)}
            placeholder="e.g. RELIANCE"
          />
        </div>
        {(statusFilter || symbolSearch || selectedDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter('');
              setSymbolSearch('');
              setSelectedDate('');
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Trades table */}
      <Card>
        <CardHeader
          title={selectedDate ? `Trades from ${formatDateLabel(selectedDate)}` : 'All Trades'}
          subtitle={`${filtered.length} of ${trades.length} trades`}
        />
        {loading ? (
          <TableSkeleton rows={8} cols={11} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-12 w-12" />}
            title="No paper trades found"
            description="Run paper_tracker.py in scanner-v3, then click Sync Prices to import and track your picks."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-tertiary">
                  <th className="py-2.5 px-3 font-medium">Symbol</th>
                  <th className="py-2.5 px-3 font-medium">Pattern</th>
                  <th className="py-2.5 px-3 font-medium">Entry Signal</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 text-right font-medium">Entry</th>
                  <th className="py-2.5 px-3 text-right font-medium">Breakout</th>
                  <th className="py-2.5 px-3 text-right font-medium">SL</th>
                  <th className="py-2.5 px-3 text-right font-medium">T1</th>
                  <th className="py-2.5 px-3 text-right font-medium">Current</th>
                  <th className="py-2.5 px-3 text-right font-medium">P&L%</th>
                  <th className="py-2.5 px-3 text-right font-medium">Days</th>
                  <th className="py-2.5 px-3 font-medium">Flagged</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const isClosed = ['WIN_T2', 'LOSS', 'TIME_EXIT'].includes(t.current_status);
                  const signal = getEntrySignal(t);
                  const SignalIcon = signal.icon;
                  const flaggedAgo = t.scan_date ? daysAgo(t.scan_date) : null;
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-border-subtle transition-colors duration-150 hover:bg-bg-hover"
                    >
                      <td className="py-2.5 px-3 font-medium text-text-primary whitespace-nowrap">
                        {t.symbol}
                      </td>
                      <td className="py-2.5 px-3 text-text-secondary">{t.pattern || '—'}</td>
                      <td className="py-2.5 px-3">
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                          signal.color
                        )}>
                          <SignalIcon className="h-3 w-3" />
                          {signal.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant={t.current_status}>{t.current_status}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right text-text-secondary tabular-nums">{fmt(t.entry_price)}</td>
                      <td className="py-2.5 px-3 text-right text-text-secondary tabular-nums">{fmt(t.breakout_level)}</td>
                      <td className="py-2.5 px-3 text-right text-danger tabular-nums">{fmt(t.stop_loss)}</td>
                      <td className="py-2.5 px-3 text-right text-success tabular-nums">{fmt(t.target_1)}</td>
                      <td className="py-2.5 px-3 text-right text-text-primary tabular-nums">{fmt(t.current_price)}</td>
                      <td className={cn('py-2.5 px-3 text-right', pnlColor(t.current_pnl_pct))}>
                        {fmtPct(t.current_pnl_pct)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-text-tertiary tabular-nums">{t.days_held}</td>
                      <td className="py-2.5 px-3 text-xs text-text-tertiary whitespace-nowrap">
                        {flaggedAgo !== null ? (
                          <span>
                            {flaggedAgo === 0 ? 'Today' : flaggedAgo === 1 ? '1d ago' : `${flaggedAgo}d ago`}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
