import os

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

DATABASE_URL_SYNC = os.getenv(
    "DATABASE_URL_SYNC",
    "postgresql://vuln_scanner:change_me_in_production@postgres:5432/vuln_scanner",
)

engine = create_engine(
    DATABASE_URL_SYNC,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
)
SyncSession = sessionmaker(bind=engine)


def get_sync_session() -> Session:
    return SyncSession()
