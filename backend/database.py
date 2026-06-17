"""Database setup — SQLAlchemy + SQLite (dev) or PostgreSQL (prod via DATABASE_URL)."""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

_raw = os.environ.get("DATABASE_URL", "")

if _raw.startswith("postgres://"):
    # Supabase / Heroku use postgres:// but SQLAlchemy needs postgresql://
    _raw = _raw.replace("postgres://", "postgresql://", 1)

if not _raw:
    # Local dev / HF Spaces fallback: SQLite file in data/
    _data_dir = Path(__file__).parent / "data"
    _data_dir.mkdir(exist_ok=True)
    _raw = f"sqlite:///{_data_dir / 'app.db'}"

_is_sqlite = _raw.startswith("sqlite")

engine = create_engine(
    _raw,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
