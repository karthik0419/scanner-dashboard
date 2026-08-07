'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, Scan, ScanParams } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Input';
import { TableSkeleton, EmptyState } from '@/components/ui/States';
import { fmtDate, fmtDuration, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Zap, ChevronRight, AlertCircle, ScanLine, TrendingUp, TrendingDown, FlaskConical, Clock, Globe, XCircle, Calendar, Filter } from 'lucide-react';

// ── Predefined scan presets (matching the .bat menu options) ──
interface Preset {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  params: ScanParams;
  badge?: string;
}

const PRESETS: Preset[] = [
  {
    id: 'smart-daily',
    name: 'Smart Daily',
    description: 'Adapts to hot sectors · 100-400 Rs · Top 30',
    icon: Zap,
    badge: 'POPULAR',
    params: { top: 30, min_score: 50, sl_mode: 'atr', min_price: 100, max_price: 400, bearish: false, timeframe: 'all', smart: true, test_mode: false },
  },
  {
    id: 'full-price',
    name: 'Full + Price Filter',
    description: 'All NSE stocks · 100-400 Rs · Top 30',
    icon: Filter,
    params: { top: 30, min_score: 50, sl_mode: 'atr', min_price: 100, max_price: 400, bearish: false, timeframe: 'all', smart: false, test_mode: false },
  },
  {
    id: 'full-scan',
    name: 'Full NSE',
    description: 'All NSE stocks · no price filter · Top 30',
    icon: Globe,
    params: { top: 30, min_score: 50, sl_mode: 'atr', bearish: false, timeframe: 'all', smart: false, test_mode: false },
  },
  {
    id: 'daily-only',
    name: 'Daily Patterns',
    description: 'Day-level patterns only · Double Bottom, Wedge, etc.',
    icon: Calendar,
    params: { top: 30, min_score: 50, sl_mode: 'atr', bearish: false, timeframe: 'daily', smart: true, test_mode: false },
  },
  {
    id: 'weekly-only',
    name: 'Weekly Patterns',
    description: 'Week-level patterns · C&H Weekly, etc.',
    icon: Clock,
    params: { top: 30, min_score: 50, sl_mode: 'atr', bearish: false, timeframe: 'weekly', smart: true, test_mode: false },
  },
  {
    id: 'bearish',
    name: 'Bearish',
    description: 'Short setups in weak sectors · Top 30',
    icon: TrendingDown,
    params: { top: 30, min_score: 40, sl_mode: 'atr', bearish: true, timeframe: 'all', smart: false, test_mode: false },
  },
  {
    id: 'test',
    name: 'Quick Test',
    description: '50 stocks only · fast validation',
    icon: FlaskConical,
    params: { top: 10, min_score: 30, sl_mode: 'atr', bearish: false, timeframe: 'all', smart: false, test_mode: true },
  },
];

