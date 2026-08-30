from fastapi import APIRouter

from app.api.admin_blog_routes import router as admin_blog_router
from app.api.admin_routes import router as admin_router
from app.api.asset_routes import router as asset_router
from app.api.auth_routes import router as auth_router
from app.api.blog_routes import router as blog_router
from app.api.credit_routes import router as credit_router
from app.api.guard_routes import router as guard_router
from app.api.host_routes import router as host_router
from app.api.host_waf_routes import router as host_waf_router
from app.api.key_routes import router as key_router
from app.api.org_routes import router as org_router
from app.api.scan_routes import router as scan_router
from app.api.schedule_routes import router as schedule_router
from app.api.siem_routes import router as siem_router
from app.api.status_page_routes import router as status_page_router
from app.api.uptime_routes import router as uptime_router
from app.api.websocket import router as ws_router

api_router = APIRouter()

api_router.include_router(scan_router)
api_router.include_router(schedule_router)
api_router.include_router(ws_router)
api_router.include_router(key_router)
api_router.include_router(auth_router)
api_router.include_router(credit_router)
api_router.include_router(admin_router)
api_router.include_router(admin_blog_router)
api_router.include_router(blog_router)
api_router.include_router(org_router)
api_router.include_router(guard_router)
api_router.include_router(siem_router)
api_router.include_router(host_router)
api_router.include_router(host_waf_router)
api_router.include_router(asset_router)
api_router.include_router(uptime_router)
api_router.include_router(status_page_router)
