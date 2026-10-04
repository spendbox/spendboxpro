#!/usr/bin/env bash
# Runs the database scenario tests against an EMPTY, throwaway Postgres database
# (never your real Supabase project). Example:
#   TEST_DATABASE_URL=postgres://postgres@localhost:5432/spendbox_test npm run test:db
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to an empty, throwaway Postgres database}"
cd "$(dirname "$0")/../.."
P="psql $TEST_DATABASE_URL -v ON_ERROR_STOP=1 -q"
$P -f supabase/tests/supabase-stub.sql
for migration in supabase/migrations/*.sql; do $P -f "$migration"; done
for test in supabase/tests/spendbox.test.sql supabase/tests/update2.test.sql supabase/tests/partners.test.sql supabase/tests/activity.test.sql supabase/tests/admin.test.sql supabase/tests/billing.test.sql supabase/tests/requests.test.sql supabase/tests/interests.test.sql; do
  $P -o /dev/null -f "$test" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
done
