"""Tests for workers.tasks.dead_letter — Dead letter task handler."""

import sys

sys.path.insert(0, "/home/ubuntu/vuln-scanner/workers")

import json
from unittest.mock import MagicMock, patch

import pytest

TASK_NAME = "test_task"
ARGS = ["arg1"]
KWARGS = {"key": "val"}
EXCEPTION_INFO = "Some error"


class TestDeadLetterSuccess:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with patch("tasks.dead_letter.redis.Redis") as mock_redis_from_url:
            mock_redis_instance = MagicMock()
            mock_redis_from_url.return_value = mock_redis_instance
            self.mock_redis_from_url = mock_redis_from_url
            self.mock_r = mock_redis_instance
            yield

    @pytest.fixture(autouse=True)
    def _setup_zcard(self):
        self.mock_r.zcard.return_value = 0
        yield

    def _call_handler(self):
        from tasks.dead_letter import dead_letter_handler

        return dead_letter_handler(TASK_NAME, ARGS, KWARGS, EXCEPTION_INFO)

    def test_stores_entry_in_redis(self):
        self._call_handler()
        self.mock_r.zadd.assert_called_once()
        key, mapping = self.mock_r.zadd.call_args[0]
        assert key == "dead_letter:log"
        entry = json.loads(list(mapping.keys())[0])
        assert entry["task_name"] == TASK_NAME

    def test_entry_has_correct_structure(self):
        self._call_handler()
        mapping = self.mock_r.zadd.call_args[0][1]
        entry = json.loads(list(mapping.keys())[0])
        assert entry["task_name"] == TASK_NAME
        assert entry["args"] == ARGS
        assert entry["kwargs"] == KWARGS
        assert entry["exception_info"] == EXCEPTION_INFO
        assert isinstance(entry["timestamp"], float)

    def test_logs_error_on_success(self):
        with patch("tasks.dead_letter.logger") as mock_logger:
            self._call_handler()
            mock_logger.error.assert_called_once()

    def test_logs_info_after_redis_store(self):
        with patch("tasks.dead_letter.logger") as mock_logger:
            self._call_handler()
            mock_logger.info.assert_called_once()
            assert TASK_NAME in str(mock_logger.info.call_args)


class TestDeadLetterTrim:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with patch("tasks.dead_letter.redis.Redis") as mock_redis_from_url:
            mock_redis_instance = MagicMock()
            mock_redis_from_url.return_value = mock_redis_instance
            self.mock_redis_from_url = mock_redis_from_url
            self.mock_r = mock_redis_instance
            yield

    def _call_handler(self):
        from tasks.dead_letter import dead_letter_handler

        return dead_letter_handler(TASK_NAME, ARGS, KWARGS, EXCEPTION_INFO)

    def test_trims_when_exceeds_max(self):
        self.mock_r.zcard.return_value = 1001
        self._call_handler()
        self.mock_r.zremrangebyrank.assert_called_once()

    def test_no_trim_when_within_limit(self):
        self.mock_r.zcard.return_value = 500
        self._call_handler()
        self.mock_r.zremrangebyrank.assert_not_called()

    def test_no_trim_at_exact_max(self):
        self.mock_r.zcard.return_value = 1000
        self._call_handler()
        self.mock_r.zremrangebyrank.assert_not_called()


class TestDeadLetterRedisFailure:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with patch("tasks.dead_letter.redis.Redis") as mock_redis_from_url:
            mock_redis_instance = MagicMock()
            mock_redis_from_url.return_value = mock_redis_instance
            self.mock_redis_from_url = mock_redis_from_url
            self.mock_r = mock_redis_instance
            yield

    def _call_handler(self):
        from tasks.dead_letter import dead_letter_handler

        return dead_letter_handler(TASK_NAME, ARGS, KWARGS, EXCEPTION_INFO)

    def test_redis_connection_error(self):
        self.mock_redis_from_url.side_effect = ConnectionError("Redis connection refused")
        self._call_handler()

    def test_redis_zadd_error(self):
        self.mock_r.zadd.side_effect = Exception("ZADD failed")
        with patch("tasks.dead_letter.logger") as mock_logger:
            self._call_handler()
            assert "Failed to persist" in str(mock_logger.error.call_args)

    def test_redis_zcard_error(self):
        self.mock_r.zcard.side_effect = Exception("ZCARD failed")
        with patch("tasks.dead_letter.logger") as mock_logger:
            self._call_handler()
            assert "Failed to persist" in str(mock_logger.error.call_args)


class TestDeadLetterHandlerTask:
    def test_is_shared_task(self):
        from tasks.dead_letter import dead_letter_handler

        assert hasattr(dead_letter_handler, "name")
        assert hasattr(dead_letter_handler, "max_retries")

    def test_has_correct_name(self):
        from tasks.dead_letter import dead_letter_handler

        assert dead_letter_handler.name == "dead_letter.handle"

    def test_has_acks_late_true(self):
        from tasks.dead_letter import dead_letter_handler

        assert dead_letter_handler.acks_late is True

    def test_has_max_retries_1(self):
        from tasks.dead_letter import dead_letter_handler

        assert dead_letter_handler.max_retries == 1
