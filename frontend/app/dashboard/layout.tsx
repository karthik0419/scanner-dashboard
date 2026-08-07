'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { LoadingState } from '@/components/ui/States';
import { LayoutDashboard, ScanLine, Save, Activity, TrendingUp, Settings, LogOut, Menu, X } from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/scans', label: 'Scans', icon: ScanLine },
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
    <div className="flex h-screen bg-bg-base">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-white">
        <SidebarContent user={user} pathname={pathname} onLogout={logout} />
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
            <SidebarContent user={user} pathname={pathname} onLogout={logout} />
          </aside>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
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

function SidebarContent({ user, pathname, onLogout }: {
  user: { name: string; email: string };
  pathname: string;
  onLogout: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
          <TrendingUp className="h-5 w-5 text-white" />
        </div>
        <span className="font-bold text-text-primary">Scanner</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Main navigation">
        {nav.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                'min-h-[40px]',
                active
                  ? 'bg-accent-muted text-accent font-semibold'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="px-3 py-2 mb-1">
          <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
          <p className="text-xs text-text-tertiary truncate">{user.email}</p>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary w-full transition-colors min-h-[40px]"
        >
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </>
  );
}