export default function ScansPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggeringPreset, setTriggeringPreset] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [top, setTop] = useState(30);
  const [minScore, setMinScore] = useState(50);
  const [slMode, setSlMode] = useState('atr');
  const [timeframe, setTimeframe] = useState('all');
  const [bearish, setBearish] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [smart, setSmart] = useState(true);
  const [minPrice, setMinPrice] = useState<number | ''>('');
  const [maxPrice, setMaxPrice] = useState<number | ''>('');
  const [stocksFile, setStocksFile] = useState('');

  const fetchScans = useCallback(() => {
    api.listScans(50).then(setScans).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchScans(); }, [fetchScans]);

  // Auto-refresh when there are running/queued scans
  const hasActive = scans.some(s => s.status === 'queued' || s.status === 'running');
  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(fetchScans, 3000);
    return () => clearInterval(interval);
  }, [hasActive, fetchScans]);

  // One-click preset trigger
  const handlePresetTrigger = async (preset: Preset) => {
    setTriggeringPreset(preset.id);
    try {
      await api.triggerScan(preset.params);
      toast.success(`${preset.name} scan queued! Check back in 5-15 min.`);
      fetchScans();
    } catch (err: any) {
      toast.error(err.message || 'Failed to trigger scan');
    } finally {
      setTriggeringPreset(null);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const params: ScanParams = {
        top, min_score: minScore, sl_mode: slMode, timeframe,
        bearish, smart, test_mode: testMode,
        ...(minPrice !== '' && { min_price: minPrice }),
        ...(maxPrice !== '' && { max_price: maxPrice }),
        ...(stocksFile && { stocks_file: stocksFile }),
      };
      await api.triggerScan(params);
      toast.success('Scan queued! It will take 5-15 minutes.');
      setShowForm(false);
      fetchScans();
    } catch (err: any) {
      toast.error(err.message || 'Failed to trigger scan');
    } finally {
      setTriggering(false);
    }
  };

  const resetForm = () => {
    setTop(30); setMinScore(50); setSlMode('atr'); setTimeframe('all');
    setBearish(false); setTestMode(false); setSmart(true);
    setMinPrice(''); setMaxPrice(''); setStocksFile('');
  };

  // Load a preset into the custom form
  const loadPresetIntoForm = (preset: Preset) => {
    const p = preset.params;
    setTop(p.top); setMinScore(p.min_score); setSlMode(p.sl_mode); setTimeframe(p.timeframe);
    setBearish(p.bearish); setTestMode(p.test_mode); setSmart(p.smart);
    setMinPrice(p.min_price ?? ''); setMaxPrice(p.max_price ?? ''); setStocksFile(p.stocks_file ?? '');
    setShowForm(true);
  };

  // Cancel/kill a running or queued scan
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const handleCancelScan = async (e: React.MouseEvent, scanId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCancellingId(scanId);
    try {
      await api.cancelScan(scanId);
      toast.success('Scan cancelled and process killed.');
      fetchScans();
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel scan');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Scans</h1>
          <p className="text-sm text-text-tertiary mt-1">Run new scans and browse historical results</p>
        </div>
        <Button variant="outline" onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }} aria-label={showForm ? 'Cancel new scan' : 'Custom scan'}>
          <ScanLine className="h-4 w-4" /> {showForm ? 'Cancel' : 'Custom Scan'}
        </Button>
      </div>

      {/* ── Preset buttons (one-click) ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">Quick Scans</h2>
          <span className="text-xs text-text-tertiary">— one-click presets</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PRESETS.map(preset => (
            <div
              key={preset.id}
              className="group relative rounded-xl border border-border bg-white p-4 shadow-card transition-all hover:shadow-elevated hover:border-border-strong"
            >
              {preset.badge && (
                <span className="absolute -top-2 right-3 rounded-full bg-accent px-2 py-0.5 text-2xs font-bold text-white">{preset.badge}</span>
              )}
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted">
                  <preset.icon className="h-4 w-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-text-primary">{preset.name}</h3>
                  <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">{preset.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={() => handlePresetTrigger(preset)}
                  loading={triggeringPreset === preset.id}
                  className="flex-1"
                  aria-label={`Run ${preset.name} scan`}
                >
                  {!triggeringPreset && <Zap className="h-3 w-3" />} Run
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadPresetIntoForm(preset)}
                  aria-label={`Edit ${preset.name} preset`}
                >
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trigger form (custom) */}
      {showForm && (
        <Card className="animate-slide-up">
          <CardHeader
            title="Custom Scan Parameters"
            subtitle="Configure and run a custom pattern scan"
          />
          <div className="px-5 pb-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="top">Top N results</Label>
                <Input id="top" type="number" value={top} onChange={e => setTop(+e.target.value)} min={1} max={200} />
              </div>
              <div>
                <Label htmlFor="minScore">Min score</Label>
                <Input id="minScore" type="number" value={minScore} onChange={e => setMinScore(+e.target.value)} min={0} max={100} />
              </div>
              <div>
                <Label htmlFor="slMode">Stop loss mode</Label>
                <Select id="slMode" value={slMode} onChange={e => setSlMode(e.target.value)}>
                  <option value="atr">ATR (2.0x, default)</option>
                  <option value="original">Original (v2 wider)</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="timeframe">Timeframe</Label>
                <Select id="timeframe" value={timeframe} onChange={e => setTimeframe(e.target.value)}>
                  <option value="all">All timeframes</option>
                  <option value="daily">Daily only</option>
                  <option value="weekly">Weekly only</option>
                  <option value="monthly">Monthly only</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="minPrice">Min price (Rs)</Label>
                <Input id="minPrice" type="number" value={minPrice} onChange={e => setMinPrice(e.target.value === '' ? '' : +e.target.value)} placeholder="No limit" min={0} />
              </div>
              <div>
                <Label htmlFor="maxPrice">Max price (Rs)</Label>
                <Input id="maxPrice" type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value === '' ? '' : +e.target.value)} placeholder="No limit" min={0} />
              </div>
              <div>
                <Label htmlFor="stocksFile">Stock list (optional)</Label>
                <Select id="stocksFile" value={stocksFile} onChange={e => setStocksFile(e.target.value)}>
                  <option value="">Full NSE universe</option>
                  <option value="backbone50.txt">Backbone 50 (curated momentum)</option>
                  <option value="nifty500.txt">Nifty 500 (mid + large cap)</option>
                </Select>
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-6 pt-1">
              <ToggleRow id="smart" label="Smart universe" hint="Backbone + Nifty500 + hot sectors" checked={smart} onChange={setSmart} />
              <ToggleRow id="bearish" label="Bearish mode" hint="Find short setups in weak sectors" checked={bearish} onChange={setBearish} />
              <ToggleRow id="testMode" label="Test mode" hint="50 stocks only (fast)" checked={testMode} onChange={setTestMode} />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button onClick={handleTrigger} loading={triggering} aria-label="Run custom scan">
                {!triggering && <Zap className="h-4 w-4" />} Run Scan
              </Button>
              <Button variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            </div>
            <p className="text-xs text-text-tertiary">Scans run asynchronously (5-15 min). Results appear in the list below automatically.</p>
          </div>
        </Card>
      )}

      {/* Scans list */}
      <Card>
        <CardHeader title="Recent Scans" subtitle={`${scans.length} scan${scans.length !== 1 ? 's' : ''}`} />
        {loading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : scans.length === 0 ? (
          <EmptyState
            icon={<ScanLine className="h-12 w-12" />}
            title="No scans yet"
            description="Trigger your first scan to discover breakout setups across NSE stocks."
            action={<Button onClick={() => setShowForm(true)}><Zap className="h-4 w-4" /> New Scan</Button>}
          />
        ) : (
          <div className="divide-y divide-border-subtle animate-fade-in">
            {scans.map(scan => (
              <Link
                key={scan.id}
                href={`/dashboard/scans/${scan.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-bg-hover transition-colors duration-150 group focus:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-inset"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <Badge variant={scan.status}>{scan.status}</Badge>
                  <div className="min-w-0">
                    <p className="text-sm text-text-secondary truncate">
                      <span className="text-text-primary font-medium">Top {scan.top}</span>
                      {' · '}Score ≥ {scan.min_score}
                      {' · '}{scan.sl_mode.toUpperCase()}
                      {' · '}{scan.timeframe}
                      {scan.bearish && <span className="text-warning ml-1">· BEARISH</span>}
                      {scan.test_mode && <span className="text-info ml-1">· TEST</span>}
                    </p>
                    <p className="text-xs text-text-tertiary mt-0.5 tabular-nums">
                      {fmtDate(scan.created_at)} · {fmtDuration(scan.duration_seconds)}
                    </p>
                    {scan.error_message && (
                      <p className="text-xs text-danger mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" /> {scan.error_message.slice(0, 120)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-bold text-text-primary tabular-nums">{scan.total_picks}</p>
                    <p className="text-xs text-text-tertiary">picks</p>
                  </div>
                  {(scan.status === 'queued' || scan.status === 'running') && (
                    <button
                      onClick={(e) => handleCancelScan(e, scan.id)}
                      disabled={cancellingId === scan.id}
                      className="flex items-center gap-1 rounded-lg border border-danger/30 bg-danger-subtle px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger hover:text-white transition-colors duration-150 disabled:opacity-50"
                      aria-label={`Kill scan ${scan.id}`}
                      title="Kill this scan"
                    >
                      {cancellingId === scan.id ? (
                        <span className="flex items-center gap-1"><span className="h-3 w-3 animate-spin rounded-full border border-danger border-t-transparent" /> Killing...</span>
                      ) : (
                        <><XCircle className="h-3.5 w-3.5" /> Kill</>
                      )}
                    </button>
                  )}
                  <ChevronRight className="h-5 w-5 text-text-tertiary group-hover:text-text-primary transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ToggleRow({ id, label, hint, checked, onChange }: {
  id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 mt-0.5',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-white',
          checked ? 'bg-accent' : 'bg-gray-200 border border-border'
        )}
      >
        <span className={cn(
          'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked && 'translate-x-5'
        )} />
      </button>
      <div>
        <label htmlFor={id} className="text-sm text-text-secondary cursor-pointer select-none">{label}</label>
        {hint && <p className="text-xs text-text-tertiary mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}
