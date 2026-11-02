#!/usr/bin/env bash
# Scheduled Postgres backup → object storage (Sinexis / VulnScanner).
#
# Dumps the app database in custom format (pg_dump -Fc), optionally encrypts
# it, uploads it to the configured object storage backend, prunes local
# retention, and prints a secret-free summary. Public-repo safe: never prints
# hosts, IPs, passwords, or DB URLs.
#
# Usage:
#   ./scripts/pg-backup.sh
#   PG_MODE=network BACKUP_AGE_RECIPIENT=age1... ./scripts/pg-backup.sh
#
# Env:
#   DEPLOY_PATH   default: repo root derived from this script
#   ENV_FILE      default: $DEPLOY_PATH/.env
#   PG_MODE       docker (default) | network
#   PG_CONTAINER  default vuln-postgres (docker mode)
#   PG_IMAGE      default postgres:16-alpine (network mode)
#   PG_HOST/PG_PORT  network mode; default from $ENV_FILE POSTGRES_HOST, 5432
#   POSTGRES_USER / POSTGRES_DB  process env → $ENV_FILE → default vuln_scanner
#   BACKUP_STAGE_DIR    default /var/tmp/vuln-pg-backup
#   BACKUP_LOCAL_DIR    default /var/backups/vuln-scanner
#   BACKUP_KEY_PREFIX   default backups/
#   BACKUP_RETENTION_DAYS  default 14 (prunes the local dir only)
#   BACKUP_AGE_RECIPIENT   age public key (preferred)
#   BACKUP_GPG_RECIPIENT   gpg recipient (alternative)
#   BACKUP_ALLOW_PLAINTEXT 1 required to store an unencrypted dump (discouraged)
#   BACKUP_BACKEND_CONTAINER default vuln-backend (COS uploader image source)
#   BACKUP_KEEP_STAGED  1 to keep the staged artifact after success
#   OBJECT_STORAGE_BACKEND / COS_*  process env first, then $ENV_FILE
#
# Encryption: BACKUP_AGE_RECIPIENT → BACKUP_GPG_RECIPIENT → else require
# BACKUP_ALLOW_PLAINTEXT=1. Output extension: .dump / .dump.age / .dump.gpg.

set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,33p' "$0" | sed 's/^# \?//'
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

DEPLOY_PATH="${DEPLOY_PATH:-$REPO_ROOT}"
ENV_FILE="${ENV_FILE:-$DEPLOY_PATH/.env}"
PG_MODE="${PG_MODE:-docker}"
PG_CONTAINER="${PG_CONTAINER:-vuln-postgres}"
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
PG_PORT="${PG_PORT:-5432}"
BACKUP_STAGE_DIR="${BACKUP_STAGE_DIR:-/var/tmp/vuln-pg-backup}"
BACKUP_LOCAL_DIR="${BACKUP_LOCAL_DIR:-/var/backups/vuln-scanner}"
BACKUP_KEY_PREFIX="${BACKUP_KEY_PREFIX:-backups/}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"
BACKUP_GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-}"
BACKUP_ALLOW_PLAINTEXT="${BACKUP_ALLOW_PLAINTEXT:-0}"
BACKUP_BACKEND_CONTAINER="${BACKUP_BACKEND_CONTAINER:-vuln-backend}"
BACKUP_KEEP_STAGED="${BACKUP_KEEP_STAGED:-0}"

