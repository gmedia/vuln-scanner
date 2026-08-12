from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.object_storage import (
    COS_KEY_PREFIX,
    LocalObjectStorage,
    ObjectStorageError,
    TencentCOSStorage,
    build_object_key,
    cos_ref_to_key,
    get_object_storage,
    is_cos_ref,
)


def test_is_cos_ref_and_key() -> None:
    assert is_cos_ref("cos://scans/a.apk")
    assert not is_cos_ref("/tmp/scans/a.apk")
    assert cos_ref_to_key("cos://scans/a.apk") == "scans/a.apk"
    with pytest.raises(ObjectStorageError):
        cos_ref_to_key("/tmp/x")


def test_build_object_key_prefix() -> None:
    with patch("app.services.object_storage.settings") as s:
        s.cos_prefix = "mobile"
        key = build_object_key("app.apk", job_token="abc")
        assert key == "mobile/abc_app.apk"


def test_local_put_materialize_delete(tmp_path: Path) -> None:
    src = tmp_path / "pkg.apk"
    src.write_bytes(b"PK\x03\x04data")
    store = LocalObjectStorage()
    ref = store.put_file(str(src), "ignored/key")
    assert ref == str(src)
    dest = tmp_path / "out.apk"
    store.materialize(ref, str(dest))
    assert dest.read_bytes() == src.read_bytes()
    assert store.exists(ref)
    store.delete(ref)
    assert not src.exists()


def test_get_object_storage_local_default() -> None:
    with patch("app.services.object_storage.settings") as s:
        s.object_storage_backend = "local"
        assert isinstance(get_object_storage(), LocalObjectStorage)


def test_get_object_storage_cos_requires_creds() -> None:
    with patch("app.services.object_storage.settings") as s:
        s.object_storage_backend = "cos"
        s.cos_secret_id = ""
        s.cos_secret_key = ""
        s.cos_region = "ap-singapore"
        s.cos_bucket = "sinexis-1"
        s.cos_app_id = "1"
        s.cos_endpoint = ""
        with pytest.raises(ObjectStorageError):
            get_object_storage()


def test_get_object_storage_unknown() -> None:
    with patch("app.services.object_storage.settings") as s:
        s.object_storage_backend = "s3"
        with pytest.raises(ObjectStorageError):
            get_object_storage()


def test_tencent_host_and_put(tmp_path: Path) -> None:
    store = TencentCOSStorage(
        secret_id="AKIDtest",
        secret_key="secretkey",
        region="ap-singapore",
        bucket="sinexis-123",
        endpoint="cos.ap-singapore.myqcloud.com",
    )
    assert store.host == "sinexis-123.cos.ap-singapore.myqcloud.com"

    src = tmp_path / "a.apk"
    src.write_bytes(b"hello-cos")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = ""

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.put.return_value = mock_resp

    with patch("app.services.object_storage.httpx.Client", return_value=mock_client):
        ref = store.put_file(str(src), "scans/tok_a.apk")

    assert ref == f"{COS_KEY_PREFIX}scans/tok_a.apk"
    mock_client.put.assert_called_once()
    args, kwargs = mock_client.put.call_args
    assert "sinexis-123.cos.ap-singapore.myqcloud.com" in args[0]
    assert kwargs["content"] == b"hello-cos"
    assert "Authorization" in kwargs["headers"]
    assert "q-sign-algorithm=sha1" in kwargs["headers"]["Authorization"]


def test_tencent_sign_includes_ak() -> None:
    store = TencentCOSStorage(
        secret_id="AKIDxyz",
        secret_key="sk",
        region="ap-singapore",
        bucket="b-1",
    )
    auth = store._sign("GET", "k", {"Host": store.host})
    assert "q-ak=AKIDxyz" in auth
    assert "q-signature=" in auth


def test_tencent_materialize_and_delete(tmp_path: Path) -> None:
    store = TencentCOSStorage(
        secret_id="AKIDtest",
        secret_key="secretkey",
        region="ap-singapore",
        bucket="sinexis-123",
    )
    dest = tmp_path / "dl.apk"

    class _StreamResp:
        status_code = 200

        def read(self, n: int = -1) -> bytes:
            return b""

        def iter_bytes(self):
            yield b"chunk1"
            yield b"chunk2"

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.stream.return_value = _StreamResp()
    del_resp = MagicMock(status_code=204)
    mock_client.delete.return_value = del_resp

    with patch("app.services.object_storage.httpx.Client", return_value=mock_client):
        store.materialize("cos://scans/x.apk", str(dest))
        store.delete("cos://scans/x.apk")

    assert dest.read_bytes() == b"chunk1chunk2"
    mock_client.delete.assert_called_once()
