"""Apply ADMIN_* / E2E_* from process env into the users table.

Run inside the backend container after migrations:
  python -m scripts.upsert_secret_users
"""

from __future__ import annotations

import asyncio
import logging

from app.config import settings
from app.database import async_session
from app.services.bootstrap_users import upsert_from_settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


async def main() -> None:
    async with async_session() as session:
        actions = await upsert_from_settings(session, settings)
    print("upsert_secret_users", " ".join(actions) if actions else "noop")


if __name__ == "__main__":
    asyncio.run(main())
