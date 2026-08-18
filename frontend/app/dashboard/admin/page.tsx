'use client';

/**
 * Admin — user management + system stats (admin role only).
 *
 * Lists users with scan/trade counts, supports search/filter, create,
 * edit role/plan/active, reset password, delete. Shows system totals.
 */
import { useEffect, useState, useCallback } from 'react';
import { api, AdminUser, AdminStats } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Input';
import { TableSkeleton, EmptyState, LoadingState } from '@/components/ui/States';
import { fmtDate, cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  ShieldCheck, Users, Search, Plus, Trash2, KeyRound, Pencil, Check, X as XIcon,
  Activity, ScanLine, Star, TrendingUp,
} from 'lucide-react';

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    Promise.allSettled([
      api.adminListUsers({
        q: search || undefined,
        role: roleFilter || undefined,
        active: activeFilter === '' ? undefined : activeFilter === 'true',
        limit: 100,
      }),
      api.adminStats(),
    ]).then(([u, s]) => {
      if (u.status === 'fulfilled') setUsers(u.value);
      else if (u.status === 'rejected' && u.reason?.message?.includes('403')) {
        toast.error('Admin access required');
      } else if (u.status === 'rejected') {
        toast.error(u.reason?.message || 'Failed to load users');
      }
      if (s.status === 'fulfilled') setStats(s.value);
      setLoading(false);
    });
  }, [search, roleFilter, activeFilter]);

  useEffect(() => { load(); }, [load]);

  // Guard: non-admins see a clear message
  if (user && user.role !== 'admin') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Admin</h1>
          <p className="text-sm text-text-tertiary mt-1">User management & system stats</p>
        </div>
        <EmptyState
          icon={<ShieldCheck className="h-12 w-12" />}
          title="Admin access required"
          description="Your account doesn't have admin privileges. Contact an administrator to manage users."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Admin</h1>
          <p className="text-sm text-text-tertiary mt-1">User management & system stats</p>
        </div>
        <Button onClick={() => setShowCreate(s => !s)}>
          <Plus className="h-4 w-4" /> New User
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={stats.total_users} sublabel={`${stats.active_users} active`} icon={<Users className="h-6 w-6" />} />
          <StatCard label="Admins" value={stats.admin_users} icon={<ShieldCheck className="h-6 w-6" />} />
          <StatCard label="Scans (7d)" value={stats.scans_last_7d} sublabel={`${stats.total_scans} all-time`} icon={<ScanLine className="h-6 w-6" />} />
          <StatCard label="Trades" value={stats.total_trades} sublabel={`${stats.total_categories} categories`} icon={<Activity className="h-6 w-6" />} />
        </div>
      )}

      {/* Create user form */}
      {showCreate && (
        <CreateUserForm
          onCreated={() => { setShowCreate(false); load(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-64">
          <Label htmlFor="search">Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <Input
              id="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Email or name…"
              className="pl-8"
            />
          </div>
        </div>
        <div className="w-36">
          <Label htmlFor="role-filter">Role</Label>
          <Select id="role-filter" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </Select>
        </div>
        <div className="w-36">
          <Label htmlFor="active-filter">Status</Label>
          <Select id="active-filter" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Deactivated</option>
          </Select>
        </div>
        {(search || roleFilter || activeFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setRoleFilter(''); setActiveFilter(''); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Users table */}
      <Card>
        <CardHeader title="Users" subtitle={`${users.length} shown`} />
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : users.length === 0 ? (
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title="No users found"
            description="Try adjusting your filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-tertiary">
                  <th className="py-2.5 px-3 font-medium">Name</th>
                  <th className="py-2.5 px-3 font-medium">Email</th>
                  <th className="py-2.5 px-3 font-medium">Role</th>
                  <th className="py-2.5 px-3 font-medium">Plan</th>
                  <th className="py-2.5 px-3 text-right font-medium">Scans</th>
                  <th className="py-2.5 px-3 text-right font-medium">Trades</th>
                  <th className="py-2.5 px-3 font-medium">Joined</th>
                  <th className="py-2.5 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <UserRow key={u.id} user={u} currentUserId={user?.id} onChanged={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function UserRow({ user, currentUserId, onChanged }: { user: AdminUser; currentUserId?: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(user.name);
  const [editRole, setEditRole] = useState(user.role);
  const [editPlan, setEditPlan] = useState(user.plan);
  const [editActive, setEditActive] = useState(user.is_active);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.adminUpdateUser(user.id, {
        name: editName, role: editRole, plan: editPlan, is_active: editActive,
      });
      setEditing(false);
      onChanged();
      toast.success(`Updated ${user.email}`);
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const resetPwd = async () => {
    const pwd = window.prompt(`Enter new password for ${user.email} (min 8 chars):`);
    if (!pwd) return;
    if (pwd.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setBusy(true);
    try {
      await api.adminResetPassword(user.id, pwd);
      toast.success(`Password reset for ${user.email}`);
    } catch (e: any) {
      toast.error(e.message || 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete user ${user.email}? This removes all their scans, picks, trades, and categories.`)) return;
    setBusy(true);
    try {
      await api.adminDeleteUser(user.id);
      onChanged();
      toast.success(`Deleted ${user.email}`);
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const isSelf = user.id === currentUserId;

  return (
    <tr className="border-b border-border-subtle hover:bg-bg-hover/50">
      <td className="py-2.5 px-3 font-medium text-text-primary">
        {editing ? (
          <input value={editName} onChange={(e) => setEditName(e.target.value)} className="px-2 py-1 text-sm bg-bg rounded border border-border focus:outline-none focus:ring-1 focus:ring-accent w-full" />
        ) : user.name}
      </td>
      <td className="py-2.5 px-3 text-text-secondary">
        {user.email}
        {isSelf && <span className="ml-1.5 text-[10px] text-accent font-bold">(you)</span>}
      </td>
      <td className="py-2.5 px-3">
        {editing ? (
          <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="px-1.5 py-1 text-sm bg-bg rounded border border-border">
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        ) : (
          <span className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
            user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
          )}>
            {user.role}
          </span>
        )}
      </td>
      <td className="py-2.5 px-3">
        {editing ? (
          <select value={editPlan} onChange={(e) => setEditPlan(e.target.value)} className="px-1.5 py-1 text-sm bg-bg rounded border border-border">
            <option value="free">free</option>
            <option value="pro">pro</option>
          </select>
        ) : (
          <span className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
            user.plan === 'pro' ? 'bg-amber-100 text-amber-700' : 'bg-gray-50 text-gray-600'
          )}>
            {user.plan}
          </span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums text-text-secondary">{user.scan_count}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-text-secondary">{user.trade_count}</td>
      <td className="py-2.5 px-3 text-xs text-text-tertiary whitespace-nowrap">{fmtDate(user.created_at)}</td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button onClick={save} disabled={busy} className="p-1.5 rounded text-success hover:bg-green-50" aria-label="Save"><Check className="h-4 w-4" /></button>
              <button onClick={() => setEditing(false)} className="p-1.5 rounded text-text-tertiary hover:bg-bg-hover" aria-label="Cancel"><XIcon className="h-4 w-4" /></button>
            </>
          ) : (
            <>
              {editing && (
                <label className="inline-flex items-center gap-1 text-xs text-text-tertiary">
                  <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                  Active
                </label>
              )}
              <button onClick={() => setEditing(true)} className="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover" aria-label={`Edit ${user.email}`}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={resetPwd} disabled={busy} className="p-1.5 rounded text-text-tertiary hover:text-amber-600 hover:bg-amber-50" aria-label={`Reset password for ${user.email}`}>
                <KeyRound className="h-3.5 w-3.5" />
              </button>
              <button onClick={remove} disabled={busy || isSelf} className="p-1.5 rounded text-text-tertiary hover:text-danger hover:bg-red-50 disabled:opacity-30" aria-label={`Delete ${user.email}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function CreateUserForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [plan, setPlan] = useState('free');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !name || password.length < 8) {
      toast.error('Fill all fields; password must be 8+ chars');
      return;
    }
    setBusy(true);
    try {
      await api.adminCreateUser({ email, name, password, role, plan });
      toast.success(`Created ${email}`);
      onCreated();
    } catch (e: any) {
      toast.error(e.message || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Create new user" action={
        <Button variant="ghost" size="sm" onClick={onCancel}><XIcon className="h-4 w-4" /></Button>
      } />
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="cu-email">Email</Label>
          <Input id="cu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
        </div>
        <div>
          <Label htmlFor="cu-name">Name</Label>
          <Input id="cu-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        <div>
          <Label htmlFor="cu-pwd">Password (min 8)</Label>
          <Input id="cu-pwd" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div>
          <Label htmlFor="cu-role">Role</Label>
          <Select id="cu-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="cu-plan">Plan</Label>
          <Select id="cu-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="free">free</option>
            <option value="pro">pro</option>
          </Select>
        </div>
        <div className="flex items-end">
          <Button onClick={submit} loading={busy} disabled={busy}>
            <Plus className="h-4 w-4" /> Create User
          </Button>
        </div>
      </div>
    </Card>
  );
}
