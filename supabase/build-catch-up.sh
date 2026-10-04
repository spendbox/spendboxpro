#!/usr/bin/env bash
# Builds supabase/catch_up.sql: every migration in one file, where each one only
# runs if the database doesn't have it yet. Run this after adding a migration:
#   bash supabase/build-catch-up.sh
set -euo pipefail
cd "$(dirname "$0")"

# One line per migration: file, then a check that is true once it has run.
MARKERS=(
  "20261001000000_spendbox.sql|to_regclass('public.businesses') is not null"
  "20261002000000_logos_emails_durations.sql|exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'perks' and column_name = 'valid_days')"
  "20261003000000_bank_feeds.sql|to_regclass('public.bank_connections') is not null"
  "20261004000000_sales.sql|to_regclass('public.bank_transactions_paid_idx') is not null"
  "20261005000000_partners.sql|to_regclass('public.partnerships') is not null"
  "20261006000000_activity_and_accounts.sql|to_regclass('public.audit_events') is not null"
  "20261007000000_pay_accounts.sql|to_regprocedure('public.business_pay_accounts(uuid)') is not null"
  "20261008000000_admin.sql|to_regclass('public.app_settings') is not null"
  "20261009000000_email_and_billing.sql|to_regclass('public.business_payments') is not null"
  "20261010000000_requests.sql|to_regclass('public.requests') is not null"
  "20261011000000_interests_and_speed.sql|to_regclass('public.customer_interests') is not null"
  "20261012000000_products.sql|to_regclass('public.products') is not null"
  "20261013000000_marketplace.sql|to_regprocedure('public.explore_businesses()') is not null"
)

listed=$(printf '%s\n' "${MARKERS[@]}" | cut -d'|' -f1 | sort)
actual=$(ls migrations/*.sql | xargs -n1 basename | sort)
if [ "$listed" != "$actual" ]; then
  echo "Every file in supabase/migrations needs a line in MARKERS (and no others)." >&2
  exit 1
fi

out=catch_up.sql
{
  cat <<'EOF'
-- =============================================================================
-- Spendbox: bring any Supabase database up to date in one go.
--
-- Paste ALL of this into Supabase → SQL Editor and press Run. It checks which
-- updates your database already has and runs only the missing ones, in order.
-- Running it again is safe: it skips everything that's already there.
-- The table at the end shows each update and whether it's in place.
--
-- Generated from supabase/migrations by supabase/build-catch-up.sh. Don't edit
-- by hand; change the migration and run the script again.
-- =============================================================================

EOF
  n=0
  for line in "${MARKERS[@]}"; do
    n=$((n + 1))
    file=${line%%|*}
    check=${line#*|}
    tag="spendbox_update_$n"
    if grep -q "\$$tag\\$" "migrations/$file"; then echo "Quote tag clash in $file" >&2; exit 1; fi
    printf -- '-- Update %d: %s\n' "$n" "$file"
    printf 'do $outer$ begin\n  if not (%s) then\n    execute $%s$\n' "$check" "$tag"
    cat "migrations/$file"
    printf '\n$%s$;\n  end if;\nend $outer$;\n\n' "$tag"
  done
  echo "-- Which updates are in place (all should say yes)."
  echo "select * from (values"
  n=0
  for line in "${MARKERS[@]}"; do
    n=$((n + 1))
    file=${line%%|*}
    check=${line#*|}
    sep=","; [ "$n" -eq "${#MARKERS[@]}" ] && sep=""
    printf "  (%d, '%s', case when %s then 'yes' else 'NO' end)%s\n" "$n" "${file%.sql}" "$check" "$sep"
  done
  echo ") as updates (step, name, in_place);"
} > "$out"
echo "Wrote supabase/$out"
