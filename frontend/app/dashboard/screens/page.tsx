'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, SavedScreen } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Label, Select } from '@/components/ui/Input';
import { EmptyState, Skeleton } from '@/components/ui/States';
import { fmtDate } from '@/lib/utils';
import { toast } from 'sonner';
import { Trash2, Filter, Plus, X, Check } from 'lucide-react';
import { InstructionsBanner } from '@/components/ui/Instructions';

const TIMEFRAMES = ['all', 'daily', 'weekly', 'monthly'];
const STATUSES = ['all', 'BREAKOUT', 'NEAR', 'WATCH'];
const SORT_OPTIONS = ['score', 'rr', 'upside_pct', 'volume', 'cmp'];

interface FilterForm {
  pattern: string;
  timeframe: string;
  status: string;
  sector: string;
  min_score: string;
  min_rr: string;
  sort_by: string;
  sort_desc: boolean;
  limit: string;
  offset: string;
}

const emptyForm: FilterForm = {
  pattern: '',
  timeframe: 'all',
  status: 'all',
  sector: '',
  min_score: '',
  min_rr: '',
  sort_by: 'score',
  sort_desc: true,
  limit: '50',
  offset: '0',
};

export default function ScreensPage() {
  const [screens, setScreens] = useState<SavedScreen[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [filters, setFilters] = useState<FilterForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchScreens = useCallback(() => {
    api.listScreens()
      .then(setScreens)
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchScreens();
  }, [fetchScreens]);

  const resetForm = () => {
    setForm({ name: '', description: '' });
    setFilters(emptyForm);
    setShowForm(false);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('Screen name is required');
      return;
    }

    // Build filters object — only include non-empty / non-default values
    const filterObj: Record<string, any> = {};
    if (filters.pattern.trim()) filterObj.pattern = filters.pattern.trim();
    if (filters.timeframe && filters.timeframe !== 'all') filterObj.timeframe = filters.timeframe;
    if (filters.status && filters.status !== 'all') filterObj.status = filters.status;
    if (filters.sector.trim()) filterObj.sector = filters.sector.trim();
    if (filters.min_score) filterObj.min_score = Number(filters.min_score);
    if (filters.min_rr) filterObj.min_rr = Number(filters.min_rr);
    if (filters.sort_by) filterObj.sort_by = filters.sort_by;
    filterObj.sort_desc = filters.sort_desc;
    if (filters.limit) filterObj.limit = Number(filters.limit);
    if (filters.offset) filterObj.offset = Number(filters.offset);

    setCreating(true);
    try {
      await api.createScreen(form.name.trim(), filterObj, form.description.trim() || undefined);
      toast.success('Screen created');
      resetForm();
      fetchScreens();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.deleteScreen(deleteId);
      toast.success('Screen deleted');
      setDeleteId(null);
      fetchScreens();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const activeFilters = (filtersObj: Record<string, any>) =>
    Object.entries(filtersObj).filter(
      ([, v]) => v !== null && v !== undefined && v !== '' && v !== 'all'
    );

  return (
    <div className="space-y-6 animate-fade-in">
      <InstructionsBanner
        storageKey="screens"
        title="How saved screens work"
        icon={Filter}
        steps={[
          { title: 'Create a screen', description: 'Click "New Screen" to save a set of filters (pattern, timeframe, status, min score, min R:R, sector, sort).' },
          { title: 'Apply to any scan', description: 'Saved screens can be applied to any completed scan to instantly filter its picks.' },
          { title: 'Example', description: 'Save a screen called "High Score Daily" with pattern=any, timeframe=daily, min_score=60. Apply it to any scan to see only high-quality daily setups.' },
          { title: 'Delete', description: 'Click the trash icon on a saved screen to remove it.' },
        ]}
      />
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Saved Screens</h1>
          <p className="text-sm text-text-tertiary mt-1">Your custom screen presets</p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} size="md">
            <Plus className="h-4 w-4" />
            New Screen
          </Button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="animate-slide-up">
          <CardHeader
            title="Create New Screen"
            subtitle="Define a reusable filter preset"
            action={
              <Button variant="ghost" size="sm" onClick={resetForm} aria-label="Cancel">
                <X className="h-4 w-4" />
              </Button>
            }
          />
          <div className="px-5 pb-5 space-y-4">
            {/* Name & description */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="screen-name">Name</Label>
                <Input
                  id="screen-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Daily Breakouts"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="screen-desc">Description (optional)</Label>
                <Input
                  id="screen-desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description of this screen"
                />
              </div>
            </div>

            {/* Filter fields */}
            <div className="border-t border-border-subtle pt-4">
              <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-3">Filters</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label htmlFor="f-pattern">Pattern</Label>
                  <Input
                    id="f-pattern"
                    value={filters.pattern}
                    onChange={(e) => setFilters({ ...filters, pattern: e.target.value })}
                    placeholder="e.g. Cup & Handle"
                  />
                </div>
                <div>
                  <Label htmlFor="f-timeframe">Timeframe</Label>
                  <Select
                    id="f-timeframe"
                    value={filters.timeframe}
                    onChange={(e) => setFilters({ ...filters, timeframe: e.target.value })}
                  >
                    {TIMEFRAMES.map((t) => (
                      <option key={t} value={t}>{t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="f-status">Status</Label>
                  <Select
                    id="f-status"
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s === 'all' ? 'All' : s}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="f-sector">Sector</Label>
                  <Input
                    id="f-sector"
                    value={filters.sector}
                    onChange={(e) => setFilters({ ...filters, sector: e.target.value })}
                    placeholder="e.g. IT"
                  />
                </div>
                <div>
                  <Label htmlFor="f-min-score">Min Score</Label>
                  <Input
                    id="f-min-score"
                    type="number"
                    value={filters.min_score}
                    onChange={(e) => setFilters({ ...filters, min_score: e.target.value })}
                    placeholder="e.g. 50"
                  />
                </div>
                <div>
                  <Label htmlFor="f-min-rr">Min R:R</Label>
                  <Input
                    id="f-min-rr"
                    type="number"
                    step="0.1"
                    value={filters.min_rr}
                    onChange={(e) => setFilters({ ...filters, min_rr: e.target.value })}
                    placeholder="e.g. 2.0"
                  />
                </div>
                <div>
                  <Label htmlFor="f-sort-by">Sort By</Label>
                  <Select
                    id="f-sort-by"
                    value={filters.sort_by}
                    onChange={(e) => setFilters({ ...filters, sort_by: e.target.value })}
                  >
                    {SORT_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="f-sort-dir">Sort Direction</Label>
                  <Select
                    id="f-sort-dir"
                    value={filters.sort_desc ? 'desc' : 'asc'}
                    onChange={(e) => setFilters({ ...filters, sort_desc: e.target.value === 'desc' })}
                  >
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="f-limit">Limit</Label>
                    <Input
                      id="f-limit"
                      type="number"
                      value={filters.limit}
                      onChange={(e) => setFilters({ ...filters, limit: e.target.value })}
                      placeholder="50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="f-offset">Offset</Label>
                    <Input
                      id="f-offset"
                      type="number"
                      value={filters.offset}
                      onChange={(e) => setFilters({ ...filters, offset: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button onClick={handleCreate} loading={creating}>
                <Check className="h-4 w-4" />
                Create Screen
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <Card className="bg-danger-subtle border-danger/20 animate-slide-up">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Delete this screen?</p>
              <p className="text-xs text-text-tertiary mt-0.5">This action cannot be undone.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Screens list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-72 mt-2" />
              <div className="flex gap-2 mt-3">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
            </Card>
          ))}
        </div>
      ) : screens.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Filter className="h-12 w-12" />}
            title="No saved screens yet"
            description="Create a screen preset to quickly apply your favorite filters to scan results."
            action={
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" />
                Create Your First Screen
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {screens.map((screen) => {
            const active = activeFilters(screen.filters);
            return (
              <Card key={screen.id} hover className="p-5 animate-fade-in">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-text-primary truncate">{screen.name}</h3>
                    {screen.description && (
                      <p className="text-xs text-text-secondary mt-1 line-clamp-2">{screen.description}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteId(screen.id)}
                    aria-label={`Delete ${screen.name}`}
                    className="shrink-0"
                  >
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </div>

                {/* Filter badges */}
                {active.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {active.map(([k, v]) => (
                      <Badge key={k}>
                        {k}: {String(v)}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border-subtle">
                  <p className="text-xs text-text-tertiary">Created {fmtDate(screen.created_at)}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
