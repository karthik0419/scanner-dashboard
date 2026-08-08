'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Scan, MarketRegime, SectorHeat, TrackerSummary } from '@/lib/api';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingState, EmptyState } from '@/components/ui/States';
import { fmt, fmtPct, fmtDate, fmtDuration, cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Zap, ArrowRight, Activity, ScanLine, Target } from 'lucide-react';
import { InstructionsBanner } from '@/components/ui/Instructions';

export default function DashboardOverview() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [regime, setRegime] = useState<MarketRegime | null>(null);
  const [sectors, setSectors] = useState<SectorHeat[]>([]);
  const [tracker, setTracker] = useState<TrackerSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.listScans(5),
      api.marketRegime(),
      api.sectorHeat(),
      api.trackerSummary(),
    ]).then(([s, r, sec, t]) => {
      if (s.status === 'fulfilled') setScans(s.value);
      if (r.status === 'fulfilled') setRegime(r.value);
      if (sec.status === 'fulfilled') setSectors(sec.value.slice(0, 8));
      if (t.status === 'fulfilled') setTracker(t.value);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState text="Loading dashboard..." />;

  const latestScan = scans[0];
  const topSectors = sectors.slice(0, 5);

  return (
    <div className="space-y-6">
      <InstructionsBanner
        storageKey="overview"
        title="Welcome to Scanner Dashboard"
        steps={[
          { title: 'Run a scan', description: 'Go to Scans tab, pick a preset (e.g. Smart Daily), and click it. Scans take 5-15 min.' },
          { title: 'View picks', description: 'Click a completed scan to see all stock setups with patterns, targets, and R:R.' },
          { title: 'Track paper trades', description: 'Go to Paper Tracker to see how past picks are performing with live prices.' },
          { title: 'Check market', description: 'Market tab shows sector rotation and whether Nifty is above/below 200 DMA.' },
          { title: 'PEAD scanner', description: 'Separate scanner for post-earnings momentum setups. Takes 10-30 min (screener.in).' },
        ]}
      />
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Overview</h1>
          <p className="text-sm text-text-tertiary mt-1">NSE swing setup scanner dashboard</p>
        </div>
        <Link href="/dashboard/scans">
          <Button size="md">
            <Zap className="h-4 w-4" /> New Scan
          </Button>
        </Link>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Market Regime"
          value={regime ? regime.status.replace('_', ' ') : '—'}
          sublabel={regime ? `Nifty ${fmt(regime.close, 0)}` : 'Unavailable'}
          trend={regime?.status === 'RISK_ON' ? 'up' : 'down'}
          icon={regime?.status === 'RISK_ON' ? <TrendingUp className="h-8 w-8" /> : <TrendingDown className="h-8 w-8" />}
        />
        <StatCard
          label="Total Scans"
          value={scans.length}
          sublabel={latestScan ? `Latest: ${fmtDate(latestScan.created_at)}` : 'No scans yet'}
          icon={<ScanLine className="h-8 w-8" />}
        />
        <StatCard
          label="Latest Picks"
          value={latestScan?.total_picks ?? 0}
          sublabel={latestScan ? <Link href={`/dashboard/scans/${latestScan.id}`} className="text-accent hover:underline">View picks →</Link> : undefined}
          icon={<Target className="h-8 w-8" />}
        />
        <StatCard
          label="Paper Trades"
          value={tracker?.total ?? 0}
          sublabel={tracker && tracker.total > 0 ? `${tracker.wins}W / ${tracker.losses}L · ${tracker.win_rate}% win` : 'No trades yet'}
          trend={tracker && tracker.wins > tracker.losses ? 'up' : 'neutral'}
          icon={<Activity className="h-8 w-8" />}
        />
      </div>

      {/* ── Recent scans + hot sectors ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent scans */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent Scans"
            subtitle="Your latest scan runs"
            action={<Link href="/dashboard/scans"><Button variant="ghost" size="sm">View all <ArrowRight className="h-3 w-3" /></Button></Link>}
          />
          {scans.length === 0 ? (
            <EmptyState
              icon={<ScanLine className="h-12 w-12" />}
              title="No scans yet"
              description="Run your first scan to see picks here."
              action={<Link href="/dashboard/scans"><Button size="sm"><Zap className="h-4 w-4" /> Run Scan</Button></Link>}
            />
          ) : (
            <div className="space-y-1 px-3 pb-3">
              {scans.map(scan => (
                <Link
                  key={scan.id}
                  href={`/dashboard/scans/${scan.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-3 hover:bg-bg-hover transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={scan.status}>{scan.status}</Badge>
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate">
                        Top {scan.top} · Score ≥ {scan.min_score} · {scan.sl_mode.toUpperCase()}
                        {scan.bearish && <span className="text-danger ml-1">· BEARISH</span>}
                        {scan.test_mode && <span className="text-warning ml-1">· TEST</span>}
                      </p>
                      <p className="text-xs text-text-tertiary mt-0.5">{fmtDate(scan.created_at)} · {fmtDuration(scan.duration_seconds)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold text-text-primary tabular-nums">{scan.total_picks}</span>
                    <span className="text-xs text-text-tertiary">picks</span>
                    <ArrowRight className="h-4 w-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Sector heat */}
        <Card>
          <CardHeader title="Sector Heat" subtitle="Top performing sectors" />
          {topSectors.length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="h-12 w-12" />}
              title="Sector data unavailable"
              description="Market data will appear here when available."
            />
          ) : (
            <div className="space-y-1 px-3 pb-3">
              {topSectors.map(s => (
                <div key={s.sector} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-bg-hover transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={s.signal}>{s.signal}</Badge>
                    <span className="text-sm text-text-primary truncate">{s.sector}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={cn('text-sm font-semibold tabular-nums', (s.perf_5d ?? 0) >= 0 ? 'text-success' : 'text-danger')}>
                      {fmtPct(s.perf_5d)}
                    </p>
                    <p className="text-2xs text-text-tertiary">5d</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
