'use client';

/**
 * CategoryTagger — tag/untag a symbol into user categories.
 *
 * Shows current category chips for the symbol + a dropdown to toggle
 * membership and create new categories inline.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Tag, Plus, Check } from 'lucide-react';
import { api, Category } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export const CATEGORY_COLORS: Record<string, { chip: string; dot: string }> = {
  indigo: { chip: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
  green:  { chip: 'bg-green-50 text-green-700 border-green-200',   dot: 'bg-green-500' },
  red:    { chip: 'bg-red-50 text-red-700 border-red-200',         dot: 'bg-red-500' },
  amber:  { chip: 'bg-amber-50 text-amber-700 border-amber-200',   dot: 'bg-amber-500' },
  blue:   { chip: 'bg-blue-50 text-blue-700 border-blue-200',      dot: 'bg-blue-500' },
  purple: { chip: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  pink:   { chip: 'bg-pink-50 text-pink-700 border-pink-200',      dot: 'bg-pink-500' },
  gray:   { chip: 'bg-gray-50 text-gray-700 border-gray-200',      dot: 'bg-gray-500' },
};

export function colorClasses(color: string) {
  return CATEGORY_COLORS[color] || CATEGORY_COLORS.indigo;
}

export function CategoryTagger({ symbol }: { symbol: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const cleanSymbol = symbol.toUpperCase().replace('.NS', '');

  const load = useCallback(() => {
    api.listCategories(true).then(setCategories).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isTagged = (cat: Category) => cat.items.some(i => i.symbol === cleanSymbol);
  const tagged = categories.filter(isTagged);

  const toggle = async (cat: Category) => {
    setBusy(true);
    try {
      if (isTagged(cat)) {
        await api.removeFromCategory(cat.id, cleanSymbol);
      } else {
        await api.addToCategory(cat.id, cleanSymbol);
      }
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update category');
    } finally {
      setBusy(false);
    }
  };

  const createAndTag = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const cat = await api.createCategory(name);
      await api.addToCategory(cat.id, cleanSymbol);
      setNewName('');
      load();
      toast.success(`Added ${cleanSymbol} to "${name}"`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to create category');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative inline-flex items-center gap-1.5 flex-wrap" ref={ref}>
      {tagged.map(cat => (
        <span
          key={cat.id}
          className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border', colorClasses(cat.color).chip)}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full', colorClasses(cat.color).dot)} />
          {cat.name}
        </span>
      ))}
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-border text-text-tertiary hover:text-text-primary hover:border-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        aria-label={`Manage categories for ${cleanSymbol}`}
        aria-expanded={open}
      >
        <Tag className="h-3 w-3" /> Tag
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-bg-card shadow-lg p-2 space-y-1">
          <p className="text-xs text-text-tertiary px-1 pb-1">Tag {cleanSymbol} into:</p>
          {categories.length === 0 && (
            <p className="text-xs text-text-tertiary px-1 py-2">No categories yet — create one below.</p>
          )}
          {categories.map(cat => (
            <button
              key={cat.id}
              disabled={busy}
              onClick={() => toggle(cat)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded text-sm text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full', colorClasses(cat.color).dot)} />
                {cat.name}
                {cat.is_hidden && <span className="text-xs text-text-tertiary">(hidden)</span>}
              </span>
              {isTagged(cat) && <Check className="h-3.5 w-3.5 text-accent" />}
            </button>
          ))}
          <div className="flex items-center gap-1 pt-1 border-t border-border">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createAndTag(); }}
              placeholder="New category…"
              className="flex-1 min-w-0 px-2 py-1 text-sm bg-bg rounded border border-border focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              onClick={createAndTag}
              disabled={busy || !newName.trim()}
              className="p-1.5 rounded bg-accent text-white disabled:opacity-50 hover:opacity-90"
              aria-label="Create category and tag symbol"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