# Parse a single key from $ENV_FILE without sourcing it. Values may contain
# spaces (e.g. SMTP_FROM), so never `.`/`source` the file.
env_value() {
  local key="$1" line val
  [[ -f "$ENV_FILE" ]] || return 0
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$ENV_FILE" | tail -n1 || true)"
  [[ -n "$line" ]] || return 0
  val="${line#*=}"
  val="${val%$'\r'}"
  if [[ "$val" == \"*\" ]]; then
    val="${val#\"}"
    val="${val%\"}"
  elif [[ "$val" == \'*\' ]]; then
    val="${val#\'}"
    val="${val%\'}"
  fi
  printf '%s' "$val"
}

POSTGRES_USER="${POSTGRES_USER:-$(env_value POSTGRES_USER)}"
POSTGRES_USER="${POSTGRES_USER:-vuln_scanner}"
POSTGRES_DB="${POSTGRES_DB:-$(env_value POSTGRES_DB)}"
POSTGRES_DB="${POSTGRES_DB:-vuln_scanner}"

OBJECT_STORAGE_BACKEND="${OBJECT_STORAGE_BACKEND:-$(env_value OBJECT_STORAGE_BACKEND)}"
OBJECT_STORAGE_BACKEND="${OBJECT_STORAGE_BACKEND:-local}"
DATABASE_URL="${DATABASE_URL:-$(env_value DATABASE_URL)}"
DATABASE_URL_SYNC="${DATABASE_URL_SYNC:-$(env_value DATABASE_URL_SYNC)}"

case "$PG_MODE" in
  docker|network) ;;
  *)
    echo "error: PG_MODE must be 'docker' or 'network' (got '$PG_MODE')" >&2
    exit 1
    ;;
esac

umask 077

# --- preflight -------------------------------------------------------------
command -v docker >/dev/null 2>&1 || {
  echo "error: docker is required" >&2
  exit 1
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "warn: ENV_FILE not found ($ENV_FILE); relying on process env only" >&2
fi

if [[ "$PG_MODE" == "docker" ]]; then
  if [[ "$(docker inspect "$PG_CONTAINER" --format '{{.State.Running}}' 2>/dev/null || echo false)" != "true" ]]; then
    echo "error: PG_MODE=docker requires a running container named '$PG_CONTAINER'" >&2
    exit 1
  fi
else
  PG_HOST="${PG_HOST:-$(env_value POSTGRES_HOST)}"
  if [[ -z "$PG_HOST" ]]; then
    echo "error: PG_MODE=network requires PG_HOST or POSTGRES_HOST in $ENV_FILE" >&2
    exit 1
  fi
fi

mkdir -p "$BACKUP_STAGE_DIR"
chmod 700 "$BACKUP_STAGE_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="vuln-${POSTGRES_DB}-${TS}.dump"
STAGE_FILE="$BACKUP_STAGE_DIR/$NAME"
OUT_FILE="$STAGE_FILE"
DUMP_ERR="$BACKUP_STAGE_DIR/pg_dump.err"

cleanup() {
  local rc=$?
  if [[ "${BACKUP_KEEP_STAGED:-0}" == "1" ]]; then
    return 0
  fi
  if [[ $rc -ne 0 ]]; then
    echo "note: keeping staged files under $BACKUP_STAGE_DIR for debugging" >&2
    return 0
  fi
  rm -f -- "${OUT_FILE:-}" "${STAGE_FILE:-}" "$DUMP_ERR" "${UPLOAD_ERR:-}" 2>/dev/null || true
}
trap cleanup EXIT

# --- dump ------------------------------------------------------------------
echo "=== pg backup ==="
echo "mode:   $PG_MODE"
echo "db:     $POSTGRES_DB"

if [[ "$PG_MODE" == "docker" ]]; then
  if ! docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
      >"$STAGE_FILE" 2>"$DUMP_ERR"; then
    echo "error: pg_dump failed in docker mode (details in $DUMP_ERR)" >&2
    exit 1
  fi
else
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(env_value POSTGRES_PASSWORD)}"
  # Pass the password by name only — never in argv.
  export PGPASSWORD="$POSTGRES_PASSWORD"
  export PGHOST="$PG_HOST"
  export PGPORT="$PG_PORT"
  if ! docker run --rm \
      -e PGPASSWORD -e PGHOST -e PGPORT \
      "$PG_IMAGE" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
      >"$STAGE_FILE" 2>"$DUMP_ERR"; then
    echo "error: pg_dump failed in network mode (details in $DUMP_ERR)" >&2
    exit 1
  fi
fi

if [[ ! -s "$STAGE_FILE" ]]; then
  echo "error: dump artifact is missing or empty ($STAGE_FILE)" >&2
  exit 1
fi

# --- encrypt ---------------------------------------------------------------
if [[ -n "$BACKUP_AGE_RECIPIENT" ]]; then
  command -v age >/dev/null 2>&1 || {
    echo "error: BACKUP_AGE_RECIPIENT set but 'age' is not installed" >&2
    exit 1
  }
  OUT_FILE="$STAGE_FILE.age"
  age -r "$BACKUP_AGE_RECIPIENT" -o "$OUT_FILE" "$STAGE_FILE"
  ENC_MODE="age"
elif [[ -n "$BACKUP_GPG_RECIPIENT" ]]; then
  command -v gpg >/dev/null 2>&1 || {
    echo "error: BACKUP_GPG_RECIPIENT set but 'gpg' is not installed" >&2
    exit 1
  }
  OUT_FILE="$STAGE_FILE.gpg"
  gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "$OUT_FILE" "$STAGE_FILE"
  ENC_MODE="gpg"
else
  if [[ "$BACKUP_ALLOW_PLAINTEXT" != "1" ]]; then
    echo "error: no encryption configured. Set BACKUP_AGE_RECIPIENT (preferred) or" >&2
    echo "       BACKUP_GPG_RECIPIENT, or explicitly set BACKUP_ALLOW_PLAINTEXT=1" >&2
    echo "       to store an unencrypted dump (discouraged)." >&2
    exit 1
  fi
  ENC_MODE="plaintext"
fi

ARTIFACT_NAME="$(basename -- "$OUT_FILE")"
BYTES="$(wc -c <"$OUT_FILE" | tr -d '[:space:]')"

# --- upload ----------------------------------------------------------------
BACKEND_LC="$(printf '%s' "$OBJECT_STORAGE_BACKEND" | tr '[:upper:]' '[:lower:]')"
case "$BACKEND_LC" in
  ""|local|disk|filesystem)
    install -d -m 700 "$BACKUP_LOCAL_DIR"
    install -m 600 "$OUT_FILE" "$BACKUP_LOCAL_DIR/$ARTIFACT_NAME"
    DEST="$BACKUP_LOCAL_DIR/$ARTIFACT_NAME"
    ;;
  cos|tencent|tencent_cos)
    IMG="$(docker inspect "$BACKUP_BACKEND_CONTAINER" --format '{{.Image}}' 2>/dev/null || true)"
    if [[ -z "$IMG" ]]; then
      echo "error: COS upload needs a running backend image source container" >&2
      echo "       ('$BACKUP_BACKEND_CONTAINER' not found; resolve via docker inspect)" >&2
      exit 1
    fi
    # Export COS_* for `docker run -e NAME` pass-through (never source .env).
    for k in COS_SECRET_ID COS_SECRET_KEY COS_REGION COS_BUCKET COS_APP_ID COS_ENDPOINT COS_PREFIX COS_TIMEOUT_SEC; do
      v="$(printenv "$k" 2>/dev/null || true)"
      [[ -n "$v" ]] || v="$(env_value "$k")"
      export "$k=$v"
    done
    export OBJECT_STORAGE_BACKEND
    export DATABASE_URL DATABASE_URL_SYNC
    export BACKUP_UPLOAD_NAME="$ARTIFACT_NAME"
    export BACKUP_UPLOAD_KEY="${BACKUP_KEY_PREFIX}${ARTIFACT_NAME}"
    UPLOAD_ERR="$BACKUP_STAGE_DIR/upload.err"
    if ! DEST="$(docker run --rm --user 0:0 \
        -v "$BACKUP_STAGE_DIR:/backup:ro" \
        -e OBJECT_STORAGE_BACKEND \
        -e DATABASE_URL -e DATABASE_URL_SYNC \
        -e COS_SECRET_ID -e COS_SECRET_KEY -e COS_REGION -e COS_BUCKET \
        -e COS_APP_ID -e COS_ENDPOINT -e COS_PREFIX -e COS_TIMEOUT_SEC \
        -e BACKUP_UPLOAD_NAME -e BACKUP_UPLOAD_KEY \
        --entrypoint python "$IMG" -c '
