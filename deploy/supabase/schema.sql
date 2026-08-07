-- Supabase schema for Scanner Dashboard
-- Run this in Supabase SQL Editor after creating a project.
-- This creates the same tables that the backend auto-creates via SQLAlchemy,
-- but with Supabase RLS (Row Level Security) policies for multi-tenant safety.

-- Enable UUID extension (Supabase has this by default)
create extension if not exists "uuid-ossp";

-- ── Users (extends Supabase auth.users) ───────────────────────────────
-- We use Supabase's built-in auth.users for authentication.
-- This table stores our app-specific user profile data.
create table if not exists app_users (
    id uuid primary key default uuid_generate_v4(),
    auth_id uuid references auth.users(id) on delete cascade,
    email text unique not null,
    name text not null,
    plan text default 'free',
    telegram_chat_id text,
    created_at timestamptz default now()
);

-- ── Scans ─────────────────────────────────────────────────────────────
create table if not exists scans (
    id uuid primary key default uuid_generate_v4(),
    user_id text not null,
    status text default 'queued',
    top integer default 30,
    min_score float default 50,
    sl_mode text default 'atr',
    min_price float,
    max_price float,
    stocks_file text,
    bearish boolean default false,
    timeframe text default 'all',
    smart boolean default false,
    test_mode boolean default false,
    total_picks integer default 0,
    csv_path text,
    error_message text,
    created_at timestamptz default now(),
    started_at timestamptz,
    completed_at timestamptz,
    duration_seconds float
);
create index if not exists idx_scans_user_id on scans(user_id);
create index if not exists idx_scans_status on scans(status);

-- ── Picks ─────────────────────────────────────────────────────────────
create table if not exists picks (
    id uuid primary key default uuid_generate_v4(),
    scan_id text not null references scans(id) on delete cascade,
    symbol text,
    pattern text,
    timeframe text,
    status text,
    cmp float,
    breakout float,
    stop_loss float,
    target_1 float,
    target_2 float,
    upside_pct float,
    risk_pct float,
    upside_remaining float,
    pct_done float,
    pct_left float,
    sustained boolean,
    nested_cup boolean,
    double_confirm boolean,
    hist_resist float,
    rr float,
    volume float,
    neckline float,
    sector text,
    sector_signal text,
    score float,
    atr float
);
create index if not exists idx_picks_scan_id on picks(scan_id);
create index if not exists idx_picks_symbol on picks(symbol);
create index if not exists idx_picks_pattern on picks(pattern);
create index if not exists idx_picks_score on picks(score);

-- ── Saved Screens ─────────────────────────────────────────────────────
create table if not exists saved_screens (
    id uuid primary key default uuid_generate_v4(),
    user_id text not null,
    name text not null,
    description text,
    filters jsonb not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
create index if not exists idx_saved_screens_user_id on saved_screens(user_id);

-- ── Alerts ────────────────────────────────────────────────────────────
create table if not exists alerts (
    id uuid primary key default uuid_generate_v4(),
    user_id text not null,
    symbol text not null,
    alert_type text not null,
    condition_value float,
    channel text default 'telegram',
    is_active boolean default true,
    triggered boolean default false,
    triggered_at timestamptz,
    created_at timestamptz default now()
);
create index if not exists idx_alerts_user_id on alerts(user_id);
create index if not exists idx_alerts_symbol on alerts(symbol);

-- ── Paper Trades ──────────────────────────────────────────────────────
create table if not exists paper_trades (
    id uuid primary key default uuid_generate_v4(),
    user_id text not null,
    symbol text not null,
    pattern text,
    status_at_scan text,
    breakout_level float,
    entry_price float,
    stop_loss float,
    target_1 float,
    target_2 float,
    scan_date timestamptz,
    cmp_at_scan float,
    risk_pct float,
    upside_pct float,
    rr float,
    score float,
    sector text,
    current_price float,
    current_status text default 'OPEN',
    current_pnl_pct float,
    days_held integer default 0,
    exit_price float,
    exit_date timestamptz,
    exit_reason text,
    tradeable text default 'TRADE',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
create index if not exists idx_paper_trades_user_id on paper_trades(user_id);
create index if not exists idx_paper_trades_symbol on paper_trades(symbol);

-- ── RLS Policies (Row Level Security) ─────────────────────────────────
-- Each user can only access their own data.
alter table scans enable row level security;
alter table picks enable row level security;
alter table saved_screens enable row level security;
alter table alerts enable row level security;
alter table paper_trades enable row level security;

-- Scans: users can only see their own scans
create policy "scans_select_own" on scans for select using (user_id = current_setting('app.current_user_id', true));
create policy "scans_insert_own" on scans for insert with check (user_id = current_setting('app.current_user_id', true));
create policy "scans_update_own" on scans for update using (user_id = current_setting('app.current_user_id', true));
create policy "scans_delete_own" on scans for delete using (user_id = current_setting('app.current_user_id', true));

-- Saved screens: users can only access their own
create policy "screens_select_own" on saved_screens for select using (user_id = current_setting('app.current_user_id', true));
create policy "screens_insert_own" on saved_screens for insert with check (user_id = current_setting('app.current_user_id', true));
create policy "screens_update_own" on saved_screens for update using (user_id = current_setting('app.current_user_id', true));
create policy "screens_delete_own" on saved_screens for delete using (user_id = current_setting('app.current_user_id', true));

-- Alerts: users can only access their own
create policy "alerts_select_own" on alerts for select using (user_id = current_setting('app.current_user_id', true));
create policy "alerts_insert_own" on alerts for insert with check (user_id = current_setting('app.current_user_id', true));
create policy "alerts_update_own" on alerts for update using (user_id = current_setting('app.current_user_id', true));
create policy "alerts_delete_own" on alerts for delete using (user_id = current_setting('app.current_user_id', true));

-- Paper trades: users can only access their own
create policy "trades_select_own" on paper_trades for select using (user_id = current_setting('app.current_user_id', true));
create policy "trades_insert_own" on paper_trades for insert with check (user_id = current_setting('app.current_user_id', true));
create policy "trades_update_own" on paper_trades for update using (user_id = current_setting('app.current_user_id', true));
create policy "trades_delete_own" on paper_trades for delete using (user_id = current_setting('app.current_user_id', true));

-- Picks: accessible if the parent scan belongs to the user
create policy "picks_select_own" on picks for select using (
  exists (select 1 from scans where scans.id = picks.scan_id and scans.user_id = current_setting('app.current_user_id', true))
);
create policy "picks_insert_own" on picks for insert with check (
  exists (select 1 from scans where scans.id = picks.scan_id and scans.user_id = current_setting('app.current_user_id', true))
);
