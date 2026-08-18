"""Admin router — user management (admin role required)."""
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import User, Scan, Pick, PaperTrade, Category
from app.auth import hash_password
from app.deps import require_admin
from app.schemas import (
    AdminUserOut, AdminUserCreate, AdminUserUpdate, AdminPasswordReset,
    AdminStats, Message,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _user_with_stats(user: User, scan_counts: dict, trade_counts: dict) -> AdminUserOut:
    out = AdminUserOut.model_validate(user)
    out.scan_count = scan_counts.get(user.id, 0)
    out.trade_count = trade_counts.get(user.id, 0)
    return out


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    q: str | None = Query(None, description="Search email/name"),
    role: str | None = Query(None, pattern="^(user|admin)$"),
    active: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if q:
        like = f"%{q}%"
        query = query.filter((User.email.ilike(like)) | (User.name.ilike(like)))
    if role:
        query = query.filter(User.role == role)
    if active is not None:
        query = query.filter(User.is_active == active)
    users = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()

    # Aggregate activity stats in two grouped queries (no N+1)
    user_ids = [u.id for u in users]
    scan_counts = dict(
        db.query(Scan.user_id, func.count(Scan.id))
        .filter(Scan.user_id.in_(user_ids)).group_by(Scan.user_id).all()
    ) if user_ids else {}
    trade_counts = dict(
        db.query(PaperTrade.user_id, func.count(PaperTrade.id))
        .filter(PaperTrade.user_id.in_(user_ids)).group_by(PaperTrade.user_id).all()
    ) if user_ids else {}

    return [_user_with_stats(u, scan_counts, trade_counts) for u in users]


@router.post("/users", response_model=AdminUserOut, status_code=201)
def create_user(
    payload: AdminUserCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=payload.email,
        name=payload.name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        plan=payload.plan,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("admin %s created user %s (role=%s)", admin.email, user.email, user.role)
    return _user_with_stats(user, {}, {})


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: str,
    payload: AdminUserUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent locking yourself out: can't demote/deactivate the last active admin
    demoting = (payload.role == "user" and user.role == "admin")
    deactivating = (payload.is_active is False and user.is_active)
    if (demoting or deactivating) and user.role == "admin":
        active_admins = db.query(User).filter(
            User.role == "admin", User.is_active == True  # noqa: E712
        ).count()
        if active_admins <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote/deactivate the last active admin")

    if payload.name is not None:
        user.name = payload.name
    if payload.role is not None:
        user.role = payload.role
    if payload.plan is not None:
        user.plan = payload.plan
    if payload.is_active is not None:
        user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    logger.info("admin %s updated user %s", admin.email, user.email)
    return _user_with_stats(user, {}, {})


@router.post("/users/{user_id}/reset-password", response_model=Message)
def reset_password(
    user_id: str,
    payload: AdminPasswordReset,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    logger.info("admin %s reset password for user %s", admin.email, user.email)
    return Message(message=f"Password reset for {user.email}")


@router.delete("/users/{user_id}", response_model=Message)
def delete_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    if user.role == "admin":
        active_admins = db.query(User).filter(
            User.role == "admin", User.is_active == True  # noqa: E712
        ).count()
        if active_admins <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last active admin")

    email = user.email
    # Clean up dependent rows without user relationships configured for cascade
    db.query(PaperTrade).filter(PaperTrade.user_id == user.id).delete()
    scan_ids = [s.id for s in db.query(Scan.id).filter(Scan.user_id == user.id).all()]
    if scan_ids:
        db.query(Pick).filter(Pick.scan_id.in_(scan_ids)).delete(synchronize_session=False)
        db.query(Scan).filter(Scan.user_id == user.id).delete(synchronize_session=False)
    db.delete(user)  # cascades saved_screens, alerts, categories via ORM relationships
    db.commit()
    logger.info("admin %s deleted user %s", admin.email, email)
    return Message(message=f"User {email} deleted")


@router.get("/stats", response_model=AdminStats)
def system_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    week_ago = datetime.utcnow() - timedelta(days=7)
    return AdminStats(
        total_users=db.query(func.count(User.id)).scalar() or 0,
        active_users=db.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0,  # noqa: E712
        admin_users=db.query(func.count(User.id)).filter(User.role == "admin").scalar() or 0,
        total_scans=db.query(func.count(Scan.id)).scalar() or 0,
        scans_last_7d=db.query(func.count(Scan.id)).filter(Scan.created_at >= week_ago).scalar() or 0,
        total_picks=db.query(func.count(Pick.id)).scalar() or 0,
        total_trades=db.query(func.count(PaperTrade.id)).scalar() or 0,
        total_categories=db.query(func.count(Category.id)).scalar() or 0,
    )
