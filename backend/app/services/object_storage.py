from __future__ import annotations

import hashlib
import hmac
import logging
import os
import shutil
import uuid
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

COS_KEY_PREFIX = "cos://"


class ObjectStorageError(Exception):
    pass


class ObjectStorage(ABC):
    @abstractmethod
    def put_file(self, local_path: str, key: str, content_type: str = "application/octet-stream") -> str:
        raise NotImplementedError

    @abstractmethod
    def materialize(self, ref: str, dest_path: str) -> str:
        raise NotImplementedError

    @abstractmethod
    def delete(self, ref: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def exists(self, ref: str) -> bool:
        raise NotImplementedError


def build_object_key(safe_filename: str, job_token: str | None = None) -> str:
    prefix = (settings.cos_prefix or "scans/").strip().lstrip("/")
    if prefix and not prefix.endswith("/"):
        prefix = f"{prefix}/"
    token = job_token or uuid.uuid4().hex
    base = os.path.basename(safe_filename) or "package.bin"
    return f"{prefix}{token}_{base}"


def is_cos_ref(ref: str) -> bool:
    return ref.startswith(COS_KEY_PREFIX)


def cos_ref_to_key(ref: str) -> str:
    if not is_cos_ref(ref):
        raise ObjectStorageError(f"Not a COS ref: {ref[:32]}")
    return ref[len(COS_KEY_PREFIX) :]


class _SuppressOSError:
    def __enter__(self) -> None:
        return None

    def __exit__(self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: object) -> bool:
        return exc_type is not None and issubclass(exc_type, OSError)


class LocalObjectStorage(ObjectStorage):
    def put_file(self, local_path: str, key: str, content_type: str = "application/octet-stream") -> str:
        del key, content_type
        return local_path

    def materialize(self, ref: str, dest_path: str) -> str:
        if os.path.abspath(ref) == os.path.abspath(dest_path):
            return ref
        if not os.path.exists(ref):
            raise ObjectStorageError(f"Local file not found: {ref}")
        os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
        shutil.copy2(ref, dest_path)
        return dest_path

    def delete(self, ref: str) -> None:
        if is_cos_ref(ref):
            return
        with _SuppressOSError():
            if os.path.isfile(ref):
                os.remove(ref)

    def exists(self, ref: str) -> bool:
        if is_cos_ref(ref):
            return False
        return os.path.isfile(ref)


class TencentCOSStorage(ObjectStorage):
    def __init__(
        self,
        secret_id: str,
        secret_key: str,
        region: str,
        bucket: str,
        app_id: str = "",
        endpoint: str = "",
        timeout: float = 120.0,
    ) -> None:
        if not secret_id or not secret_key:
            raise ObjectStorageError("COS_SECRET_ID and COS_SECRET_KEY are required")
        if not region or not bucket:
            raise ObjectStorageError("COS_REGION and COS_BUCKET are required")
        self.secret_id = secret_id
        self.secret_key = secret_key
        self.region = region
        self.bucket = bucket
        self.app_id = app_id
        host = (endpoint or f"cos.{region}.myqcloud.com").removeprefix("https://").removeprefix("http://")
        host = host.rstrip("/")
        if host.startswith(f"{bucket}."):
            self.host = host
        else:
            self.host = f"{bucket}.{host}"
        self.timeout = timeout

    def _object_url(self, key: str) -> str:
        key = key.lstrip("/")
        quoted = quote(key, safe="/")
        return f"https://{self.host}/{quoted}"

    def _sign(
        self,
        method: str,
        key: str,
        headers: dict[str, str],
        params: dict[str, str] | None = None,
    ) -> str:
        # Tencent COS XML API v5 HMAC-SHA1 request signature
        # https://cloud.tencent.com/document/product/436/7778
        key = key.lstrip("/")
        params = params or {}
        now = int(datetime.now(UTC).timestamp())
        key_time = f"{now};{now + 3600}"

        sign_key = hmac.new(
            self.secret_key.encode("utf-8"),
            key_time.encode("utf-8"),
            hashlib.sha1,
        ).hexdigest()

        http_method = method.lower()
        uri_path = "/" + key
        param_list: list[str] = []
        param_pairs: list[str] = []
        for pk in sorted(params.keys()):
            lk = pk.lower()
            param_list.append(lk)
            param_pairs.append(f"{quote(lk, safe='')}={quote(str(params[pk]), safe='')}")
        format_query = "&".join(param_pairs)

        sign_header_names = sorted({h.lower() for h in headers if h.lower() in ("host", "content-type", "content-md5")})
        header_list: list[str] = []
        header_pairs: list[str] = []
        for hk in sign_header_names:
            val = next(v for k, v in headers.items() if k.lower() == hk)
            header_list.append(hk)
            header_pairs.append(f"{quote(hk, safe='')}={quote(val, safe='')}")
        format_headers = "&".join(header_pairs)

        format_string = f"{http_method}\n{uri_path}\n{format_query}\n{format_headers}\n"
        string_to_sign = f"sha1\n{key_time}\n{hashlib.sha1(format_string.encode('utf-8')).hexdigest()}\n"
        signature = hmac.new(sign_key.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha1).hexdigest()

        return (
            f"q-sign-algorithm=sha1"
            f"&q-ak={self.secret_id}"
            f"&q-sign-time={key_time}"
            f"&q-key-time={key_time}"
            f"&q-header-list={';'.join(header_list)}"
            f"&q-url-param-list={';'.join(param_list)}"
            f"&q-signature={signature}"
        )

    def put_file(self, local_path: str, key: str, content_type: str = "application/octet-stream") -> str:
        key = key.lstrip("/")
        path = Path(local_path)
        if not path.is_file():
            raise ObjectStorageError(f"Cannot upload missing file: {local_path}")
        data = path.read_bytes()
        headers = {
            "Host": self.host,
            "Content-Type": content_type,
            "Content-Length": str(len(data)),
        }
        headers["Authorization"] = self._sign("PUT", key, headers)
        url = self._object_url(key)
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.put(url, content=data, headers=headers)
        except httpx.HTTPError as e:
            raise ObjectStorageError(f"COS put network error: {e}") from e
        if resp.status_code not in (200, 201):
            raise ObjectStorageError(f"COS put failed HTTP {resp.status_code}: {resp.text[:200]}")
        logger.info("COS put ok key=%s bytes=%s", key, len(data))
        return f"{COS_KEY_PREFIX}{key}"

    def materialize(self, ref: str, dest_path: str) -> str:
        key = cos_ref_to_key(ref) if is_cos_ref(ref) else ref.lstrip("/")
        headers = {"Host": self.host}
        headers["Authorization"] = self._sign("GET", key, headers)
        url = self._object_url(key)
        os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
        try:
            with (
                httpx.Client(timeout=self.timeout) as client,
                client.stream("GET", url, headers=headers) as resp,
            ):
                if resp.status_code != 200:
                    body = resp.read()[:200]
                    raise ObjectStorageError(f"COS get failed HTTP {resp.status_code}: {body!r}")
                with open(dest_path, "wb") as out:
                    for chunk in resp.iter_bytes():
                        out.write(chunk)
        except httpx.HTTPError as e:
            raise ObjectStorageError(f"COS get network error: {e}") from e
        return dest_path

    def delete(self, ref: str) -> None:
        try:
            key = cos_ref_to_key(ref) if is_cos_ref(ref) else ref.lstrip("/")
        except ObjectStorageError:
            return
        headers = {"Host": self.host}
        headers["Authorization"] = self._sign("DELETE", key, headers)
        url = self._object_url(key)
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.delete(url, headers=headers)
            if resp.status_code not in (200, 204, 404):
                logger.warning("COS delete HTTP %s for key=%s", resp.status_code, key)
        except httpx.HTTPError as e:
            logger.warning("COS delete network error key=%s: %s", key, e)

    def exists(self, ref: str) -> bool:
        try:
            key = cos_ref_to_key(ref) if is_cos_ref(ref) else ref.lstrip("/")
        except ObjectStorageError:
            return False
        headers = {"Host": self.host}
        headers["Authorization"] = self._sign("HEAD", key, headers)
        url = self._object_url(key)
        try:
            with httpx.Client(timeout=min(30.0, self.timeout)) as client:
                resp = client.head(url, headers=headers)
            return resp.status_code == 200
        except httpx.HTTPError:
            return False


def get_object_storage() -> ObjectStorage:
    backend = (settings.object_storage_backend or "local").strip().lower()
    if backend in ("", "local", "disk", "filesystem"):
        return LocalObjectStorage()
    if backend in ("cos", "tencent", "tencent_cos"):
        return TencentCOSStorage(
            secret_id=settings.cos_secret_id,
            secret_key=settings.cos_secret_key,
            region=settings.cos_region,
            bucket=settings.cos_bucket,
            app_id=settings.cos_app_id,
            endpoint=settings.cos_endpoint,
        )
    raise ObjectStorageError(f"Unknown OBJECT_STORAGE_BACKEND={backend!r} (use local|cos)")
