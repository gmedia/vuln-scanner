from unittest.mock import AsyncMock, MagicMock, patch


class TestHealthQueuesEndpoint:
    def test_health_queues_ok(self, client):
        mock_redis = AsyncMock()
        mock_redis.llen = AsyncMock(
            side_effect=lambda q: {"ip_scan": 1, "domain_scan": 0, "mobile_scan": 2, "dead_letter": 3}[q]
        )
        mock_redis.get = AsyncMock(
            side_effect=lambda k: {
                "metrics:maintenance:auto_failed:pending": "4",
                "metrics:maintenance:auto_failed:running": "1",
            }.get(k)
        )

        with patch("redis.asyncio.from_url", return_value=mock_redis):
            resp = client.get("/health/queues")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["queues"] == {
            "ip_scan": 1,
            "domain_scan": 0,
            "mobile_scan": 2,
            "dead_letter": 3,
        }
        assert data["auto_failed"] == {"pending": 4, "running": 1}

    def test_health_queues_auto_failed_defaults_zero(self, client):
        mock_redis = AsyncMock()
        mock_redis.llen = AsyncMock(return_value=0)
        mock_redis.get = AsyncMock(return_value=None)

        with patch("redis.asyncio.from_url", return_value=mock_redis):
            resp = client.get("/health/queues")

        assert resp.status_code == 200
        assert resp.json()["auto_failed"] == {"pending": 0, "running": 0}

    def test_health_queues_redis_error(self, client):
        mock_redis = AsyncMock()
        mock_redis.llen = AsyncMock(side_effect=ConnectionError("mock Redis unavailable"))

        with patch("redis.asyncio.from_url", return_value=mock_redis):
            resp = client.get("/health/queues")

        assert resp.status_code == 503
        data = resp.json()
        assert data["status"] == "degraded"
        assert "error" in data


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
        mock_bad_db = MagicMock()
        mock_bad_db.connect.side_effect = Exception("mock DB unavailable")

        with patch("redis.asyncio.from_url", return_value=mock_redis), patch("app.database.engine", mock_bad_db):
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
