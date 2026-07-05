from fastapi import APIRouter

from app.api.router import api_router


class TestApiRouter:
    def test_is_apirouter_instance(self):
        assert isinstance(api_router, APIRouter)

    def test_routes_not_empty(self):
        assert len(api_router.routes) > 0

    def test_includes_expected_routers(self):
        expected_prefixes = {
            "/api/scan",
            "/ws/scan",
            "/api/keys",
            "/api/auth",
            "/api/credits",
            "/api/admin",
        }

        found = set()
        for included in api_router.routes:
            orig = included.original_router
            prefix = getattr(orig, "prefix", "")
            # Derive the full prefix: api_router prefix + sub-router prefix
            full_prefix = f"/api{prefix}" if prefix else ""
            if not full_prefix and orig.routes:
                first_path = orig.routes[0].path
                # e.g., /scan/ip → /api/scan, /ws/scan/{job_id} → /ws/scan
                if first_path.startswith("/ws/"):
                    full_prefix = "/" + "/".join(first_path.split("/")[1:3])
                else:
                    full_prefix = "/api/" + first_path.split("/")[1]

            for expected in expected_prefixes:
                if full_prefix.startswith(expected):
                    found.add(expected)

        assert found == expected_prefixes, f"Missing route prefixes: {expected_prefixes - found}"

    def test_route_count(self):
        count = len(api_router.routes)
        assert count >= 6, f"Expected at least 6 routes, got {count}"
