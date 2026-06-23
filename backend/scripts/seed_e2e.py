"""
E2E test data seeder.
Run after migrations: python -m scripts.seed_e2e
Inserts sample scan jobs + findings so frontend E2E tests have data to work with.
"""
import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.database import Base
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob
from app.models.user import User
from app.services.auth import hash_password

SEED_DATA = [
    {
        "scan_type": "ip",
        "target": "8.8.8.8",
        "status": "completed",
        "progress": 100,
        "result_summary": {"total_findings": 3, "critical": 1, "high": 1, "medium": 1, "low": 0, "info": 0},
        "findings": [
            {
                "severity": "critical",
                "category": "Open Port",
                "title": "Port 53 (DNS) open — possible DNS amplification",
                "cve_id": None,
                "cvss_score": None,
            },
            {
                "severity": "high",
                "category": "Open Port",
                "title": "Port 443 (HTTPS) open",
                "cve_id": None,
                "cvss_score": None,
            },
            {
                "severity": "medium",
                "category": "Service Detection",
                "title": "Google DNS server detected",
                "cve_id": None,
                "cvss_score": None,
            },
        ],
    },
    {
        "scan_type": "domain",
        "target": "example.com",
        "status": "completed",
        "progress": 100,
        "result_summary": {"total_findings": 2, "critical": 0, "high": 1, "medium": 1, "low": 0, "info": 0},
        "findings": [
            {
                "severity": "high",
                "category": "Security Headers",
                "title": "Missing X-Frame-Options header",
                "cve_id": None,
                "cvss_score": None,
            },
            {
                "severity": "medium",
                "category": "TLS",
                "title": "TLS 1.0 supported",
                "cve_id": None,
                "cvss_score": None,
            },
        ],
    },
    {
        "scan_type": "ip",
        "target": "10.0.0.1",
        "status": "running",
        "progress": 45,
        "result_summary": None,
        "findings": [],
    },
    {
        "scan_type": "domain",
        "target": "test.org",
        "status": "failed",
        "progress": 30,
        "result_summary": None,
        "findings": [],
    },
]


async def seed():
    engine = create_async_engine(settings.database_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        e2e_email = "e2e@vulnscan.dev"
        result = await session.execute(select(User).where(User.email == e2e_email))
        e2e_user = result.scalar_one_or_none()
        if not e2e_user:
            e2e_user = User(
                email=e2e_email,
                password_hash=hash_password("E2eTestPass123!"),
                is_verified=True,
                verified_at=datetime.now(UTC),
            )
            session.add(e2e_user)
            await session.flush()
            print(f"Created verified E2E test user: {e2e_email}")

        result = await session.execute(text("SELECT COUNT(*) FROM scan_jobs"))
        count = result.scalar()
        if count and count > 0:
            print(f"Database already has {count} scan jobs — skipping seed.")
            await session.close()
            await engine.dispose()
            return

        now = datetime.now(UTC)

        for i, item in enumerate(SEED_DATA):
            job_id = uuid.uuid4()
            started = now - timedelta(hours=len(SEED_DATA) - i, minutes=15)
            completed = started + timedelta(minutes=12) if item["status"] == "completed" else None

            job = ScanJob(
                id=job_id,
                user_id=e2e_user.id,
                scan_type=item["scan_type"],
                target=item["target"],
                status=item["status"],
                progress=item["progress"],
                result_summary=item["result_summary"],
                started_at=started,
                completed_at=completed,
                created_at=started,
            )
            session.add(job)
            await session.flush()  # Persist job before findings reference it

            for finding_data in item["findings"]:
                finding = ScanFinding(
                    id=uuid.uuid4(),
                    job_id=job_id,
                    severity=finding_data["severity"],
                    category=finding_data["category"],
                    title=finding_data["title"],
                    description=finding_data.get("description"),
                    cve_id=finding_data.get("cve_id"),
                    cvss_score=finding_data.get("cvss_score"),
                    found_at=completed or started,
                )
                session.add(finding)

        await session.commit()
        print(f"Seeded {len(SEED_DATA)} scan jobs with findings.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
