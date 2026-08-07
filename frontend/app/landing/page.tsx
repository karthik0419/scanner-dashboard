'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { TrendingUp, Zap, Target, Shield, BarChart3, Activity, ArrowRight, Check } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-border bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-text-primary">Scanner</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login"><Button variant="ghost" size="sm">Sign In</Button></Link>
            <Link href="/register"><Button size="sm">Get Started</Button></Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-accent-muted via-white to-white">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[400px] w-[800px] bg-gradient-to-br from-accent/20 to-info/10 rounded-full blur-[100px] opacity-60" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-1.5 text-xs text-text-secondary mb-6 animate-fade-in shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-success animate-pulse" />
            NSE India · 2000+ stocks scanned daily
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-text-primary tracking-tight animate-slide-up">
            Find swing setups
            <br />
            <span className="bg-gradient-to-r from-accent to-info bg-clip-text text-transparent">before they break out</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary animate-slide-up">
            Automated pattern screener for NSE stocks. Cup & Handle, Double Bottom, Darvas Box,
            Breakouts, and more — with entry, stop-loss, and targets calculated for every pick.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3 animate-slide-up">
            <Link href="/register">
              <Button size="lg" className="group shadow-pop">
                Start Scanning Free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">View Dashboard</Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-text-tertiary">No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="border-y border-border bg-bg-subtle">
        <div className="mx-auto grid max-w-5xl grid-cols-2 md:grid-cols-4 divide-x divide-border">
          {[
            { label: 'Stocks Scanned', value: '2,000+' },
            { label: 'Patterns Detected', value: '14 types' },
            { label: 'Timeframes', value: 'D / W / M' },
            { label: 'Avg R:R', value: '3:1' },
          ].map((stat, i) => (
            <div key={i} className="px-6 py-8 text-center">
              <p className="text-3xl font-bold text-text-primary tabular-nums">{stat.value}</p>
              <p className="text-xs text-text-tertiary mt-1 uppercase tracking-wide">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-text-primary">Everything you need to find trades</h2>
          <p className="mt-3 text-text-secondary">Professional-grade screening tools, built for NSE swing traders.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: Zap, title: 'Automated Scanning', desc: 'Run scans across 2000+ NSE stocks. 14 chart patterns, 3 timeframes, sector rotation — all in one click.' },
            { icon: Target, title: 'Entry, SL & Targets', desc: 'Every pick comes with a calculated entry price, ATR-based stop loss, and two profit targets. No guessing.' },
            { icon: Shield, title: 'Risk Management', desc: '8% max stop cap, R:R filtering, tradeability tiers. Know your risk before you enter.' },
            { icon: BarChart3, title: 'Chart Viewer', desc: 'Daily, weekly, and monthly charts for every pick. See the pattern visually before you trade.' },
            { icon: Activity, title: 'Paper Tracker', desc: 'Track scan picks over time. Auto re-entry after whipsaws. Win rate, expectancy, and P&L stats.' },
            { icon: TrendingUp, title: 'Sector Rotation', desc: 'See which sectors are hot. BOOM, RISING, COOLING, WEAK signals with performance metrics.' },
          ].map((f, i) => (
            <div key={i} className="group rounded-xl border border-border bg-white p-6 shadow-card transition-all hover:shadow-pop hover:border-border-strong">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-muted mb-4">
                <f.icon className="h-5 w-5 text-accent" />
              </div>
              <h3 className="text-base font-semibold text-text-primary">{f.title}</h3>
              <p className="text-sm text-text-secondary mt-2 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-y border-border bg-bg-subtle">
        <div className="mx-auto max-w-4xl px-6 py-24">
          <h2 className="text-3xl font-bold text-text-primary text-center mb-16">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Run a Scan', desc: 'Choose your parameters — score threshold, price range, timeframe. Hit scan.' },
              { step: '02', title: 'Filter & Sort', desc: 'Filter by pattern, sector, R:R. Sort by score. Save your favorite screen presets.' },
              { step: '03', title: 'Track Results', desc: 'Paper trade the picks. Monitor win rate, expectancy, and P&L over time.' },
            ].map((s, i) => (
              <div key={i} className="relative">
                <div className="text-5xl font-bold text-accent/20 tabular-nums">{s.step}</div>
                <h3 className="text-lg font-semibold text-text-primary mt-2">{s.title}</h3>
                <p className="text-sm text-text-secondary mt-2">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <h2 className="text-3xl font-bold text-text-primary text-center mb-16">Simple pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <div className="rounded-2xl border border-border bg-white p-8 shadow-card">
            <h3 className="text-lg font-semibold text-text-primary">Free</h3>
            <p className="text-3xl font-bold text-text-primary mt-4">₹0<span className="text-sm font-normal text-text-tertiary">/mo</span></p>
            <ul className="mt-6 space-y-3">
              {['1 scan per day', 'Top 30 picks per scan', 'Daily timeframe only', 'Chart viewer', 'Paper tracker'].map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                  <Check className="h-4 w-4 text-success" /> {f}
                </li>
              ))}
            </ul>
            <Link href="/register"><Button variant="secondary" className="w-full mt-8">Get Started</Button></Link>
          </div>
          <div className="relative rounded-2xl border-2 border-accent bg-accent-subtle p-8 shadow-glow">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">POPULAR</div>
            <h3 className="text-lg font-semibold text-text-primary">Pro</h3>
            <p className="text-3xl font-bold text-text-primary mt-4">₹499<span className="text-sm font-normal text-text-tertiary">/mo</span></p>
            <ul className="mt-6 space-y-3">
              {['Unlimited scans', 'Top 200 picks per scan', 'All timeframes (D/W/M)', 'Saved screen presets', 'Price & pattern alerts', 'Sector rotation heatmap', 'Bearish / short mode'].map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                  <Check className="h-4 w-4 text-success" /> {f}
                </li>
              ))}
            </ul>
            <Link href="/register"><Button className="w-full mt-8">Upgrade to Pro</Button></Link>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-border bg-bg-subtle">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-3xl font-bold text-text-primary">Start finding setups today</h2>
          <p className="mt-3 text-text-secondary">Join traders using Scanner to find NSE swing setups.</p>
          <Link href="/register">
            <Button size="lg" className="mt-8 group shadow-pop">
              Create Free Account
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <span className="text-sm text-text-tertiary">Scanner Dashboard</span>
          </div>
          <p className="text-xs text-text-tertiary">
            Educational screener · Not SEBI-registered advisory
          </p>
        </div>
      </footer>
    </div>
  );
}
