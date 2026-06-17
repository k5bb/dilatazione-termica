"""SQLAlchemy ORM models."""
from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    username        = Column(String(64),  unique=True, index=True, nullable=False)
    email           = Column(String(256), unique=True, index=True, nullable=False)
    hashed_password = Column(String(256), nullable=False)
    is_admin        = Column(Boolean, default=False)
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    invitations_created = relationship("Invitation", foreign_keys="Invitation.created_by_id", back_populates="creator")
    bottles             = relationship("UserBottle", back_populates="owner", cascade="all, delete-orphan")


class Invitation(Base):
    __tablename__ = "invitations"

    id             = Column(Integer, primary_key=True, index=True)
    code           = Column(String(64), unique=True, index=True, nullable=False)
    note           = Column(String(256), nullable=True)       # e.g. "Per Mario Rossi"
    created_by_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    used_by_id     = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    expires_at     = Column(DateTime, nullable=False)
    is_used        = Column(Boolean, default=False)

    creator  = relationship("User", foreign_keys=[created_by_id], back_populates="invitations_created")
    used_by  = relationship("User", foreign_keys=[used_by_id])


class UserBottle(Base):
    __tablename__ = "user_bottles"

    id                = Column(Integer, primary_key=True, index=True)
    user_id           = Column(Integer, ForeignKey("users.id"), nullable=False)
    name              = Column(String(256), nullable=False)
    volume_mL         = Column(Float, nullable=True)
    h_fill_mm         = Column(Float, nullable=True)
    bore_diameter_mm  = Column(Float, nullable=True)
    neck_points_json  = Column(Text,  nullable=True)   # JSON: [{h_mm, d_int_mm}, ...]
    source            = Column(String(32), default="manual")  # manual | pdf
    created_at        = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="bottles")

    def neck_points(self) -> list[dict] | None:
        if self.neck_points_json:
            return json.loads(self.neck_points_json)
        return None
