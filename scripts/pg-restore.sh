#!/usr/bin/env bash
# Restore a Postgres custom-format dump (Sinexis / VulnScanner).
#
# Companion to scripts/pg-backup.sh. Public-repo safe: never prints hosts,
# IPs, passwords, or DB URLs.
#
# Usage:
#   ./scripts/pg-restore.sh --list backups/vuln-<db>-<ts>.dump
#   ./scripts/pg-restore.sh --yes backups/vuln-<db>-<ts>.dump
#   ./scripts/pg-restore.sh --yes backups/vuln-<db>-<ts>.dump.gpg
#
# --list prints the archive table of contents (non-destructive). Restoring
# REQUIRES an explicit --yes: it runs pg_restore --clean --if-exists --no-owner,
# which drops and recreates objects in the target database.
#
# Env (same conventions as pg-backup.sh):
#   DEPLOY_PATH   default: repo root derived from this script
#   ENV_FILE      default: $DEPLOY_PATH/.env
#   PG_MODE       docker (default) | network
#   PG_CONTAINER  default vuln-postgres (docker mode)
#   PG_IMAGE      default postgres:16-alpine (network mode)
#   PG_HOST/PG_PORT  network mode; default from $ENV_FILE POSTGRES_HOST, 5432
#   POSTGRES_USER / POSTGRES_DB  process env → $ENV_FILE → default vuln_scanner
#   BACKUP_AGE_IDENTITY   age private key for .age archives (default keyring if unset)

set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,24p' "$0" | sed 's/^# \?//'
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
BACKUP_AGE_IDENTITY="${BACKUP_AGE_IDENTITY:-}"

LIST_FILE=""
RESTORE_FILE=""
ASSUME_YES=0

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --list)
      LIST_FILE="${2:-}"
      [[ -n "$LIST_FILE" ]] || { echo "error: --list needs a file argument" >&2; usage 1; }
      shift 2
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    -*)
      echo "error: unknown flag: $1" >&2
      usage 1
      ;;
    *)
      RESTORE_FILE="$1"
      shift
      ;;
  esac
done

# Parse a single key from $ENV_FILE without sourcing it (values may contain
# spaces; never `.`/`source` the file).
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

case "$PG_MODE" in
  docker|network) ;;
  *)
    echo "error: PG_MODE must be 'docker' or 'network' (got '$PG_MODE')" >&2
    exit 1
    ;;
esac

command -v docker >/dev/null 2>&1 || {
  echo "error: docker is required" >&2
  exit 1
}

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

umask 077

WORK_FILE=""
ARCHIVE=""
cleanup() {
  [[ -n "$WORK_FILE" && -f "$WORK_FILE" ]] && rm -f -- "$WORK_FILE" || true
}
trap cleanup EXIT

# Decrypt .age/.gpg to a private temp file; otherwise use the input directly.
prepare_archive() {
  local in="$1"
  case "$in" in
    *.age)
      command -v age >/dev/null 2>&1 || {
        echo "error: '.age' archive needs 'age' installed" >&2
        exit 1
      }
      WORK_FILE="$(mktemp "${TMPDIR:-/tmp}/vuln-restore.XXXXXX.dump")"
      if [[ -n "$BACKUP_AGE_IDENTITY" ]]; then
        age --decrypt -i "$BACKUP_AGE_IDENTITY" -o "$WORK_FILE" "$in"
      else
        age --decrypt -o "$WORK_FILE" "$in"
      fi
      ARCHIVE="$WORK_FILE"
      ;;
    *.gpg)
      command -v gpg >/dev/null 2>&1 || {
        echo "error: '.gpg' archive needs 'gpg' installed" >&2
        exit 1
      }
      WORK_FILE="$(mktemp "${TMPDIR:-/tmp}/vuln-restore.XXXXXX.dump")"
      gpg --batch --yes --quiet --decrypt --output "$WORK_FILE" "$in"
      ARCHIVE="$WORK_FILE"
      ;;
    *)
      ARCHIVE="$in"
      ;;
  esac
}

if [[ -n "$LIST_FILE" ]]; then
  [[ -f "$LIST_FILE" ]] || { echo "error: file not found: $LIST_FILE" >&2; exit 1; }
  prepare_archive "$LIST_FILE"
  echo "=== archive table of contents ==="
  if [[ "$PG_MODE" == "docker" ]]; then
    docker exec -i "$PG_CONTAINER" pg_restore --list <"$ARCHIVE"
  else
    export PGPASSWORD="${POSTGRES_PASSWORD:-$(env_value POSTGRES_PASSWORD)}"
    export PGHOST="$PG_HOST"
    export PGPORT="$PG_PORT"
    docker run --rm -i -e PGPASSWORD -e PGHOST -e PGPORT "$PG_IMAGE" pg_restore --list <"$ARCHIVE"
  fi
  exit 0
fi

if [[ -z "$RESTORE_FILE" ]]; then
  echo "error: no archive given (use --list <file> or --yes <file>)" >&2
  usage 1
fi
[[ -f "$RESTORE_FILE" ]] || { echo "error: file not found: $RESTORE_FILE" >&2; exit 1; }

if [[ "$ASSUME_YES" != "1" ]]; then
  echo "refusing to restore without --yes." >&2
  echo "  This is DESTRUCTIVE: pg_restore --clean --if-exists drops and" >&2
  echo "  recreates objects in database '$POSTGRES_DB' and may overwrite data." >&2
  echo "  Re-run with: $0 --yes <file>" >&2
  exit 1
fi

prepare_archive "$RESTORE_FILE"

echo "=== pg restore ==="
echo "mode: $PG_MODE"
echo "db:   $POSTGRES_DB"
echo "file: $(basename -- "$RESTORE_FILE")"

set +e
if [[ "$PG_MODE" == "docker" ]]; then
  docker exec -i "$PG_CONTAINER" \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner <"$ARCHIVE"
  rc=$?
else
  export PGPASSWORD="${POSTGRES_PASSWORD:-$(env_value POSTGRES_PASSWORD)}"
  export PGHOST="$PG_HOST"
  export PGPORT="$PG_PORT"
  docker run --rm -i -e PGPASSWORD -e PGHOST -e PGPORT "$PG_IMAGE" \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner <"$ARCHIVE"
  rc=$?
fi
set -e

if [[ $rc -ne 0 ]]; then
  echo "warn: pg_restore exited $rc (with --clean --if-exists, 'errors ignored' on" >&2
  echo "      pre-existing objects is often benign — review the output above)" >&2
fi
exit $rc
