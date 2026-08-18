'use client';

/**
 * Watchlist — user categories with their tagged symbols.
 *
 * Create/rename/recolor/hide/delete categories; add/remove symbols;
 * click any symbol to open the interactive chart.
 */
import { useEffect, useState, useCallback } from 'react';
import { api, Category } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Input';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { StockChartModal } from '@/components/charts/StockChartModal';
import { colorClasses, CATEGORY_COLORS } from '@/components/categories/CategoryTagger';
import { InstructionsBanner } from '@/components/ui/Instructions';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Star, Plus, Trash2, Eye, EyeOff, Pencil, Check, X as XIcon, BarChart3, FolderPlus,
} from 'lucide-react';

export default function WatchlistPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('indigo');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.listCategories(true)
      .then(setCategories)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const createCategory = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await api.createCategory(name, newColor);
      setNewName('');
      toast.success(`Category "${name}" created`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create category');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <InstructionsBanner
        storageKey="watchlist"
        title="How categories & watchlists work"
        icon={Star}
        variant="blue"
        steps={[
          { title: 'One category system everywhere', description: 'Categories tag stocks by symbol. The same tags appear in scan results, the paper tracker, and here.' },
          { title: 'Tag from anywhere', description: 'Open any stock chart (scans, tracker, PEAD) and use the "Tag" button — or add symbols directly below.' },
          { title: 'Hide categories', description: 'Hidden categories\' stocks are filtered out of the tracker by default. Use the eye icon to toggle.' },
          { title: 'Click a symbol', description: 'Opens the interactive chart with zoom, pan, and volume.' },
        ]}
      />

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Watchlist</h1>
          <p className="text-sm text-text-tertiary mt-1">Organize stocks into categories — show, hide, and track groups</p>
        </div>
      </div>

      {/* Create category */}
      <Card>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="new-cat-name">New category</Label>
            <Input
              id="new-cat-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createCategory(); }}
              placeholder="e.g. High Conviction, Momentum, Long Term…"
            />
          </div>
          <div className="w-36">
            <Label htmlFor="new-cat-color">Color</Label>
            <Select id="new-cat-color" value={newColor} onChange={(e) => setNewColor(e.target.value)}>
              {Object.keys(CATEGORY_COLORS).map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </Select>
          </div>
          <Button onClick={createCategory} loading={creating} disabled={creating || !newName.trim()}>
            <FolderPlus className="h-4 w-4" /> Create
          </Button>
        </div>
      </Card>

      {/* Categories */}
      {loading ? (
        <LoadingState text="Loading categories..." />
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<Star className="h-12 w-12" />}
          title="No categories yet"
          description="Create a category above, then tag stocks from scan results, the tracker, or add symbols directly."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {categories.map(cat => (
            <CategoryCard
              key={cat.id}
              category={cat}
              onChanged={load}
              onOpenChart={setChartSymbol}
            />
          ))}
        </div>
      )}

      {/* Chart modal */}
      {chartSymbol && (
        <StockChartModal symbol={chartSymbol} onClose={() => setChartSymbol(null)} />
      )}
    </div>
  );
}

function CategoryCard({ category, onChanged, onOpenChart }: {
  category: Category;
  onChanged: () => void;
  onOpenChart: (symbol: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const [editColor, setEditColor] = useState(category.color);
  const [addSymbol, setAddSymbol] = useState('');
  const [busy, setBusy] = useState(false);
  const colors = colorClasses(category.color);

  const saveEdit = async () => {
    const name = editName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.updateCategory(category.id, { name, color: editColor });
      setEditing(false);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update');
    } finally {
      setBusy(false);
    }
  };

  const toggleHidden = async () => {
    setBusy(true);
    try {
      await api.updateCategory(category.id, { is_hidden: !category.is_hidden });
      onChanged();
      toast.success(category.is_hidden ? `"${category.name}" is now visible` : `"${category.name}" is now hidden`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete category "${category.name}" and its ${category.items.length} tagged symbols?`)) return;
    setBusy(true);
    try {
      await api.deleteCategory(category.id);
      onChanged();
      toast.success(`Category "${category.name}" deleted`);
    } catch (e: any) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  const addStock = async () => {
    const sym = addSymbol.trim().toUpperCase();
    if (!sym) return;
    setBusy(true);
    try {
      await api.addToCategory(category.id, sym);
      setAddSymbol('');
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Failed to add symbol');
    } finally {
      setBusy(false);
    }
  };

  const removeStock = async (symbol: string) => {
    setBusy(true);
    try {
      await api.removeFromCategory(category.id, symbol);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={cn('transition-opacity', category.is_hidden && 'opacity-60')}>
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          {editing ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }}
                className="flex-1 min-w-0 px-2 py-1 text-sm bg-bg rounded border border-border focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <select
                value={editColor}
                onChange={(e) => setEditColor(e.target.value)}
                className="px-1 py-1 text-sm bg-bg rounded border border-border"
              >
                {Object.keys(CATEGORY_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={saveEdit} disabled={busy} className="p-1 text-success" aria-label="Save"><Check className="h-4 w-4" /></button>
              <button onClick={() => setEditing(false)} className="p-1 text-text-tertiary" aria-label="Cancel"><XIcon className="h-4 w-4" /></button>
            </div>
          ) : (
            <span className={cn('inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-sm font-medium border', colors.chip)}>
              <span className={cn('w-2 h-2 rounded-full', colors.dot)} />
              {category.name}
              <span className="opacity-60 text-xs">({category.items.length})</span>
              {category.is_hidden && <span className="text-xs opacity-60">hidden</span>}
            </span>
          )}
          {!editing && (
            <div className="flex items-center gap-1">
              <button onClick={() => setEditing(true)} className="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover" aria-label={`Rename ${category.name}`}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={toggleHidden} disabled={busy} className="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover" aria-label={category.is_hidden ? 'Show category' : 'Hide category'}>
                {category.is_hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button onClick={remove} disabled={busy} className="p-1.5 rounded text-text-tertiary hover:text-danger hover:bg-red-50" aria-label={`Delete ${category.name}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Symbols */}
        {category.items.length === 0 ? (
          <p className="text-xs text-text-tertiary">No stocks tagged yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {category.items.map(item => (
              <span
                key={item.id}
                className="group inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-bg border border-border text-sm"
              >
                <button
                  onClick={() => onOpenChart(item.symbol)}
                  className="inline-flex items-center gap-1 font-medium text-text-primary hover:text-accent"
                  aria-label={`Open ${item.symbol} chart`}
                >
                  {item.symbol}
                  <BarChart3 className="h-3 w-3 text-text-tertiary group-hover:text-accent" />
                </button>
                <button
                  onClick={() => removeStock(item.symbol)}
                  disabled={busy}
                  className="text-text-tertiary hover:text-danger"
                  aria-label={`Remove ${item.symbol} from ${category.name}`}
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Add symbol */}
        <div className="flex items-center gap-2 pt-1">
          <input
            value={addSymbol}
            onChange={(e) => setAddSymbol(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addStock(); }}
            placeholder="Add symbol (e.g. RELIANCE)…"
            className="flex-1 min-w-0 px-2 py-1.5 text-sm bg-bg rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <Button size="sm" variant="outline" onClick={addStock} disabled={busy || !addSymbol.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </div>
    </Card>
  );
}
