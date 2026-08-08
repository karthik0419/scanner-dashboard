'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { LoadingState } from '@/components/ui/States';
import {
  LayoutDashboard, ScanLine, Save, Activity, TrendingUp, Settings,
  LogOut, Menu, X, ChevronLeft, ChevronRight, Zap,
} from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/scans', label: 'Scans', icon: ScanLine },
  { href: '/dashboard/pead', label: 'PEAD Scanner', icon: Zap },
  { href: '/dashboard/screens', label: 'Saved Screens', icon: Save },
  { href: '/dashboard/tracker', label: 'Paper Tracker', icon: Activity },
  { href: '/dashboard/market', label: 'Market', icon: TrendingUp },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Persist collapse state
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return <LoadingState text="Loading dashboard..." />;
  }

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      {/* ── Sidebar (desktop) — collapsible ── */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-border bg-white relative group flex-shrink-0',
          'transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        <SidebarContent
          user={user}
          pathname={pathname}
          onLogout={logout}
          collapsed={collapsed}
        />
        {/* Collapse toggle button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'absolute right-2 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-white shadow-sm hover:bg-bg-hover transition-opacity',
            'opacity-0 group-hover:opacity-100'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>

      {/* ── Mobile nav drawer ── */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative flex w-64 flex-col border-r border-border bg-white animate-slide-up">
            <button
              onClick={() => setMobileNavOpen(false)}
              className="absolute right-3 top-4 p-1 text-text-tertiary hover:text-text-primary"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent user={user} pathname={pathname} onLogout={logout} collapsed={false} />
          </aside>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between border-b border-border bg-white px-4 h-14">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="p-2 -ml-2 text-text-secondary hover:text-text-primary"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-text-primary">Scanner</span>
          </div>
          <div className="w-8" />
        </header>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ user, pathname, onLogout, collapsed }: {
  user: { name: string; email: string };
  pathname: string;
  onLogout: () => void;
  collapsed: boolean;
}) {
  return (
    <>
      {/* Header */}
      <div className={cn('flex items-center border-b border-border py-5 overflow-hidden whitespace-nowrap', collapsed ? 'justify-center px-2' : 'gap-2.5 px-5')}>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent">
          <TrendingUp className="h-5 w-5 text-white" />
        </div>
        {!collapsed && <span className="font-bold text-text-primary">Scanner</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-4 overflow-hidden" aria-label="Main navigation">
        {nav.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium whitespace-nowrap',
                'min-h-[40px]',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                active
                  ? 'bg-accent-muted text-accent font-semibold'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span className="overflow-hidden">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className={cn('border-t border-border p-3', collapsed && 'px-2')}>
        {!collapsed && (
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
            <p className="text-xs text-text-tertiary truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={onLogout}
          title={collapsed ? 'Logout' : undefined}
          className={cn(
            'flex items-center rounded-lg text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary w-full transition-colors min-h-[40px]',
            collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
          )}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && 'Logout'}
        </button>
      </div>
    </>
  );
}
