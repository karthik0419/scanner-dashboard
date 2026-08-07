"""SQLAlchemy ORM models."""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Boolean, Text, ForeignKey, JSON, Enum as SAEnum
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
    plan = Column(String, default="free")  # free / pro
    telegram_chat_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    saved_screens = relationship("SavedScreen", back_populates="user", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="user", cascade="all, delete-orphan")


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
