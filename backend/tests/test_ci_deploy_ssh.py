import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
TEXT = WORKFLOW.read_text(encoding="utf-8")

SSH_STEPS = (
    ("deploy", "Deploy to production"),
    ("deploy-workers", "Pull and recreate workers on gm-s1"),
)


def _job_block(job: str) -> str:
    match = re.search(
        rf"^  {re.escape(job)}:\n(.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)",
        TEXT,
        re.S | re.M,
    )
    assert match, f"no job {job} in ci.yml"
    return match.group(1)


def _step_block(job: str, step: str) -> str:
    match = re.search(
        rf"^      - name: {re.escape(step)}\n(.*?)(?=^      - |\Z)",
        _job_block(job),
        re.S | re.M,
    )
    assert match, f"no step {step!r} in job {job}"
    return match.group(1)


def test_ssh_steps_fail_fast_instead_of_hanging():
    for job, step in SSH_STEPS:
        block = _step_block(job, step)
        assert "ConnectTimeout=15" in block, f"{job}: outer ssh needs ConnectTimeout"
        assert "ServerAliveInterval=10" in block, f"{job}: needs ServerAliveInterval"
        assert "ServerAliveCountMax=3" in block, f"{job}: needs ServerAliveCountMax"
        assert "ConnectTimeout=10" in block, f"{job}: the ProxyCommand ssh needs ConnectTimeout"


def test_ssh_steps_retry_transport_errors_only():
    for job, step in SSH_STEPS:
        block = _step_block(job, step)
        assert "for attempt in 1 2 3; do" in block
        assert '[ "$rc" -ne 255 ]' in block, f"{job}: a host-side failure must not be retried"
        assert 'exit "$rc"' in block


def test_ssh_steps_remove_keys_even_on_failure():
    for job, step in SSH_STEPS:
        block = _step_block(job, step)
        assert "trap 'rm -f ~/.ssh/deploy_key ~/.ssh/jump_key' EXIT" in block
        assert block.count("rm -f ~/.ssh/deploy_key") == 1, f"{job}: keys cleaned by the trap only"


def test_preflight_probes_the_ssh_banner_not_just_tcp():
    for job in ("deploy", "deploy-workers"):
        block = _step_block(job, "Preflight - deploy jump host reachable")
        assert "/dev/tcp/" in block, f"{job}: preflight must read the SSH banner"
        assert '[ "$banner" = "SSH-" ]' in block
