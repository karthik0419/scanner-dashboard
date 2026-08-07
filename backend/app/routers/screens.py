"""Saved screens router — CRUD for user's saved screen presets."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc

from app.database import get_db
from app.models import SavedScreen, User
from app.deps import get_current_user
from app.schemas import SavedScreenCreate, SavedScreenOut
from app.models import Pick, Scan
from app.schemas import PickOut

router = APIRouter(prefix="/api/screens", tags=["saved-screens"])


@router.get("", response_model=list[SavedScreenOut])
def list_screens(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(SavedScreen).filter(SavedScreen.user_id == user.id).order_by(SavedScreen.created_at.desc()).all()


@router.post("", response_model=SavedScreenOut, status_code=201)
def create_screen(
    payload: SavedScreenCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    screen = SavedScreen(
        user_id=user.id,
        name=payload.name,
        description=payload.description,
        filters=payload.filters.model_dump(),
    )
    db.add(screen)
    db.commit()
    db.refresh(screen)
    return screen


@router.get("/{screen_id}", response_model=SavedScreenOut)
def get_screen(screen_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    screen = db.query(SavedScreen).filter(SavedScreen.id == screen_id, SavedScreen.user_id == user.id).first()
    if not screen:
        raise HTTPException(status_code=404, detail="Saved screen not found")
    return screen


@router.put("/{screen_id}", response_model=SavedScreenOut)
def update_screen(
    screen_id: str,
    payload: SavedScreenCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    screen = db.query(SavedScreen).filter(SavedScreen.id == screen_id, SavedScreen.user_id == user.id).first()
    if not screen:
        raise HTTPException(status_code=404, detail="Saved screen not found")
    screen.name = payload.name
    screen.description = payload.description
    screen.filters = payload.filters.model_dump()
    db.commit()
    db.refresh(screen)
    return screen


@router.delete("/{screen_id}", status_code=204)
def delete_screen(screen_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    screen = db.query(SavedScreen).filter(SavedScreen.id == screen_id, SavedScreen.user_id == user.id).first()
    if not screen:
        raise HTTPException(status_code=404, detail="Saved screen not found")
    db.delete(screen)
    db.commit()


@router.post("/{screen_id}/run")
def run_screen(
    screen_id: str,
    scan_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply a saved screen's filters to a specific scan's picks."""
    screen = db.query(SavedScreen).filter(SavedScreen.id == screen_id, SavedScreen.user_id == user.id).first()
    if not screen:
        raise HTTPException(status_code=404, detail="Saved screen not found")

    scan = db.query(Scan).filter(Scan.id == scan_id, Scan.user_id == user.id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    filters = screen.filters
    q = db.query(Pick).filter(Pick.scan_id == scan_id)

    if filters.get("pattern"):
        q = q.filter(Pick.pattern.ilike(f"%{filters['pattern']}%"))
    if filters.get("timeframe"):
        q = q.filter(Pick.timeframe == filters["timeframe"])
    if filters.get("status"):
        q = q.filter(Pick.status == filters["status"])
    if filters.get("sector"):
        q = q.filter(Pick.sector.ilike(f"%{filters['sector']}%"))
    if filters.get("min_score") is not None:
        q = q.filter(Pick.score >= filters["min_score"])
    if filters.get("min_rr") is not None:
        q = q.filter(Pick.rr >= filters["min_rr"])

    sort_by = filters.get("sort_by", "score")
    sort_col = getattr(Pick, sort_by, Pick.score)
    q = q.order_by(desc(sort_col) if filters.get("sort_desc", True) else asc(sort_col))
    limit = filters.get("limit", 50)
    offset = filters.get("offset", 0)
    picks = q.offset(offset).limit(limit).all()

    return {
        "total": q.count(),
        "items": [PickOut.model_validate(p) for p in picks],
    }
