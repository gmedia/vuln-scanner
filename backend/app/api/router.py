from fastapi import APIRouter

from app.api.scan_routes import router as scan_router
from app.api.websocket import router as ws_router
from app.api.key_routes import router as key_router

api_router = APIRouter()

api_router.include_router(scan_router)
api_router.include_router(ws_router)
api_router.include_router(key_router)
