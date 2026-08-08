'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, PeadScan, PeadPick, PeadScanParams } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Input';
import { TableSkeleton, EmptyState } from '@/components/ui/States';
import { fmtDate, fmtDuration, cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Zap, ChevronRight, AlertCircle, XCircle, TrendingUp,
  Calendar, Globe, FlaskConical, Target, Award, BarChart3,
} from 'lucide-react';
import { InstructionsBanner } from '@/components/ui/Instructions';

// ── PEAD scan presets ──
interface PeadPreset {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  params: PeadScanParams;
  badge?: string;
}

const PEAD_PRESETS: PeadPreset[] = [
  {
    id: 'weekly',
    name: 'Weekly PEAD',
    description: 'Top 30 post-earnings setups · min score 35',
    icon: Calendar,
    badge: 'DEFAULT',
    params: { mode: 'weekly', top: 30, min_score: 35 },
  },
  {
    id: 'daily',
    name: 'Daily PEAD',
    description: 'Top 20 · min score 40 · faster scan',
    icon: Zap,
    params: { mode: 'daily', top: 20, min_score: 40 },
  },
  {
    id: 'discovery',
    name: 'Discovery',
    description: 'Top 50 · min score 40 · broadest search',
    icon: Globe,
    badge: 'BROAD',
    params: { mode: 'discovery', top: 50, min_score: 40 },
  },
  {
    id: 'high-conviction',
    name: 'High Conviction',
    description: 'Top 20 · min score 60 · only best setups',
    icon: Award,
    params: { mode: 'weekly', top: 20, min_score: 60 },
  },
];

