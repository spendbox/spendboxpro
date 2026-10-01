#!/usr/bin/env bash
# Runs the database scenario tests against an EMPTY, throwaway Postgres database
# (never your real Supabase project). Example:
#   TEST_DATABASE_URL=postgres://postgres@localhost:5432/spendbox_test npm run test:db
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to an empty, throwaway Postgres database}"
cd "$(dirname "$0")/../.."
P="psql $TEST_DATABASE_URL -v ON_ERROR_STOP=1 -q"
$P -f supabase/tests/supabase-stub.sql
$P -f supabase/migrations/20261001000000_spendbox.sql
$P -o /dev/null -f supabase/tests/spendbox.test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
