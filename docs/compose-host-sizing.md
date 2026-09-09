# Compose host sizing (tc1–tc5)

Public-repo safe: **no IPs, SSH ports, hostnames, or cloud SKUs** in this file. Map aliases in private SSH config / ops notes only.

**Orchestrator lock (2026-09-09):** stay on **Docker Compose** multi-host (`docker-compose.prod.yml` + `REMOTE_DATA=1`). **Do not** migrate to Docker Swarm or Kubernetes for a provider cutover. Swarm is a false middle; K8s (even K3s) is later, and only after object storage for mobile uploads, no `container_name` deploy contract, and a real HA/node need.

Roles and firewall: [`multi-host-ops.md`](multi-host-ops.md). Deploy scripts: [`deploy.md`](deploy.md).

---

## 1) Roles (unchanged)

| Alias | Role | Runs |
|-------|------|------|
| **tc1** | App / edge | Host nginx TLS; compose `backend`, `frontend`, `worker_mobile`, dead-letter, `celery_beat`. Ports **localhost** `8000` / `5174`. |
| **tc2** | Data | PostgreSQL 16 + Redis 8 (VM or equivalent managed). Not on the app host when `REMOTE_DATA=1`. |
| **tc3** | Guard | Wazuh Manager + Indexer (all-in-one OK at current volume). API `:55000` + Indexer `:9200` **from tc1 only**. Agent `:1514`/`:1515` from lab/customer agents. |
| **tc4** | Scan workers | `worker_ip` + `worker_domain` only (`CELERY_CONCURRENCY` 2 each in prod compose). **No** public HTTP. |
| **tc5** | Lab agent | `wazuh-agent` + Host Protect helper / WAF **fixture**. Not ERP. Not a second app host. |

Coding / OpenCode host is **not** a sixth product role. Optional **jump/bastion** is ops-only (tiny VM); do not call it tc6.

---

## 2) Buy list — minimum vs recommended

Assumptions: attach-scale (tens of schedules, not hundreds of parallel nmaps); SIEM on with short lookback; Host Protect walks **on the agent**, not the SaaS worker FS; app+data+workers in **one region**.

Prefer **dedicated vCPU** and **SSD**. Do not colocate tc2 with tc1. Do not run Wazuh on the app host.

| Host | **Minimum** (tight) | **Recommended** (cutover 12–24 mo) | Disk (SSD) | Public |
|------|---------------------|-------------------------------------|------------|--------|
| **tc1** | 4 vCPU / 8 GB | **6–8 vCPU / 16 GB** | 80–120 GB | 80/443 only (prefer CF ranges) |
| **tc2** | 2 vCPU / 8 GB | **4 vCPU / 16 GB** | **100–200 GB** + off-box backup | **None** (5432/6379 from tc1+tc4 CIDRs) |
| **tc3** | 4 vCPU / 8 GB | **4–8 vCPU / 16 GB** | **150–250 GB** (Indexer) | 1514/1515 restricted; 55000/9200 **tc1 only**; no public dashboard unless ops asks |
| **tc4** | 4 vCPU / 8 GB | **8 vCPU / 16 GB** | 40–60 GB | **None** (egress to scan targets + data) |
| **tc5** | 1 vCPU / 2 GB | **2 vCPU / 4 GB** | 20–40 GB | None |

If quota is tight: cut **tc4** toward 4/8 and **tc3** disk toward 150 GB. **Do not** cut tc1/tc2 RAM below recommended if mobile AAB/IPA and Postgres share the same week.

**Jump host (optional):** 1 vCPU / 1 GB. SSH from admin + CI only. Not a product alias.

**Managed Postgres/Redis** from the cloud may **replace the tc2 VM** (same role, different shape). That is not a new host number.

---

## 3) Why these numbers

- **tc1:** uvicorn + SPA + **mobile worker** (tmpfs + uploads; `MAX_UPLOAD_SIZE_MB` default 500) + beat. Mobile stays here while `OBJECT_STORAGE_BACKEND=local`. 8 GB is the floor; 16 GB avoids OOM on AAB.
- **tc2:** one VM for Postgres + Redis is enough at this scale. Split Redis later only if RAM/AOF fights Postgres — not at cutover.
- **tc3:** Indexer heap/disk dominate. All-in-one 16 GB matches thin Guard + SIEM without raw-log product volume.
- **tc4:** nmap `-sV -sC -O` is CPU-bound; two IP + two domain slots need headroom. Host Protect lab bind on this host is a **fixture**, not customer docroot.
- **tc5:** lab only. Do not size it like a customer VPS farm.

Compose facts: `container_name` (`vuln-backend`, …); beat **single**; host nginx **not** in the compose file. Those are why Swarm/K8s are out of scope here.

---

## 4) Do we need tc6?

**No** for product cutover.

| Idea | Verdict | When to revisit |
|------|---------|-----------------|
| Extra app node | No | After object storage + dropping localhost nginx assumptions |
| Redis-only VM | No | tc2 RAM/I/O saturated |
| Second scan worker | No | `/health/queues` stays deep for days → clone **tc4** (name it tc4b, not a vague tc6) |
| Split Indexer | No | tc3 disk/heap full under real SIEM volume |
| Edge WAF VM | **Never** | Customer nginx snippet only; never Sinexis edge |
| Object storage | Not a VM | S3-compatible; unblocks moving mobile off tc1 later |

Scale order later: **upsize tc4** → object storage → **second tc4** → split Indexer. Still Compose.

---

## 5) Provider cutover (Compose 1:1)

1. Map five roles to five VMs (or tc2 managed) in **one region**.
2. Copy secrets/`.env` (mode 600); do **not** redesign compose.
3. DNS / Cloudflare origin = **tc1** only.
4. Data: restore Postgres or new empty + migrate; Redis may start empty (broker).
5. Wazuh: treat Indexer as **new lab or planned migrate** — do not assume lift-and-shift of agent IDs; **tc5** wipe + enroll ([`AGENT_EXECUTION_GUIDE.md`](AGENT_EXECUTION_GUIDE.md) §4.1).
6. Worker host: UFW + `pg_hba` for **tc4** CIDR, not only tc1.
7. Never print IPs/keys in git. Never paste Host WAF onto `sinexis.app` nginx.

---

## 6) Related

| Doc | Role |
|-----|------|
| [`multi-host-ops.md`](multi-host-ops.md) | Networks, Guard lab, Host Protect/WAF lab |
| [`deploy.md`](deploy.md) | Scripts, CI vs Alembic |
| [`docker-compose.prod.yml`](../docker-compose.prod.yml) | Service list |
| [`AGENT_EXECUTION_GUIDE.md`](AGENT_EXECUTION_GUIDE.md) | Product priority (this file is **ops sizing**, not an epic) |
