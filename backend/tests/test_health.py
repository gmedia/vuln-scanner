from unittest.mock import AsyncMock, MagicMock, patch


class TestHealthEndpoint:
    def test_health_database_connected(self, client):
        mock_conn = AsyncMock()
        connect_cm = AsyncMock()
        connect_cm.__aenter__.return_value = mock_conn
        mock_engine = MagicMock()
        mock_engine.connect.return_value = connect_cm
        mock_bad_redis = AsyncMock()
        mock_bad_redis.ping.side_effect = ConnectionError("mock Redis unavailable")

        with patch("app.database.engine", mock_engine), patch("redis.asyncio.from_url", return_value=mock_bad_redis):
            resp = client.get("/health")

        assert resp.status_code == 503
        data = resp.json()
        assert data["database"] == "connected"
        assert data["status"] == "degraded"
        assert "error" in data["redis"]

    def test_health_redis_connected(self, client):
        mock_redis = AsyncMock()

        with patch("redis.asyncio.from_url", return_value=mock_redis):
            resp = client.get("/health")

        assert resp.status_code == 503
        data = resp.json()
        assert data["redis"] == "connected"
        assert data["status"] == "degraded"
        assert "error" in data["database"]

    def test_health_all_ok(self, client):
        mock_conn = AsyncMock()
        connect_cm = AsyncMock()
        connect_cm.__aenter__.return_value = mock_conn
        mock_engine = MagicMock()
        mock_engine.connect.return_value = connect_cm
        mock_redis = AsyncMock()

        with patch("app.database.engine", mock_engine), patch("redis.asyncio.from_url", return_value=mock_redis):
            resp = client.get("/health")

        assert resp.status_code == 200
        data = resp.json()
        assert data["database"] == "connected"
        assert data["redis"] == "connected"
        assert data["status"] == "ok"
