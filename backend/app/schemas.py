"""Pydantic schemas for request/response validation."""
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, Field


# ── Auth ──────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    # Use str (not EmailStr) so guest login with plain "guest" works
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    plan: str
    telegram_chat_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Scan ──────────────────────────────────────────────────────────────
class ScanTrigger(BaseModel):
    top: int = Field(default=30, ge=1, le=200)
    min_score: float = Field(default=50, ge=0, le=100)
    sl_mode: str = Field(default="atr", pattern="^(atr|original)$")
    min_price: Optional[float] = Field(default=None, ge=0)
    max_price: Optional[float] = Field(default=None, ge=0)
    stocks_file: Optional[str] = None  # backbone50.txt / nifty200.txt / nifty500.txt
    bearish: bool = False
    timeframe: str = Field(default="all", pattern="^(all|daily|weekly|monthly)$")
    smart: bool = False
    test_mode: bool = False


class ScanOut(BaseModel):
    id: str
    status: str
    top: int
    min_score: float
    sl_mode: str
    min_price: Optional[float]
    max_price: Optional[float]
    bearish: bool
    timeframe: str
    smart: bool
    test_mode: bool
    total_picks: int
    error_message: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_seconds: Optional[float]

    class Config:
        from_attributes = True


# ── Pick ──────────────────────────────────────────────────────────────
class PickOut(BaseModel):
    id: str
    symbol: str
    pattern: str
    timeframe: str
    status: str
    cmp: float
    breakout: Optional[float]
    stop_loss: Optional[float]
    target_1: Optional[float]
    target_2: Optional[float]
    upside_pct: Optional[float]
    risk_pct: Optional[float]
    rr: Optional[float]
    volume: Optional[float]
    sector: Optional[str]
    sector_signal: Optional[str]
    score: Optional[float]
    atr: Optional[float]

    class Config:
        from_attributes = True


class PickFilter(BaseModel):
    pattern: Optional[str] = None
    timeframe: Optional[str] = None
    status: Optional[str] = None
    sector: Optional[str] = None
    min_score: Optional[float] = None
    min_rr: Optional[float] = None
    sort_by: str = Field(default="score", pattern="^(score|rr|upside_pct|symbol|risk_pct)$")
    sort_desc: bool = True
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


# ── Saved Screen ──────────────────────────────────────────────────────
class SavedScreenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    filters: PickFilter


class SavedScreenOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    filters: dict
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Alert ─────────────────────────────────────────────────────────────
class AlertCreate(BaseModel):
    symbol: str
    alert_type: str = Field(pattern="^(price_above|price_below|breakout|pattern)$")
    condition_value: Optional[float] = None
    channel: str = Field(default="telegram", pattern="^(telegram|email)$")


class AlertOut(BaseModel):
    id: str
    symbol: str
    alert_type: str
    condition_value: Optional[float]
    channel: str
    is_active: bool
    triggered: bool
    triggered_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Paper Trade ───────────────────────────────────────────────────────
class PaperTradeOut(BaseModel):
    id: str
    symbol: str
    pattern: Optional[str]
    status_at_scan: Optional[str]
    breakout_level: Optional[float]
    entry_price: Optional[float]
    stop_loss: Optional[float]
    target_1: Optional[float]
    target_2: Optional[float]
    scan_date: Optional[datetime]
    cmp_at_scan: Optional[float]
    risk_pct: Optional[float]
    upside_pct: Optional[float]
    rr: Optional[float]
    score: Optional[float]
    sector: Optional[str]
    current_price: Optional[float]
    current_status: str
    current_pnl_pct: Optional[float]
    days_held: int
    exit_price: Optional[float]
    exit_reason: Optional[str]
    tradeable: str

    class Config:
        from_attributes = True


# ── Market Data ───────────────────────────────────────────────────────
class SectorHeat(BaseModel):
    sector: str
    perf_5d: Optional[float]
    perf_20d: Optional[float]
    signal: str
    score_bonus: int


class MarketRegime(BaseModel):
    status: str  # RISK_ON / RISK_OFF
    close: Optional[float]
    dma200: Optional[float]
    pct_from_dma: Optional[float]


# ── Generic ───────────────────────────────────────────────────────────
class Message(BaseModel):
    message: str


class PaginatedResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: List[Any]


# ── PEAD Scanner ──────────────────────────────────────────────────────
class PeadScanTrigger(BaseModel):
    mode: str = Field(default="weekly", pattern="^(weekly|daily|discovery)$")
    top: int = Field(default=30, ge=1, le=200)
    min_score: float = Field(default=35, ge=0, le=100)
    sector: Optional[str] = None


class PeadScanOut(BaseModel):
    id: str
    status: str
    mode: str
    top: int
    min_score: float
    sector: Optional[str]
    total_picks: int
    error_message: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_seconds: Optional[float]

    class Config:
        from_attributes = True


class PeadPickOut(BaseModel):
    id: str
    symbol: str
    sector: Optional[str]
    status: str
    mode: Optional[str]
    days_since_result: Optional[int]
    days_to_result: Optional[int]
    last_quarter: Optional[str]
    result_date: Optional[str]
    cmp: float
    entry: Optional[float]
    stop: Optional[float]
    target: Optional[float]
    rr: Optional[float]
    last_net_profit: Optional[float]
    last_eps: Optional[float]
    proj_profit: Optional[float]
    proj_eps: Optional[float]
    proj_yoy_growth: Optional[float]
    proj_confidence: Optional[str]
    avg_spike_pct: Optional[float]
    consistency_score: Optional[float]
    avg_yoy_growth: Optional[float]
    growth_quarters: Optional[int]
    sector_rank: Optional[int]
    score: Optional[float]

    class Config:
        from_attributes = True
