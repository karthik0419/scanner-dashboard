/** API client — wraps fetch with JWT auth, auto-attaches token. */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function setToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem('token', token);
}

export function clearToken() {
  if (typeof window !== 'undefined') localStorage.removeItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────
export const api = {
  register(email: string, name: string, password: string) {
    return request<{ access_token: string; user: User }>('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ email, name, password }),
    });
  },
  login(email: string, password: string) {
    return request<{ access_token: string; user: User }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
  },
  me() {
    return request<User>('/api/auth/me');
  },

  // ── Scans ───────────────────────────────────────────────────────────
  triggerScan(params: ScanParams) {
    return request<Scan>('/api/scans/trigger', {
      method: 'POST', body: JSON.stringify(params),
    });
  },
  listScans(limit = 20, offset = 0) {
    return request<Scan[]>(`/api/scans?limit=${limit}&offset=${offset}`);
  },
  getScan(id: string) {
    return request<Scan>(`/api/scans/${id}`);
  },
  cancelScan(id: string) {
    return request<Scan>(`/api/scans/${id}/cancel`, { method: 'POST' });
  },
  listPicks(scanId: string, filters: Record<string, string | number | boolean>) {
    const qs = new URLSearchParams(filters as any).toString();
    return request<PicksResponse>(`/api/picks/scan/${scanId}?${qs}`);
  },
  scanStats(scanId: string) {
    return request<ScanStats>(`/api/picks/scan/${scanId}/stats`);
  },

  // ── Charts ──────────────────────────────────────────────────────────
  chartUrl(symbol: string, timeframe: string) {
    const base = API_BASE || '';
    return `${base}/api/charts/${symbol}?timeframe=${timeframe}`;
  },

  // ── Saved Screens ───────────────────────────────────────────────────
  listScreens() {
    return request<SavedScreen[]>('/api/screens');
  },
  createScreen(name: string, filters: Record<string, any>, description?: string) {
    return request<SavedScreen>('/api/screens', {
      method: 'POST', body: JSON.stringify({ name, description, filters }),
    });
  },
  deleteScreen(id: string) {
    return request(`/api/screens/${id}`, { method: 'DELETE' });
  },

  // ── Alerts ──────────────────────────────────────────────────────────
  listAlerts() {
    return request<Alert[]>('/api/alerts');
  },
  createAlert(symbol: string, alert_type: string, condition_value?: number) {
    return request<Alert>('/api/alerts', {
      method: 'POST', body: JSON.stringify({ symbol, alert_type, condition_value }),
    });
  },
  deleteAlert(id: string) {
    return request(`/api/alerts/${id}`, { method: 'DELETE' });
  },
  toggleAlert(id: string) {
    return request<Alert>(`/api/alerts/${id}/toggle`, { method: 'PUT' });
  },

  // ── Paper Tracker ───────────────────────────────────────────────────
  listTrades(status?: string, scanDate?: string) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (scanDate) params.set('scan_date', scanDate);
    const qs = params.toString();
    return request<PaperTrade[]>(`/api/tracker${qs ? '?' + qs : ''}`);
  },
  trackerDates() {
    return request<ScanDateInfo[]>('/api/tracker/dates');
  },
  trackerSummary() {
    return request<TrackerSummary>('/api/tracker/summary');
  },
  syncTracker() {
    return request<{ synced: number }>('/api/tracker/sync', { method: 'POST' });
  },

  // ── Market ──────────────────────────────────────────────────────────
  sectorHeat() {
    return request<SectorHeat[]>('/api/market/sectors');
  },
  marketRegime() {
    return request<MarketRegime>('/api/market/regime');
  },
  hotSectors(topN = 5) {
    return request<{ sector: string; perf_5d: number; perf_20d: number }[]>(`/api/market/hot-sectors?top_n=${topN}`);
  },

  // ── PEAD Scanner ────────────────────────────────────────────────────
  triggerPeadScan(params: PeadScanParams) {
    return request<PeadScan>('/api/pead/trigger', {
      method: 'POST', body: JSON.stringify(params),
    });
  },
  listPeadScans(limit = 20, offset = 0) {
    return request<PeadScan[]>(`/api/pead?limit=${limit}&offset=${offset}`);
  },
  getPeadScan(id: string) {
    return request<PeadScan>(`/api/pead/${id}`);
  },
  cancelPeadScan(id: string) {
    return request<PeadScan>(`/api/pead/${id}/cancel`, { method: 'POST' });
  },
  listPeadPicks(scanId: string, filters: Record<string, string | number | boolean>) {
    const qs = new URLSearchParams(filters as any).toString();
    return request<PeadPicksResponse>(`/api/pead/${scanId}/picks?${qs}`);
  },
};

