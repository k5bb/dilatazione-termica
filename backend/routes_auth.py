"""Auth, invitation and user-bottle routes."""
from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from auth import (
    create_token,
    get_current_user,
    hash_password,
    require_admin,
    verify_password,
)
from database import get_db
from db_models import Invitation, User, UserBottle

router = APIRouter()

# ── Pydantic schemas ──────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    invite_code: str
    username:    str
    email:       str
    password:    str

class LoginRequest(BaseModel):
    username: str          # username OR email
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    is_admin:     bool
    username:     str

class MeResponse(BaseModel):
    id:         int
    username:   str
    email:      str
    is_admin:   bool
    created_at: datetime

class CreateInviteRequest(BaseModel):
    note:     str | None = None
    days:     int        = 7

class InviteResponse(BaseModel):
    code:       str
    note:       str | None
    expires_at: datetime
    is_used:    bool
    used_by:    str | None

class BottleIn(BaseModel):
    name:             str
    volume_mL:        float | None = None
    h_fill_mm:        float | None = None
    bore_diameter_mm: float | None = None
    neck_points:      list[dict]   | None = None  # [{h_mm, d_int_mm}, ...]
    source:           str          = "manual"

class BottleOut(BottleIn):
    id:         int
    created_at: datetime

# ── Helpers ───────────────────────────────────────────────────────────────────

def _bottle_out(b: UserBottle) -> dict:
    return {
        "id":               b.id,
        "name":             b.name,
        "volume_mL":        b.volume_mL,
        "h_fill_mm":        b.h_fill_mm,
        "bore_diameter_mm": b.bore_diameter_mm,
        "neck_points":      json.loads(b.neck_points_json) if b.neck_points_json else None,
        "source":           b.source,
        "created_at":       b.created_at,
    }

# ── Auth routes ───────────────────────────────────────────────────────────────

@router.post("/auth/register", response_model=TokenResponse, tags=["auth"])
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    inv = db.query(Invitation).filter_by(code=req.invite_code, is_used=False).first()
    if not inv:
        raise HTTPException(status_code=400, detail="Codice invito non valido o già usato.")
    if inv.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="Codice invito scaduto.")

    if db.query(User).filter_by(username=req.username).first():
        raise HTTPException(status_code=400, detail="Username già in uso.")
    if db.query(User).filter_by(email=req.email).first():
        raise HTTPException(status_code=400, detail="Email già registrata.")

    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        is_admin=False,
    )
    db.add(user)
    db.flush()

    inv.is_used    = True
    inv.used_by_id = user.id
    db.commit()
    db.refresh(user)

    return TokenResponse(
        access_token=create_token(user.id),
        is_admin=user.is_admin,
        username=user.username,
    )


@router.post("/auth/login", response_model=TokenResponse, tags=["auth"])
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(User).filter_by(username=req.username).first()
        or db.query(User).filter_by(email=req.username).first()
    )
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenziali non valide.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disattivato.")

    return TokenResponse(
        access_token=create_token(user.id),
        is_admin=user.is_admin,
        username=user.username,
    )


@router.get("/auth/me", response_model=MeResponse, tags=["auth"])
def me(current: User = Depends(get_current_user)):
    return MeResponse(
        id=current.id,
        username=current.username,
        email=current.email,
        is_admin=current.is_admin,
        created_at=current.created_at,
    )

# ── Admin: invitations ────────────────────────────────────────────────────────

@router.post("/admin/invitations", response_model=InviteResponse, tags=["admin"])
def create_invitation(
    req: CreateInviteRequest,
    db:  Session = Depends(get_db),
    _:   User    = Depends(require_admin),
    me:  User    = Depends(get_current_user),
):
    code = secrets.token_urlsafe(16)
    inv  = Invitation(
        code=code,
        note=req.note,
        created_by_id=me.id,
        expires_at=datetime.utcnow() + timedelta(days=req.days),
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return InviteResponse(code=inv.code, note=inv.note, expires_at=inv.expires_at,
                          is_used=inv.is_used, used_by=None)


@router.get("/admin/invitations", response_model=list[InviteResponse], tags=["admin"])
def list_invitations(
    db: Session = Depends(get_db),
    _:  User    = Depends(require_admin),
):
    invs = db.query(Invitation).order_by(Invitation.created_at.desc()).all()
    return [
        InviteResponse(
            code=i.code,
            note=i.note,
            expires_at=i.expires_at,
            is_used=i.is_used,
            used_by=i.used_by.username if i.used_by else None,
        )
        for i in invs
    ]


@router.delete("/admin/users/{user_id}", tags=["admin"])
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Utente non trovato.")
    if user.id == admin.id:
        raise HTTPException(400, "Non puoi disattivare te stesso.")
    user.is_active = False
    db.commit()
    return {"ok": True}


@router.get("/admin/users", tags=["admin"])
def list_users(
    db: Session = Depends(get_db),
    _:  User    = Depends(require_admin),
):
    users = db.query(User).order_by(User.created_at).all()
    return [
        {"id": u.id, "username": u.username, "email": u.email,
         "is_admin": u.is_admin, "is_active": u.is_active,
         "created_at": u.created_at}
        for u in users
    ]

# ── User bottles ──────────────────────────────────────────────────────────────

@router.get("/user/bottles", tags=["user"])
def get_my_bottles(
    current: User    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    return [_bottle_out(b) for b in current.bottles]


@router.post("/user/bottles", tags=["user"])
def add_bottle(
    req:     BottleIn,
    current: User    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    b = UserBottle(
        user_id=current.id,
        name=req.name,
        volume_mL=req.volume_mL,
        h_fill_mm=req.h_fill_mm,
        bore_diameter_mm=req.bore_diameter_mm,
        neck_points_json=json.dumps(req.neck_points) if req.neck_points else None,
        source=req.source,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return _bottle_out(b)


@router.delete("/user/bottles/{bottle_id}", tags=["user"])
def delete_bottle(
    bottle_id: int,
    current:   User    = Depends(get_current_user),
    db:        Session = Depends(get_db),
):
    b = db.get(UserBottle, bottle_id)
    if not b or b.user_id != current.id:
        raise HTTPException(404, "Bottiglia non trovata.")
    db.delete(b)
    db.commit()
    return {"ok": True}