export default function PeadPage() {
  const [scans, setScans] = useState<PeadScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggeringPreset, setTriggeringPreset] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedScan, setSelectedScan] = useState<PeadScan | null>(null);
  const [picks, setPicks] = useState<PeadPick[]>([]);
  const [picksLoading, setPicksLoading] = useState(false);

  // Form state
  const [mode, setMode] = useState('weekly');
  const [top, setTop] = useState(30);
  const [minScore, setMinScore] = useState(35);
  const [sector, setSector] = useState('');

  const fetchScans = useCallback(() => {
    api.listPeadScans(50).then(setScans).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchScans(); }, [fetchScans]);

  // Auto-refresh when there are running/queued scans
  const hasActive = scans.some(s => s.status === 'queued' || s.status === 'running');
  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(fetchScans, 3000);
    return () => clearInterval(interval);
  }, [hasActive, fetchScans]);

  // Auto-refresh selected scan if it's running
  useEffect(() => {
    if (!selectedScan) return;
    if (selectedScan.status === 'queued' || selectedScan.status === 'running') {
      const interval = setInterval(async () => {
        try {
          const updated = await api.getPeadScan(selectedScan.id);
          setSelectedScan(updated);
          if (updated.status === 'completed') {
            fetchPicks(updated.id);
          }
        } catch {}
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedScan]);

  const fetchPicks = async (scanId: string) => {
    setPicksLoading(true);
    try {
      const resp = await api.listPeadPicks(scanId, { limit: 200 });
      setPicks(resp.items);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPicksLoading(false);
    }
  };

  const handlePresetTrigger = async (preset: PeadPreset) => {
    setTriggeringPreset(preset.id);
    try {
      await api.triggerPeadScan(preset.params);
      toast.success(`${preset.name} PEAD scan queued! Check back in 10-30 min.`);
      fetchScans();
    } catch (err: any) {
      toast.error(err.message || 'Failed to trigger PEAD scan');
    } finally {
      setTriggeringPreset(null);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const params: PeadScanParams = {
        mode, top, min_score: minScore,
        ...(sector && { sector }),
      };
      await api.triggerPeadScan(params);
      toast.success('PEAD scan queued! It will take 10-30 minutes (screener.in is slow).');
      setShowForm(false);
      fetchScans();
    } catch (err: any) {
      toast.error(err.message || 'Failed to trigger PEAD scan');
    } finally {
      setTriggering(false);
    }
  };

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const handleCancelScan = async (e: React.MouseEvent, scanId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCancellingId(scanId);
    try {
      await api.cancelPeadScan(scanId);
      toast.success('PEAD scan cancelled.');
      fetchScans();
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel scan');
    } finally {
      setCancellingId(null);
    }
  };

  const handleScanClick = (scan: PeadScan) => {
    setSelectedScan(scan);
    if (scan.status === 'completed') {
      fetchPicks(scan.id);
    } else {
      setPicks([]);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Zap className="h-6 w-6 text-accent" />
            PEAD Scanner
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Post-Earnings Announcement Drift — find stocks with strong earnings reactions
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} variant="secondary">
          {showForm ? 'Close' : 'Custom Scan'}
        </Button>
      </div>

      {/* Instructions */}
      <InstructionsBanner
        storageKey="pead"
        title="How the PEAD scanner works"
        icon={Zap}
        variant="amber"
        steps={[
          { title: 'What is PEAD?', description: 'Post-Earnings Announcement Drift — stocks that gap up strongly on quarterly results tend to continue higher after a brief pullback.' },
          { title: 'Pick a preset', description: 'Weekly = top 30 post-earnings setups. Discovery = broadest search (top 50). High Conviction = only score >= 60.' },
          { title: 'Be patient', description: 'PEAD scans take 10-30 min because they fetch earnings data from screener.in (rate-limited at ~2s/stock).' },
          { title: 'Read the picks', description: 'Status ENTER NOW = post-result + R:R >= 2.0. WATCH = pre-result or lower R:R. Score = earnings quality + reaction history + entry quality + sector momentum.' },
          { title: 'Key columns', description: 'Days = days since result (post) or until result (pre). Spike% = avg price reaction on result day. Proj YoY = projected next quarter growth.' },
        ]}
      />

      {/* Presets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {PEAD_PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => handlePresetTrigger(preset)}
            disabled={triggeringPreset !== null}
            className={cn(
              'group relative flex flex-col items-start rounded-xl border border-border bg-white p-4 text-left transition-all',
              'hover:border-accent hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed',
              triggeringPreset === preset.id && 'border-accent ring-2 ring-accent/20'
            )}
          >
            {preset.badge && (
              <span className="absolute right-3 top-3 rounded-full bg-accent-muted px-2 py-0.5 text-[10px] font-bold text-accent">
                {preset.badge}
              </span>
            )}
            <preset.icon className="h-7 w-7 text-accent mb-2" />
            <span className="font-semibold text-text-primary text-sm">{preset.name}</span>
            <span className="text-xs text-text-secondary mt-1">{preset.description}</span>
            {triggeringPreset === preset.id && (
              <span className="text-xs text-accent mt-2 flex items-center gap-1">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                Queuing...
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Custom form */}
      {showForm && (
        <Card>
          <CardHeader title="Custom PEAD Scan" />
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label>Mode</Label>
                <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                  <option value="discovery">Discovery</option>
                </Select>
              </div>
              <div>
                <Label>Top N</Label>
                <Input type="number" value={top} onChange={(e) => setTop(Number(e.target.value))} min={1} max={200} />
              </div>
              <div>
                <Label>Min Score</Label>
                <Input type="number" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} min={0} max={100} />
              </div>
              <div>
                <Label>Sector (optional)</Label>
                <Input type="text" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="e.g. IT, Banking" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleTrigger} disabled={triggering}>
                {triggering ? 'Queuing...' : 'Trigger Scan'}
              </Button>
              <Button variant="ghost" onClick={() => { setMode('weekly'); setTop(30); setMinScore(35); setSector(''); }}>
                Reset
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Scan history + picks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scan list */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold mb-3">Scan History</h2>
          {loading ? (
            <TableSkeleton rows={4} />
          ) : scans.length === 0 ? (
            <EmptyState
              icon={<Zap className="h-12 w-12" />}
              title="No PEAD scans yet"
              description="Trigger your first scan using a preset above."
            />
          ) : (
            <div className="space-y-2">
              {scans.map(scan => (
                <button
                  key={scan.id}
                  onClick={() => handleScanClick(scan)}
                  className={cn(
                    'w-full text-left rounded-lg border p-3 transition-all',
                    selectedScan?.id === scan.id
                      ? 'border-accent bg-accent-muted/50'
                      : 'border-border bg-white hover:border-accent/50'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-text-primary">
                      {scan.mode} · top {scan.top}
                    </span>
                    <ScanStatusBadge status={scan.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-tertiary">
                    <span>{fmtDate(scan.created_at)}</span>
                    {scan.status === 'completed' && (
                      <span className="font-medium text-text-secondary">{scan.total_picks} picks</span>
                    )}
                    {scan.status === 'completed' && scan.duration_seconds && (
                      <span>{fmtDuration(scan.duration_seconds)}</span>
                    )}
                  </div>
                  {(scan.status === 'queued' || scan.status === 'running') && (
                    <button
                      onClick={(e) => handleCancelScan(e, scan.id)}
                      disabled={cancellingId === scan.id}
                      className="mt-2 flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {cancellingId === scan.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}
                  {scan.status === 'failed' && scan.error_message && (
                    <p className="mt-1 text-xs text-red-600 truncate">{scan.error_message}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Picks table */}
        <div className="lg:col-span-2">
          {!selectedScan ? (
            <EmptyState
              icon={<BarChart3 className="h-12 w-12" />}
              title="Select a scan"
              description="Click a scan from the left to view its picks."
            />
          ) : selectedScan.status !== 'completed' ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-16 text-center">
                {selectedScan.status === 'running' && (
                  <span className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-accent border-t-transparent mb-3" />
                )}
                <p className="text-sm text-text-secondary">
                  {selectedScan.status === 'queued' && 'Scan queued, waiting for worker...'}
                  {selectedScan.status === 'running' && 'Scan running. This takes 10-30 min due to screener.in rate limits.'}
                  {selectedScan.status === 'failed' && 'Scan failed. See error in scan list.'}
                  {selectedScan.status === 'cancelled' && 'Scan was cancelled.'}
                </p>
              </div>
            </Card>
          ) : picksLoading ? (
            <TableSkeleton rows={8} />
          ) : picks.length === 0 ? (
            <EmptyState icon={<Target className="h-12 w-12" />} title="No picks" description="This scan produced 0 picks." />
          ) : (
            <PicksTable picks={picks} />
          )}
        </div>
      </div>
    </div>
  );
}

function ScanStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: 'bg-yellow-100 text-yellow-800',
    running: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', styles[status] || 'bg-gray-100 text-gray-600')}>
      {status}
    </span>
  );
}

function PicksTable({ picks }: { picks: PeadPick[] }) {
  const [sortBy, setSortBy] = useState<'score' | 'rr' | 'avg_spike_pct' | 'proj_yoy_growth'>('score');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const filtered = picks
    .filter(p => !statusFilter || p.status === statusFilter)
    .sort((a, b) => {
      const av = (a[sortBy] as number) ?? -1;
      const bv = (b[sortBy] as number) ?? -1;
      return bv - av;
    });

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-text-secondary">{picks.length} picks</span>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="w-auto">
          <option value="score">Sort: Score</option>
          <option value="rr">Sort: R:R</option>
          <option value="avg_spike_pct">Sort: Avg Spike</option>
          <option value="proj_yoy_growth">Sort: Proj YoY</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
          <option value="">All statuses</option>
          <option value="ENTER NOW">ENTER NOW</option>
          <option value="WATCH">WATCH</option>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-bg-hover text-text-secondary">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Symbol</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">CMP</th>
              <th className="px-3 py-2 text-right font-medium">Entry</th>
              <th className="px-3 py-2 text-right font-medium">Stop</th>
              <th className="px-3 py-2 text-right font-medium">Target</th>
              <th className="px-3 py-2 text-right font-medium">R:R</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="px-3 py-2 text-left font-medium">Days</th>
              <th className="px-3 py-2 text-left font-medium">Spike%</th>
              <th className="px-3 py-2 text-left font-medium">Proj YoY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white">
            {filtered.map(pick => (
              <tr key={pick.id} className="hover:bg-bg-hover/50">
                <td className="px-3 py-2 font-medium text-text-primary">
                  {pick.symbol}
                  {pick.sector && (
                    <span className="block text-[10px] text-text-tertiary">{pick.sector}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold',
                    pick.status === 'ENTER NOW' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  )}>
                    {pick.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{pick.cmp?.toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{pick.entry?.toFixed(2) ?? '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600">{pick.stop?.toFixed(2) ?? '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-green-600">{pick.target?.toFixed(2) ?? '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{pick.rr?.toFixed(2) ?? '-'}</td>
                <td className="px-3 py-2 text-right">
                  <span className={cn(
                    'inline-block rounded px-1.5 py-0.5 text-xs font-bold tabular-nums',
                    (pick.score ?? 0) >= 60 ? 'bg-green-100 text-green-700' :
                    (pick.score ?? 0) >= 40 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  )}>
                    {pick.score?.toFixed(0) ?? '-'}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-text-secondary">
                  {pick.days_since_result !== null ? `${pick.days_since_result}d` : 
                   pick.days_to_result !== null ? `in ${pick.days_to_result}d` : '-'}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-text-secondary">
                  {pick.avg_spike_pct !== null ? `${pick.avg_spike_pct.toFixed(1)}%` : '-'}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-text-secondary">
                  {pick.proj_yoy_growth !== null ? `${pick.proj_yoy_growth.toFixed(1)}%` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