// ── Types ─────────────────────────────────────────────────────────────
export interface User {
  id: string; email: string; name: string; plan: string;
  telegram_chat_id: string | null; created_at: string;
}

export interface ScanParams {
  top: number; min_score: number; sl_mode: string;
  min_price?: number; max_price?: number; stocks_file?: string;
  bearish: boolean; timeframe: string; smart: boolean; test_mode: boolean;
}

export interface Scan {
  id: string; status: string; top: number; min_score: number; sl_mode: string;
  min_price: number | null; max_price: number | null; bearish: boolean;
  timeframe: string; total_picks: number; error_message: string | null;
  created_at: string; started_at: string | null; completed_at: string | null;
  duration_seconds: number | null; test_mode: boolean; smart: boolean;
}

export interface Pick {
  id: string; symbol: string; pattern: string; timeframe: string; status: string;
  cmp: number; breakout: number | null; stop_loss: number | null;
  target_1: number | null; target_2: number | null;
  upside_pct: number | null; risk_pct: number | null; rr: number | null;
  volume: number | null; sector: string | null; sector_signal: string | null;
  score: number | null; atr: number | null;
}

export interface PicksResponse {
  total: number; limit: number; offset: number;
  scan_status: string; items: Pick[];
}

export interface ScanStats {
  total_picks: number;
  by_pattern: Record<string, number>;
  by_timeframe: Record<string, number>;
  by_status: Record<string, number>;
  by_sector: Record<string, number>;
  avg_score: number; avg_rr: number;
}

export interface SavedScreen {
  id: string; name: string; description: string | null;
  filters: Record<string, any>; created_at: string; updated_at: string;
}

export interface Alert {
  id: string; symbol: string; alert_type: string; condition_value: number | null;
  channel: string; is_active: boolean; triggered: boolean;
  triggered_at: string | null; created_at: string;
}

export interface PaperTrade {
  id: string; symbol: string; pattern: string | null; status_at_scan: string | null;
  breakout_level: number | null; entry_price: number | null; stop_loss: number | null;
  target_1: number | null; target_2: number | null; scan_date: string | null;
  cmp_at_scan: number | null; risk_pct: number | null; upside_pct: number | null;
  rr: number | null; score: number | null; sector: string | null;
  current_price: number | null; current_status: string; current_pnl_pct: number | null;
  days_held: number; exit_price: number | null; exit_reason: string | null;
  tradeable: string;
}

export interface TrackerSummary {
  total: number; by_status: Record<string, number>;
  wins: number; losses: number; open: number;
  win_rate: number; avg_pnl: number; message?: string;
}

export interface ScanDateInfo {
  date: string; total: number; open: number; wins: number; losses: number;
  enter_now: number; waiting: number; avg_pnl: number;
}

export interface SectorHeat {
  sector: string; perf_5d: number | null; perf_20d: number | null;
  signal: string; score_bonus: number;
}

export interface MarketRegime {
  status: string; close: number | null; dma200: number | null; pct_from_dma: number | null;
}

// ── PEAD Scanner Types ────────────────────────────────────────────────
export interface PeadScanParams {
  mode: string; top: number; min_score: number; sector?: string;
}

export interface PeadScan {
  id: string; status: string; mode: string; top: number; min_score: number;
  sector: string | null; total_picks: number; error_message: string | null;
  created_at: string; started_at: string | null; completed_at: string | null;
  duration_seconds: number | null;
}

export interface PeadPick {
  id: string; symbol: string; sector: string | null; status: string;
  mode: string | null; days_since_result: number | null; days_to_result: number | null;
  last_quarter: string | null; result_date: string | null;
  cmp: number; entry: number | null; stop: number | null; target: number | null;
  rr: number | null; last_net_profit: number | null; last_eps: number | null;
  proj_profit: number | null; proj_eps: number | null; proj_yoy_growth: number | null;
  proj_confidence: string | null; avg_spike_pct: number | null;
  consistency_score: number | null; avg_yoy_growth: number | null;
  growth_quarters: number | null; sector_rank: number | null; score: number | null;
}

export interface PeadPicksResponse {
  total: number; limit: number; offset: number;
  scan_status: string; items: PeadPick[];
}
