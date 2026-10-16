# Postgres backup & restore (object storage)

Public-repo safe: **no production IPs, hosts, passwords, or DB URLs** in this file. Keep real inventory in a private ops note or password manager.

Companion scripts: [`../scripts/pg-backup.sh`](../scripts/pg-backup.sh), [`../scripts/pg-restore.sh`](../scripts/pg-restore.sh), systemd units under [`../scripts/systemd/`](../scripts/systemd/). Multi-host roles: [`multi-host-ops.md`](multi-host-ops.md). Deploys: [`deploy.md`](deploy.md).

---

## 1) Why back up Postgres

Postgres is the **only non-reproducible asset** in this stack. Application code, compose files, nginx templates, and CI config all live in this repo (and GitHub); infrastructure is re-creatable from [`deploy.md`](deploy.md) + [`multi-host-ops.md`](multi-host-ops.md). The database — users, orgs, scans, schedules, invoices, Guard inventory, credits — is not.

`pg-backup.sh` produces a **custom-format** dump (`pg_dump -Fc`), optionally encrypts it, uploads it to the configured object storage backend (the same one `backend/app/services/object_storage.py` uses for mobile uploads), prunes local retention, and prints a **secret-free** summary.

---

## 2) Install (systemd timer)

On the host that runs the database (or can reach it — see §4):

```bash
cd /path/to/vuln-scanner
sudo cp scripts/systemd/vuln-pg-backup.service /etc/systemd/system/
sudo cp scripts/systemd/vuln-pg-backup.timer   /etc/systemd/system/

# Create the env file with real values, mode 600 (never committed):
sudo install -m 600 /dev/null /etc/vuln-pg-backup.env
sudoedit /etc/vuln-pg-backup.env          # start from scripts/systemd/vuln-pg-backup.env.example

sudo systemctl daemon-reload
sudo systemctl enable --now vuln-pg-backup.timer
systemctl list-timers vuln-pg-backup.timer
```

The unit is `Type=oneshot`, `User=root` (it shells out to `docker`), and hardened (`NoNewPrivileges`, `PrivateTmp=true`, `ProtectSystem=strict`, `ProtectHome=read-only`, `ReadWritePaths=` for the stage/local dirs). `After=`/`Wants=docker.service`.

The timer runs **daily** (`OnCalendar=daily`, `Persistent=true`, `RandomizedDelaySec=15min`). `Persistent=true` catches up a missed run after downtime; the randomized delay avoids a thundering herd across hosts.

If you override `BACKUP_STAGE_DIR` / `BACKUP_LOCAL_DIR` in the env file, add the new paths to `ReadWritePaths=` in the service — otherwise `ProtectSystem=strict` blocks the write.

---

## 3) Run on demand

```bash
./scripts/pg-backup.sh                 # uses .env + defaults
./scripts/pg-backup.sh --help          # no side effects
```

Dry-ish first run: set `BACKUP_ALLOW_PLAINTEXT=1` and a small `BACKUP_RETENTION_DAYS` only for a throwaway test database — never for production.

---

## 4) Mode selection

| Topology | `PG_MODE` | How the dump runs | Password |
|----------|-----------|-------------------|----------|
| **Single host** (Postgres is the local compose container `vuln-postgres`) | `docker` (default) | `docker exec vuln-postgres pg_dump …` | Not needed — the in-container local socket is trust |
| **Multi-host** (Postgres on the data host, [`docker-compose.prod.remote-data.yml`](../docker-compose.prod.remote-data.yml)) | `network` | one-off `docker run --rm` of `PG_IMAGE` against `PG_HOST` | `PGPASSWORD` passed by name via `-e PGPASSWORD` (never in argv); set `POSTGRES_PASSWORD` |

For multi-host, `PG_HOST` defaults to `POSTGRES_HOST` read from `ENV_FILE`. `POSTGRES_USER` / `POSTGRES_DB` come from the process env, else `ENV_FILE`, else `vuln_scanner`.

The script parses only the keys it needs from `.env` with `grep` — it **never** `source`s the file (values can contain spaces, e.g. `SMTP_FROM`).

---

## 5) Encryption

