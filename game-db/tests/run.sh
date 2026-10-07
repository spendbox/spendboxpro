#!/usr/bin/env bash
# Runs the game scenario test against an EMPTY, throwaway Postgres database
# (never your real Supabase project). Example:
#   TEST_DATABASE_URL=postgres://postgres@localhost:5432/hideseek_test npm run test:db
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to an empty, throwaway Postgres database}"
cd "$(dirname "$0")/../.."
P="psql $TEST_DATABASE_URL -v ON_ERROR_STOP=1 -q"
$P -f game-db/tests/supabase-stub.sql
$P -f game-db/001_hide_and_seek.sql
$P -f game-db/002_email_codes_and_city.sql
$P -f game-db/tests/game.test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
