from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

INSTALL_FILENAME = "sinexis-install.sh"
INSTALL_PATH = Path(__file__).resolve().parent.parent.parent / "static" / INSTALL_FILENAME

router = APIRouter(tags=["install"])


def _installer_path() -> Path:
    if INSTALL_PATH.is_file():
        return INSTALL_PATH
    raise HTTPException(status_code=503, detail="Installer payload missing")


@router.get("/install/sinexis-install.sh")
async def download_sinexis_install() -> FileResponse:
    path = _installer_path()
    return FileResponse(
        path,
        media_type="text/x-shellscript",
        filename=INSTALL_FILENAME,
        headers={
            "Cache-Control": "public, max-age=300",
            "X-Content-Type-Options": "nosniff",
            "X-Robots-Tag": "noindex",
        },
    )
