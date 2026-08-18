"""SQLAlchemy ORM models."""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Boolean, Text, ForeignKey, JSON,
    Enum as SAEnum, Index, UniqueConstraint,
)
from sqlalchemy.orm import relationship
import enum

from app.database import Base


def _uuid_str():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_uuid_str)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    role = Column(String, default="user")  # user / admin
    plan = Column(String, default="free")  # free / pro
    telegram_chat_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    saved_screens = relationship("SavedScreen", back_populates="user", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="user", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="user", cascade="all, delete-orphan")


class ScanStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class Scan(Base):
    __tablename__ = "scans"

    id = Column(String, primary_key=True, default=_uuid_str)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    status = Column(String, default=ScanStatus.queued.value, index=True)  # queued/running/completed/failed/cancelled
    process_pid = Column(Integer, nullable=True)  # subprocess PID for kill/cancel
    scan_name = Column(String, nullable=True)  # user-defined label for the scan
    # Scan parameters
    top = Column(Integer, default=30)
    min_score = Column(Float, default=50)
    sl_mode = Column(String, default="atr")
    min_price = Column(Float, nullable=True)
    max_price = Column(Float, nullable=True)
    stocks_file = Column(String, nullable=True)
    bearish = Column(Boolean, default=False)
    timeframe = Column(String, default="all")
    smart = Column(Boolean, default=False)
    test_mode = Column(Boolean, default=False)
    # Results
    total_picks = Column(Integer, default=0)
    csv_path = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, nullable=True)

    picks = relationship("Pick", back_populates="scan", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_scans_user_created", "user_id", "created_at"),
    )


class Pick(Base):
    __tablename__ = "picks"

    id = Column(String, primary_key=True, default=_uuid_str)
    scan_id = Column(String, ForeignKey("scans.id"), nullable=False, index=True)
    # Scanner output columns
    symbol = Column(String, index=True)
    pattern = Column(String, index=True)
    timeframe = Column(String, index=True)
    status = Column(String, index=True)  # BREAKOUT / NEAR / WATCH
    cmp = Column(Float)
    breakout = Column(Float)
    stop_loss = Column(Float)
    target_1 = Column(Float)
    target_2 = Column(Float)
    upside_pct = Column(Float)
    risk_pct = Column(Float)
    upside_remaining = Column(Float, nullable=True)
    pct_done = Column(Float, nullable=True)
    pct_left = Column(Float, nullable=True)
    sustained = Column(Boolean, nullable=True)
    nested_cup = Column(Boolean, nullable=True)
    double_confirm = Column(Boolean, nullable=True)
    hist_resist = Column(Float, nullable=True)
    rr = Column(Float)
    volume = Column(Float, nullable=True)
    neckline = Column(Float, nullable=True)
    sector = Column(String, nullable=True, index=True)
    sector_signal = Column(String, nullable=True)
    score = Column(Float, index=True)
    atr = Column(Float, nullable=True)

    scan = relationship("Scan", back_populates="picks")

    __table_args__ = (
        Index("ix_picks_scan_score", "scan_id", "score"),
    )


class SavedScreen(Base):
    __tablename__ = "saved_screens"

    id = Column(String, primary_key=True, default=_uuid_str)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # Stored filter params as JSON
    filters = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="saved_screens")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, default=_uuid_str)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    symbol = Column(String, nullable=False, index=True)
    alert_type = Column(String, nullable=False)  # price_above / price_below / breakout / pattern
    condition_value = Column(Float, nullable=True)
    channel = Column(String, default="telegram")  # telegram / email
    is_active = Column(Boolean, default=True)
    triggered = Column(Boolean, default=False)
    triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="alerts")


