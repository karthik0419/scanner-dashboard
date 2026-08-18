"""Categories router — user-defined categories for tagging stocks.

One category system shared across scan picks, tracker trades, and watchlists.
Items are keyed by symbol (the universal identifier across all views).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import User, Category, CategoryItem
from app.deps import get_current_user
from app.schemas import (
    CategoryCreate, CategoryUpdate, CategoryOut, CategoryItemAdd,
    CategoryItemOut, Message,
)

router = APIRouter(prefix="/api/categories", tags=["categories"])


def _own_category(category_id: str, user: User, db: Session) -> Category:
    cat = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == user.id)
        .first()
    )
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return cat


def _norm_symbol(symbol: str) -> str:
    """Normalize symbol — uppercase, strip .NS suffix for consistency."""
    return symbol.upper().replace(".NS", "").strip()


@router.get("", response_model=list[CategoryOut])
def list_categories(
    include_hidden: bool = Query(True, description="Include hidden categories"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = (
        db.query(Category)
        .options(joinedload(Category.items))
        .filter(Category.user_id == user.id)
    )
    if not include_hidden:
        q = q.filter(Category.is_hidden == False)  # noqa: E712
    return q.order_by(Category.created_at.asc()).all()


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(Category)
        .filter(Category.user_id == user.id, Category.name == payload.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Category with this name already exists")
    cat = Category(user_id=user.id, name=payload.name, color=payload.color)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: str,
    payload: CategoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = _own_category(category_id, user, db)
    if payload.name is not None and payload.name != cat.name:
        dup = (
            db.query(Category)
            .filter(Category.user_id == user.id, Category.name == payload.name)
            .first()
        )
        if dup:
            raise HTTPException(status_code=400, detail="Category with this name already exists")
        cat.name = payload.name
    if payload.color is not None:
        cat.color = payload.color
    if payload.is_hidden is not None:
        cat.is_hidden = payload.is_hidden
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{category_id}", response_model=Message)
def delete_category(
    category_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = _own_category(category_id, user, db)
    name = cat.name
    db.delete(cat)
    db.commit()
    return Message(message=f"Category '{name}' deleted")


@router.post("/{category_id}/items", response_model=CategoryItemOut, status_code=201)
def add_item(
    category_id: str,
    payload: CategoryItemAdd,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = _own_category(category_id, user, db)
    symbol = _norm_symbol(payload.symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Invalid symbol")
    existing = (
        db.query(CategoryItem)
        .filter(CategoryItem.category_id == cat.id, CategoryItem.symbol == symbol)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"{symbol} already in '{cat.name}'")
    item = CategoryItem(category_id=cat.id, symbol=symbol, note=payload.note)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{category_id}/items/{symbol}", response_model=Message)
def remove_item(
    category_id: str,
    symbol: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = _own_category(category_id, user, db)
    norm = _norm_symbol(symbol)
    item = (
        db.query(CategoryItem)
        .filter(CategoryItem.category_id == cat.id, CategoryItem.symbol == norm)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail=f"{norm} not in '{cat.name}'")
    db.delete(item)
    db.commit()
    return Message(message=f"{norm} removed from '{cat.name}'")


@router.get("/symbol/{symbol}", response_model=list[CategoryOut])
def categories_for_symbol(
    symbol: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the categories that contain a given symbol (for tag chips)."""
    norm = _norm_symbol(symbol)
    return (
        db.query(Category)
        .options(joinedload(Category.items))
        .join(CategoryItem, CategoryItem.category_id == Category.id)
        .filter(Category.user_id == user.id, CategoryItem.symbol == norm)
        .all()
    )
