#!/usr/bin/env bash
# Runs the game scenario test against an EMPTY, throwaway Postgres database
# (never your real Supabase project). Example:
#   TEST_DATABASE_URL=postgres://postgres@localhost:5432/hideseek_test npm run test:db
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to an empty, throwaway Postgres database}"
cd "$(dirname "$0")/../.."
P="psql $TEST_DATABASE_URL -v ON_ERROR_STOP=1 -q"
$P -f game-db/tests/supabase-stub.sql
# Each part in order (a part that isn't there yet is skipped).
for f in game-db/001_hide_and_seek.sql \
         game-db/002_email_codes_and_city.sql \
         game-db/003_names_pins_chat.sql \
         game-db/004_moves_sweeps_bot_ads.sql \
         game-db/005_traps_freezes_notifications.sql \
         game-db/006_avatars_badges_balloons.sql \
         game-db/007_shields_payouts_passive.sql \
         game-db/008_badge_collection.sql \
         game-db/009_levels_powerups.sql \
         game-db/010_ads_sponsors.sql \
         game-db/011_badges_hard.sql \
         game-db/012_age_codes.sql \
         game-db/013_ads_v2.sql \
         game-db/014_chat_rooms.sql \
         game-db/015_ghost_rules.sql \
         game-db/016_place_rooms.sql \
         game-db/017_world_events.sql \
         game-db/018_npcs.sql \
         game-db/019_activities.sql \
         game-db/020_sports.sql game-db/021_hourly_rounds.sql game-db/022_pool_and_ads.sql game-db/023_houses.sql game-db/024_play_style.sql game-db/025_big_towns.sql; do
  [ -f "$f" ] || continue
  $P -f "$f"
done
$P -f game-db/tests/game.test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
for t in round4 round5 ads badges2 age ads2 rooms round6 rooms2 round7 npcs activities sports hourly pool houses style bigtown; do
  [ -f "game-db/tests/$t.test.sql" ] || continue
  $P -f "game-db/tests/$t.test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
done