class PaperTrade(Base):
    __tablename__ = "paper_trades"

    id = Column(String, primary_key=True, default=_uuid_str)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    symbol = Column(String, nullable=False, index=True)
    pattern = Column(String)
    status_at_scan = Column(String)
    breakout_level = Column(Float)
    entry_price = Column(Float)
    stop_loss = Column(Float)
    target_1 = Column(Float)
    target_2 = Column(Float)
    scan_date = Column(DateTime)
    cmp_at_scan = Column(Float)
    risk_pct = Column(Float)
    upside_pct = Column(Float)
    rr = Column(Float)
    score = Column(Float)
    sector = Column(String)
    current_price = Column(Float, nullable=True)
    current_status = Column(String, default="OPEN")
    current_pnl_pct = Column(Float, nullable=True)
    days_held = Column(Integer, default=0)
    exit_price = Column(Float, nullable=True)
    exit_date = Column(DateTime, nullable=True)
    exit_reason = Column(String, nullable=True)
    tradeable = Column(String, default="TRADE")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_paper_trades_user_status", "user_id", "current_status"),
    )


# ── Categories (shared tagging: picks / trades / watchlist) ───────────

class Category(Base):
    __tablename__ = "categories"

    id = Column(String, primary_key=True, default=_uuid_str)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    color = Column(String(20), default="indigo")  # indigo/green/red/amber/blue/purple/pink/gray
    is_hidden = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="categories")
    items = relationship("CategoryItem", back_populates="category", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_categories_user_name"),
    )


class CategoryItem(Base):
    __tablename__ = "category_items"

    id = Column(String, primary_key=True, default=_uuid_str)
    category_id = Column(String, ForeignKey("categories.id"), nullable=False, index=True)
    symbol = Column(String, nullable=False, index=True)  # universal key across picks/trades/watchlist
    note = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    category = relationship("Category", back_populates="items")

    __table_args__ = (
        UniqueConstraint("category_id", "symbol", name="uq_category_items_cat_symbol"),
    )


# ── PEAD Scanner (earnings-momentum-scanner) ──────────────────────────

class PeadScan(Base):
    __tablename__ = "pead_scans"

    id = Column(String, primary_key=True, default=_uuid_str)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    status = Column(String, default=ScanStatus.queued.value, index=True)
    process_pid = Column(Integer, nullable=True)
    # PEAD scan parameters
    mode = Column(String, default="weekly")  # weekly / daily / discovery
    top = Column(Integer, default=30)
    min_score = Column(Float, default=35)
    sector = Column(String, nullable=True)
    # Results
    total_picks = Column(Integer, default=0)
    csv_path = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, nullable=True)

    picks = relationship("PeadPick", back_populates="scan", cascade="all, delete-orphan")


class PeadPick(Base):
    __tablename__ = "pead_picks"

    id = Column(String, primary_key=True, default=_uuid_str)
    scan_id = Column(String, ForeignKey("pead_scans.id"), nullable=False, index=True)
    # PEAD scanner output columns
    symbol = Column(String, index=True)
    sector = Column(String, nullable=True, index=True)
    status = Column(String, index=True)  # ENTER NOW / WATCH
    mode = Column(String, nullable=True)  # post / pre
    days_since_result = Column(Integer, nullable=True)
    days_to_result = Column(Integer, nullable=True)
    last_quarter = Column(String, nullable=True)
    result_date = Column(String, nullable=True)
    cmp = Column(Float)
    entry = Column(Float, nullable=True)
    stop = Column(Float, nullable=True)
    target = Column(Float, nullable=True)
    rr = Column(Float, nullable=True)
    last_net_profit = Column(Float, nullable=True)
    last_eps = Column(Float, nullable=True)
    proj_profit = Column(Float, nullable=True)
    proj_eps = Column(Float, nullable=True)
    proj_yoy_growth = Column(Float, nullable=True)
    proj_confidence = Column(String, nullable=True)
    avg_spike_pct = Column(Float, nullable=True)
    consistency_score = Column(Float, nullable=True)
    avg_yoy_growth = Column(Float, nullable=True)
    growth_quarters = Column(Integer, nullable=True)
    sector_rank = Column(Integer, nullable=True)
    score = Column(Float, index=True)

    scan = relationship("PeadScan", back_populates="picks")
