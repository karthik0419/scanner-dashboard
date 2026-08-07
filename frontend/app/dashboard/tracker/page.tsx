'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, PaperTrade, TrackerSummary } from '@/lib/api';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select, Label, Input } from '@/components/ui/Input';
import { TableSkeleton, EmptyState } from '@/components/ui/States';
import { fmt, fmtPct, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { RefreshCw, Activity, TrendingUp, TrendingDown, Target, Wallet } from 'lucide-react';

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

export default function TrackerPage() {
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [summary, setSummary] = useState<TrackerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [symbolSearch, setSymbolSearch] = useState('');

  const fetchData = useCallback(() => {
    Promise.allSettled([api.listTrades(), api.trackerSummary()]).then(([t, s]) => {
      if (t.status === 'fulfilled') setTrades(t.value);
      else toast.error('Failed to load trades');
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
      return true;
    });
  }, [trades, statusFilter, symbolSearch]);

  const pnlColor = (val: number | null | undefined) =>
    cn('tabular-nums font-medium', (val ?? 0) >= 0 ? 'text-success' : 'text-danger');

  return (
    <div className="space-y-6 animate-fade-in">
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
        {(statusFilter || symbolSearch) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter('');
              setSymbolSearch('');
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Trades table */}
      <Card>
        <CardHeader
          title="Trades"
          subtitle={`${filtered.length} of ${trades.length} trades`}
        />
        {loading ? (
          <TableSkeleton rows={8} cols={10} />
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
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 text-right font-medium">Entry</th>
                  <th className="py-2.5 px-3 text-right font-medium">SL</th>
                  <th className="py-2.5 px-3 text-right font-medium">T1</th>
                  <th className="py-2.5 px-3 text-right font-medium">T2</th>
                  <th className="py-2.5 px-3 text-right font-medium">Current</th>
                  <th className="py-2.5 px-3 text-right font-medium">P&L%</th>
                  <th className="py-2.5 px-3 text-right font-medium">Days</th>
                  <th className="py-2.5 px-3 font-medium">Exit Info</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const isClosed = ['WIN_T2', 'LOSS', 'TIME_EXIT'].includes(t.current_status);
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
                        <Badge variant={t.current_status}>{t.current_status}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right text-text-secondary tabular-nums">{fmt(t.entry_price)}</td>
                      <td className="py-2.5 px-3 text-right text-danger tabular-nums">{fmt(t.stop_loss)}</td>
                      <td className="py-2.5 px-3 text-right text-success tabular-nums">{fmt(t.target_1)}</td>
                      <td className="py-2.5 px-3 text-right text-success tabular-nums">{fmt(t.target_2)}</td>
                      <td className="py-2.5 px-3 text-right text-text-primary tabular-nums">{fmt(t.current_price)}</td>
                      <td className={cn('py-2.5 px-3 text-right', pnlColor(t.current_pnl_pct))}>
                        {fmtPct(t.current_pnl_pct)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-text-tertiary tabular-nums">{t.days_held}</td>
                      <td className="py-2.5 px-3 text-xs text-text-tertiary">
                        {isClosed ? (
                          <span>
                            {t.exit_reason || '—'}
                            {t.exit_price && <span className="block text-text-secondary tabular-nums">@ {fmt(t.exit_price)}</span>}
                          </span>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
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
