from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db


class TestGetDb:
    @pytest.mark.asyncio
    async def test_get_db_yields_async_session(self):
        mock_session = AsyncMock(spec=AsyncSession)
        mock_session.__aenter__.return_value = mock_session
        mock_async_session = MagicMock(return_value=mock_session)

        with patch("app.database.async_session", mock_async_session):
            gen = get_db()
            session = await anext(gen)

            assert isinstance(session, AsyncSession)
            mock_async_session.assert_called_once()

        await gen.aclose()

    @pytest.mark.asyncio
    async def test_get_db_closes_session_after_yield(self):
        mock_session = AsyncMock(spec=AsyncSession)
        mock_session.__aenter__.return_value = mock_session
        mock_async_session = MagicMock(return_value=mock_session)

        with patch("app.database.async_session", mock_async_session):
            gen = get_db()
            await anext(gen)

            with pytest.raises(StopAsyncIteration):
                await anext(gen)

            mock_session.close.assert_awaited_once()