Pick one; the script fails closed if none is configured.

| Method | Env | Notes |
|--------|-----|-------|
| **age** (preferred) | `BACKUP_AGE_RECIPIENT` | Public-key encryption; keep the **private identity offline**. Output `.dump.age`. |
| **gpg** | `BACKUP_GPG_RECIPIENT` | gpg 2.4.x is installed on the host. Output `.dump.gpg`. |
| **Plaintext** | `BACKUP_ALLOW_PLAINTEXT=1` | Discouraged; required explicitly or the run aborts. Output `.dump`. |

Extension order: `.dump.age` → `.dump.gpg` → `.dump`.

---

## 6) Retention

Two independent layers:

- **Local**: the script deletes files matching `*.dump*` older than `BACKUP_RETENTION_DAYS` (default 14) from `BACKUP_LOCAL_DIR`. This is local-only.
- **Object storage**: the storage interface (`ObjectStorage` in `backend/app/services/object_storage.py`) has **no `list()`** method, so the script **cannot** enumerate or prune remote objects. Set a **bucket lifecycle rule** (e.g. expire `backups/` after N days) in the object-storage console instead.

---

## 7) Restore drill

An untested backup is **not** a backup. Rehearse on a throwaway database periodically.

```bash
# 1. Inspect the archive without touching any database:
./scripts/pg-restore.sh --list /var/backups/vuln-scanner/vuln-<db>-<ts>.dump
./scripts/pg-restore.sh --list /var/backups/vuln-scanner/vuln-<db>-<ts>.dump.gpg   # decrypts to a temp file first

# 2. Restore — DESTRUCTIVE, requires --yes:
./scripts/pg-restore.sh --yes /var/backups/vuln-scanner/vuln-<db>-<ts>.dump
```

`.age` archives need `BACKUP_AGE_IDENTITY` (or the default age keyring); `.gpg` uses the host gpg keyring. Restore runs `pg_restore --clean --if-exists --no-owner`; in `docker` mode it pipes into `docker exec -i <PG_CONTAINER>`, in `network` mode into a one-off `PG_IMAGE` container with `PGPASSWORD` pass-through.

Recommended cadence: **quarterly** (or before any risky migration), restore into a scratch DB and spot-check row counts / a login. A restore that only prints warnings on pre-existing objects is usually benign; confirm the data, not just the exit code.

---

## 8) Caveats

| Caveat | Detail |
|--------|--------|
| **COS single-PUT cap (5 GB)** | `TencentCOSStorage.put_file` does one PUT. Large databases can exceed the COS single-upload limit — compress/`-Fc` (already default) helps; beyond that, split the dump or use multipart (not implemented here). |
| **`pg_dump` lives only in the Postgres image** | Neither `backend` nor `workers` images ship the Postgres client. `PG_MODE=network` therefore runs `PG_IMAGE`; `docker` mode execs into the Postgres container. |
| **COS uploader needs the backend image on this host** | The uploader is a one-off `docker run` from the image id resolved via `docker inspect "$BACKUP_BACKEND_CONTAINER" --format '{{.Image}}'` (no hardcoded tag). The backend container must exist on the host running the backup. The **local** backend path needs neither. |
| **`read_only` backend + 768M tmpfs is irrelevant** | The uploader container is a fresh `docker run`, and the artifact is **bind-mounted** read-only (`-v "$BACKUP_STAGE_DIR:/backup:ro"`), not written into the backend's tmpfs. |
| **Secrets never in argv/stdout** | Passwords go through `-e PGPASSWORD`/`COS_*` pass-through; the script prints only db name, byte count, artifact name, encryption mode, destination ref, and retention. |

---

## 9) Related docs

| Topic | Doc |
|-------|-----|
| Hosts, roles, UFW, remote data | [`multi-host-ops.md`](multi-host-ops.md) |
| Deploy scripts + CI vs Alembic | [`deploy.md`](deploy.md) |
| New-server bootstrap | [`deploy-new-server.md`](deploy-new-server.md) |
| Object storage / COS flags | [`multi-host-ops.md`](multi-host-ops.md) (§ Mobile / COS) |
