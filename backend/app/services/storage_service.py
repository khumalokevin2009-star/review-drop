"""Storage service — screenshot/thumbnail persistence (CLAUDE.md Section 5).

Two backends behind one tiny interface:

* ``R2Storage`` — Cloudflare R2 via boto3 (S3-compatible). Used when the R2
  env vars are configured. boto3 is synchronous, so calls run in a thread.
* ``LocalStorage`` — a ./storage/ directory served by a static route mounted
  in main.py. Used automatically in local dev when R2 is not configured, so
  the whole screenshot feature works without an R2 account.

``get_storage()`` picks the backend once per process.
"""

from __future__ import annotations

import asyncio
import logging
import re
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

# Keys are generated internally (uuid-based), but validate anyway so a bug can
# never turn into a path traversal on the local backend.
_SAFE_KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9/_.-]*$")

LOCAL_STORAGE_DIR = Path("storage")


class StorageError(Exception):
    """Upload failed (callers treat screenshots as best-effort)."""


def _validate_key(key: str) -> None:
    if not _SAFE_KEY_RE.match(key) or ".." in key:
        raise StorageError(f"Unsafe storage key: {key!r}")


class StorageBackend(ABC):
    """Minimal storage interface: store bytes, get back a public URL."""

    @abstractmethod
    async def upload(self, key: str, data: bytes, content_type: str) -> str:
        """Store ``data`` under ``key`` and return its public URL."""


class R2Storage(StorageBackend):
    """Cloudflare R2 via boto3's S3 client (zero-egress reads, Section 5)."""

    def __init__(self) -> None:
        import boto3  # deferred: not needed at import time for local dev

        self._client = boto3.client(
            "s3",
            endpoint_url=(
                f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
            ),
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
        self._bucket = settings.R2_BUCKET_NAME
        self._public_url = (settings.R2_PUBLIC_URL or "").rstrip("/")

    async def upload(self, key: str, data: bytes, content_type: str) -> str:
        _validate_key(key)

        def _put() -> None:
            self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )

        try:
            # boto3 is sync — keep the event loop free.
            await asyncio.to_thread(_put)
        except Exception as exc:  # noqa: BLE001 — boto3 raises many types
            raise StorageError(f"R2 upload failed for {key}") from exc
        return f"{self._public_url}/{key}"


class LocalStorage(StorageBackend):
    """Dev fallback: write under ./storage/, served at /storage/ by main.py."""

    def __init__(self, root: Path = LOCAL_STORAGE_DIR) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    async def upload(self, key: str, data: bytes, content_type: str) -> str:
        _validate_key(key)
        path = (self.root / key).resolve()
        # Belt and braces: the resolved path must stay inside the root.
        if not path.is_relative_to(self.root.resolve()):
            raise StorageError(f"Unsafe storage key: {key!r}")
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            await asyncio.to_thread(path.write_bytes, data)
        except OSError as exc:
            raise StorageError(f"Local write failed for {key}") from exc
        return f"{settings.BACKEND_URL.rstrip('/')}/storage/{key}"


def r2_configured() -> bool:
    return bool(
        settings.R2_ACCOUNT_ID
        and settings.R2_ACCESS_KEY_ID
        and settings.R2_SECRET_ACCESS_KEY
        and settings.R2_PUBLIC_URL
    )


@lru_cache(maxsize=1)
def get_storage() -> StorageBackend:
    """Pick the backend once per process: R2 when fully configured, else local."""
    if r2_configured():
        logger.info("Storage backend: Cloudflare R2 (%s)", settings.R2_BUCKET_NAME)
        return R2Storage()
    logger.info("Storage backend: local ./storage (R2 not configured)")
    return LocalStorage()