import os
from app.services.object_storage import get_object_storage
ref = get_object_storage().put_file(
    "/backup/" + os.environ["BACKUP_UPLOAD_NAME"],
    os.environ["BACKUP_UPLOAD_KEY"],
)
print(ref)
' 2>"$UPLOAD_ERR")"; then
      echo "error: COS upload failed (details in $UPLOAD_ERR)" >&2
      exit 1
    fi
    ;;
  *)
    echo "error: unsupported OBJECT_STORAGE_BACKEND='$OBJECT_STORAGE_BACKEND' (use local|cos)" >&2
    exit 1
    ;;
esac

# --- prune local retention -------------------------------------------------
PRUNED=0
if [[ -d "$BACKUP_LOCAL_DIR" ]]; then
  while IFS= read -r -d '' old; do
    rm -f -- "$old" && PRUNED=$((PRUNED + 1))
  done < <(find "$BACKUP_LOCAL_DIR" -maxdepth 1 -type f -name '*.dump*' \
    -mtime "+$BACKUP_RETENTION_DAYS" -print0 2>/dev/null)
fi

# --- summary ---------------------------------------------------------------
echo "=== summary ==="
echo "db:         $POSTGRES_DB"
echo "bytes:      $BYTES"
echo "artifact:   $ARTIFACT_NAME"
echo "encryption: $ENC_MODE"
echo "dest:       $DEST"
echo "retention:  local ${BACKUP_RETENTION_DAYS}d (pruned $PRUNED)"
echo "OK: backup complete"
