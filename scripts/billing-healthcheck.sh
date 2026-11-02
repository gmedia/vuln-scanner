#!/usr/bin/env bash
# Billing healthcheck — read-only SQL against the production database.
#
# Answers the questions that matter after the billing stack went live:
#   * who is read-only because of a lapsed subscription,
#   * which invoices are overdue but still `sent`,
#   * whether reminder emails were actually delivered,
#   * whether tax is switched on (and for whom),
#   * which workspaces still lack billing details / payment terms.
#
# Read-only: every statement is a SELECT. Safe to run on production.
#
# Usage:
#   ./scripts/billing-healthcheck.sh                 # docker exec into vuln-postgres
#   PG_MODE=network ./scripts/billing-healthcheck.sh # local psql against DATABASE_URL_SYNC
#   ENV_FILE=/path/.env ./scripts/billing-healthcheck.sh
#
# Exit codes: 0 = checks ran, 2 = preflight failure.

set -euo pipefail

PG_MODE="${PG_MODE:-docker}"
PG_CONTAINER="${PG_CONTAINER:-vuln-postgres}"
ENV_FILE="${ENV_FILE:-.env}"

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
  docker)
    command -v docker >/dev/null 2>&1 || { echo "error: docker not found (use PG_MODE=network)" >&2; exit 2; }
    if ! docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
      echo "error: container '$PG_CONTAINER' not found (set PG_CONTAINER=)" >&2
      exit 2
    fi
    run_sql() { docker exec -i "$PG_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"; }
    ;;
  network)
    command -v psql >/dev/null 2>&1 || { echo "error: psql not found" >&2; exit 2; }
    DSN="${DATABASE_URL_SYNC:-$(env_value DATABASE_URL_SYNC)}"
    [[ -n "$DSN" ]] || { echo "error: DATABASE_URL_SYNC is empty (set it or use PG_MODE=docker)" >&2; exit 2; }
    run_sql() { psql -X -q -v ON_ERROR_STOP=1 "$DSN" "$@"; }
    ;;
  *)
    echo "error: PG_MODE must be 'docker' or 'network' (got '$PG_MODE')" >&2
    exit 2
    ;;
esac

section() { printf '\n=== %s ===\n' "$1"; }

section "Subscription status distribution"
run_sql <<'SQL'
SELECT status, count(*) AS orgs
FROM subscriptions
GROUP BY status
ORDER BY status;
SQL

section "Read-only workspaces (past_due / canceled)"
run_sql <<'SQL'
SELECT o.name AS workspace,
       s.status,
       s.sku,
       s.current_period_end::date AS period_end,
       s.cancel_at_period_end,
       s.updated_at::date AS updated
FROM subscriptions s
JOIN organizations o ON o.id = s.organization_id
WHERE s.status IN ('past_due', 'canceled')
ORDER BY s.updated_at DESC;
SQL

section "Overdue invoices still 'sent' (read-only risk)"
run_sql <<'SQL'
SELECT o.name AS workspace,
       i.number,
       i.sku,
       i.amount_idr,
       i.total_idr,
       i.due_date::date AS due,
       (now()::date - i.due_date::date) AS days_overdue
FROM org_invoices i
JOIN organizations o ON o.id = i.organization_id
WHERE i.status = 'sent'
  AND i.due_date IS NOT NULL
  AND i.due_date < now()
ORDER BY i.due_date ASC;
SQL

section "Recent billing reminders"
run_sql <<'SQL'
SELECT r.created_at::date AS day,
       r.stage,
       count(*) AS invoices,
       sum(r.sent_count) AS emails_sent,
       sum(r.failed_count) AS emails_failed,
       max(r.last_error) AS sample_error
FROM billing_reminders r
GROUP BY 1, 2
ORDER BY 1 DESC, 2
LIMIT 30;
SQL

section "Reminder email log"
run_sql <<'SQL'
SELECT created_at::date AS day, status, count(*) AS emails
FROM email_send_logs
WHERE kind = 'billing_reminder'
GROUP BY 1, 2
ORDER BY 1 DESC;
SQL

section "Tax switched on?"
run_sql <<'SQL'
SELECT
  (SELECT count(*) FROM org_billing_profiles WHERE pkp_status = 'pkp') AS pkp_orgs,
  (SELECT count(*) FROM org_invoices WHERE ppn_idr > 0) AS taxed_invoices,
  (SELECT count(*) FROM org_invoices WHERE dpp_idr <> amount_idr) AS invoices_with_dpp_split;
SQL

section "Workspaces missing billing details"
run_sql <<'SQL'
SELECT o.name AS workspace,
       coalesce(p.payment_terms_days, 0) AS payment_terms_days,
       coalesce(nullif(p.billing_email, ''), '(none)') AS billing_email,
       p.organization_id IS NULL AS no_profile,
       (SELECT count(*) FROM billing_recipients r
        WHERE r.organization_id = o.id
          AND r.kind = 'billing'
          AND r.disabled_at IS NULL) AS billing_recipients
FROM organizations o
LEFT JOIN org_billing_profiles p ON p.organization_id = o.id
WHERE p.organization_id IS NULL
   OR p.billing_email = ''
   OR NOT EXISTS (
        SELECT 1 FROM billing_recipients r
        WHERE r.organization_id = o.id
          AND r.kind = 'billing'
          AND r.disabled_at IS NULL
      )
ORDER BY o.created_at DESC;
SQL

printf '\nDone. All statements were read-only.\n'
