'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Alert } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Input';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { cn, fmtDate } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Bell,
  Plus,
  Trash2,
  Send,
  LogOut,
  User as UserIcon,
  Mail,
  Calendar,
  Pencil,
  AlertTriangle,
} from 'lucide-react';

const ALERT_TYPES: { value: string; label: string }[] = [
  { value: 'price_above', label: 'Price Above' },
  { value: 'price_below', label: 'Price Below' },
  { value: 'pattern_breakout', label: 'Pattern Breakout' },
  { value: 'score_threshold', label: 'Score Threshold' },
];

const CHANNELS: { value: string; label: string }[] = [
  { value: 'telegram', label: 'Telegram' },
  { value: 'email', label: 'Email' },
];

function alertTypeLabel(t: string): string {
  return ALERT_TYPES.find(a => a.value === t)?.label ?? t.replace('_', ' ');
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  // Create-form state
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [alertType, setAlertType] = useState('price_above');
  const [conditionValue, setConditionValue] = useState('');
  const [channel, setChannel] = useState('telegram');

  // Telegram state
  const [chatId, setChatId] = useState('');
  const [testing, setTesting] = useState(false);

  const fetchAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const list = await api.listAlerts();
      setAlerts(list);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load alerts');
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Pre-fill Telegram chat id from user profile once loaded
  useEffect(() => {
    if (user?.telegram_chat_id) setChatId(user.telegram_chat_id);
  }, [user]);

  const resetForm = () => {
    setSymbol('');
    setAlertType('price_above');
    setConditionValue('');
    setChannel('telegram');
  };

  const handleCreate = async () => {
    if (!symbol.trim()) {
      toast.error('Enter a symbol');
      return;
    }
    setCreating(true);
    try {
      await api.createAlert(
        symbol.trim().toUpperCase(),
        alertType,
        conditionValue ? Number(conditionValue) : undefined,
      );
      toast.success('Alert created');
      resetForm();
      setShowForm(false);
      fetchAlerts();
    } catch (err: any) {
      toast.error(err.message || 'Could not create alert');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteAlert(id);
      toast.success('Alert deleted');
      fetchAlerts();
    } catch (err: any) {
      toast.error(err.message || 'Delete failed');
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await api.toggleAlert(id);
      fetchAlerts();
    } catch (err: any) {
      toast.error(err.message || 'Toggle failed');
    }
  };

  const handleTestNotification = () => {
    if (!chatId.trim()) {
      toast.error('Enter a Telegram chat ID first');
      return;
    }
    setTesting(true);
    // Placeholder — no backend endpoint yet
    setTimeout(() => {
      setTesting(false);
      toast.success('Test notification queued (placeholder)');
    }, 800);
  };

  const telegramConnected = Boolean(user?.telegram_chat_id);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-sm text-text-tertiary mt-1">
          Manage your profile, alerts, and integrations.
        </p>
      </div>

      {/* ── Profile ─────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Profile"
          subtitle="Your account information"
          action={
            <Button variant="outline" size="sm" aria-label="Edit profile">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          }
        />
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <ProfileField icon={<UserIcon className="h-4 w-4" />} label="Name" value={user?.name} />
          <ProfileField icon={<Mail className="h-4 w-4" />} label="Email" value={user?.email} />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary mb-1.5">
              Plan
            </p>
            <Badge variant={user?.plan === 'pro' ? 'RISING' : 'WATCH'}>
              {user?.plan ?? '—'}
            </Badge>
          </div>
          <ProfileField
            icon={<Calendar className="h-4 w-4" />}
            label="Member since"
            value={fmtDate(user?.created_at)}
          />
        </div>
      </Card>

      {/* ── Alerts ──────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Alerts"
          subtitle="Get notified when conditions are met"
          action={
            <Button
              variant={showForm ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => {
                setShowForm(v => !v);
                if (showForm) resetForm();
              }}
              aria-label={showForm ? 'Cancel new alert' : 'Create new alert'}
              aria-expanded={showForm}
            >
              <Plus className="h-3.5 w-3.5" />
              {showForm ? 'Cancel' : 'New Alert'}
            </Button>
          }
        />

        <div className="px-5 pb-5">
          {/* Inline create form */}
          {showForm && (
            <div className="mb-5 rounded-lg border border-border-subtle bg-bg-elevated p-4 animate-slide-up">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="alert-symbol">Symbol</Label>
                  <Input
                    id="alert-symbol"
                    value={symbol}
                    onChange={e => setSymbol(e.target.value.toUpperCase())}
                    placeholder="TCS"
                    aria-label="Symbol"
                  />
                </div>
                <div>
                  <Label htmlFor="alert-type">Alert Type</Label>
                  <Select
                    id="alert-type"
                    value={alertType}
                    onChange={e => setAlertType(e.target.value)}
                    aria-label="Alert type"
                  >
                    {ALERT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="alert-value">Condition Value</Label>
                  <Input
                    id="alert-value"
                    type="number"
                    value={conditionValue}
                    onChange={e => setConditionValue(e.target.value)}
                    placeholder="Target price / score"
                    aria-label="Condition value"
                  />
                </div>
                <div>
                  <Label htmlFor="alert-channel">Channel</Label>
                  <Select
                    id="alert-channel"
                    value={channel}
                    onChange={e => setChannel(e.target.value)}
                    aria-label="Notification channel"
                  >
                    {CHANNELS.map(c => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    resetForm();
                    setShowForm(false);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreate} loading={creating}>
                  <Bell className="h-4 w-4" />
                  Create Alert
                </Button>
              </div>
            </div>
          )}

          {/* Alert list */}
          {loadingAlerts ? (
            <LoadingState text="Loading alerts…" />
          ) : alerts.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-10 w-10" />}
              title="No alerts configured"
              description="Create your first alert to get notified when a stock hits your target price or pattern."
              action={
                !showForm && (
                  <Button size="sm" onClick={() => setShowForm(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    New Alert
                  </Button>
                )
              }
            />
          ) : (
            <ul className="space-y-2" aria-label="Alert list">
              {alerts.map(alert => (
                <li
                  key={alert.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-bg-card p-3 transition-colors duration-150 hover:bg-bg-hover"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Active toggle */}
                    <button
                      onClick={() => handleToggle(alert.id)}
                      role="switch"
                      aria-checked={alert.is_active}
                      aria-label={`Toggle alert for ${alert.symbol}`}
                      className={cn(
                        'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg-card',
                        alert.is_active ? 'bg-accent' : 'bg-gray-200',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
                          alert.is_active ? 'translate-x-5' : 'translate-x-0.5',
                        )}
                      />
                    </button>

                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate">
                        <span className="font-semibold">{alert.symbol}</span>
                        <span className="text-text-tertiary"> · </span>
                        <span className="text-text-secondary">
                          {alertTypeLabel(alert.alert_type)}
                        </span>
                        {alert.condition_value != null && (
                          <>
                            <span className="text-text-tertiary"> · </span>
                            <span className="text-text-secondary tabular-nums">
                              {alert.condition_value}
                            </span>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-text-tertiary mt-0.5">
                        {alert.channel} · {fmtDate(alert.created_at)}
                      </p>
                    </div>

                    {alert.triggered && (
                      <Badge variant="completed" className="ml-1">
                        Triggered
                      </Badge>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(alert.id)}
                    aria-label={`Delete alert for ${alert.symbol}`}
                    className="text-danger hover:text-danger hover:bg-danger-subtle"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* ── Telegram ────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Telegram"
          subtitle="Receive instant alerts via Telegram"
        />
        <div className="px-5 pb-5 space-y-4">
          {/* Connection status */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                telegramConnected ? 'bg-success' : 'bg-gray-300',
              )}
              aria-hidden
            />
            <span className="text-sm text-text-secondary">
              {telegramConnected ? 'Connected' : 'Not connected'}
            </span>
            <Badge variant={telegramConnected ? 'RISING' : 'WATCH'}>
              {telegramConnected ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          <div>
            <Label htmlFor="telegram-chat-id">Telegram Chat ID</Label>
            <Input
              id="telegram-chat-id"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
              placeholder="e.g. 123456789"
              aria-label="Telegram chat ID"
            />
            <p className="text-xs text-text-tertiary mt-2 leading-relaxed">
              To find your chat ID, message{' '}
              <span className="font-medium text-text-secondary">@userinfobot</span> on Telegram —
              it will reply with your numeric chat ID. Paste it above to receive alerts.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={handleTestNotification}
              loading={testing}
              disabled={!chatId.trim()}
            >
              <Send className="h-4 w-4" />
              Test Notification
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Danger Zone ─────────────────────────────────────── */}
      <Card className="bg-danger-subtle border-danger/20">
        <CardHeader
          title="Danger Zone"
          subtitle="Irreversible account actions"
          action={
            <AlertTriangle className="h-5 w-5 text-danger/70" aria-hidden />
          }
        />
        <div className="px-5 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm text-text-primary font-medium">Sign out</p>
            <p className="text-xs text-text-tertiary mt-0.5">
              End your current session and return to the login screen.
            </p>
          </div>
          <Button variant="danger" onClick={logout} aria-label="Logout">
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Small read-only profile field with an icon. */
function ProfileField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary mb-1.5">
        {label}
      </p>
      <div className="flex items-center gap-2 text-sm text-text-primary">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-muted text-accent">
          {icon}
        </span>
        <span className="truncate">{value || '—'}</span>
      </div>
    </div>
  );
}
