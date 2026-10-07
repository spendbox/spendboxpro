-- HIDE & SEEK, part 6: avatars, names on moves and catches, a calmer bot that teases in chat,
-- badges, coin balloons and visitor counts.
-- Run once in Supabase → SQL Editor, after 005_traps_freezes_notifications.sql.

insert into public.game_settings (key, value, note) values
  ('bot_max_moves', 3, 'The bot moves at most this many times a round, and only when swept'),
  ('bot_teases', 2, 'How many times the bot taunts the City chat each round'),
  ('balloon_coins', 5, 'Coins in each coin balloon'),
  ('balloons_per_day', 10, 'Most coin balloons one player can pop per day'),
  ('balloon_minutes', 4, 'A new coin balloon can drift by every this many minutes')
on conflict (key) do nothing;

-- ============================================================ avatars
-- A face each player designs (skin, hair, eyes, clothes...). Stored as a small JSON object.
alter table public.profiles add column if not exists avatar jsonb;

-- ============================================================ chat from the bot
alter table public.rounds add column if not exists bot_teases int not null default 0;

create or replace function public.move_hider(p_user uuid, p_tile int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  v_bot boolean;
  v_fee numeric := public.setting('second_move_fee');
  v_cool int := public.setting('move_cooldown_seconds')::int;
  v_frac numeric;
  v_cap int;
  v_old int;
  v_wait int;
  v_traps int := 0;
  t record;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'You can only move while the search is on'; end if;
  select * into e from public.entries where round_id = r.id and user_id = p_user and role = 'hider' for update;
  if not found then raise exception 'You are not hiding in this round'; end if;
  if e.caught then raise exception 'You have been caught'; end if;
  if e.frozen_until is not null and e.frozen_until > now() then
    raise exception 'A drone has you pinned. You can move in % seconds',
      ceil(extract(epoch from (e.frozen_until - now())))::int;
  end if;
  if e.last_move_at is not null and e.last_move_at > now() - make_interval(secs => v_cool) then
    v_wait := ceil(extract(epoch from (e.last_move_at + make_interval(secs => v_cool) - now())))::int;
    raise exception 'You can move again in % seconds', v_wait;
  end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That spot is not in the city'; end if;
  if p_tile = e.tile then raise exception 'You are already there'; end if;
  if p_tile = any(e.visited) then raise exception 'You can''t go back to a spot you''ve already left'; end if;

  v_frac := r.searched_count::numeric / greatest(r.tile_count, 1);
  if v_frac < public.setting('unlock_fraction')
     and exists (select 1 from public.searches where round_id = r.id and tile = p_tile) then
    raise exception 'That spot has already been searched. Pick somewhere else';
  end if;
  v_cap := least(public.setting('max_hiders_per_tile')::int, 1 + floor(v_frac * public.setting('max_hiders_per_tile'))::int);
  if (select count(*) from public.entries
      where round_id = r.id and role = 'hider' and not caught and tile = p_tile) >= v_cap then
    raise exception 'That spot is full';
  end if;

  select is_bot into v_bot from public.profiles where id = p_user;
  update public.profiles set coins = coins - v_fee where id = p_user and coins >= v_fee;
  if not found then raise exception 'You need % coins to move', v_fee; end if;
  perform public.log_coins(p_user, r.id, 'move_fee', -v_fee);
  update public.rounds set pool = pool + v_fee where id = r.id;

  v_old := e.tile;
  update public.entries set
      tile = p_tile,
      moves = moves + 1,
      stake_weight = stake_weight + case when v_bot then 0 else v_fee end,
      visited = array_append(visited, v_old),
      last_move_at = now()
    where round_id = r.id and user_id = p_user;
  -- Everyone sees who slipped away (so they can be chased, or messaged).
  insert into public.events (round_id, kind, tile, detail)
    values (r.id, 'moved', v_old, jsonb_build_object('name',
      case when v_bot then (select bot_name from public.rounds where id = r.id) else (select username from public.profiles where id = p_user) end,
      'user', case when v_bot then null else p_user end, 'bot', v_bot));

  -- Drone traps: each seeker's latest sweeps keep watching. Walking into one is detected.
  for t in
    select s.id, s.seeker_id, s.tile, s.radius from (
      select sw.*, row_number() over (partition by sw.seeker_id order by sw.id desc) rn
      from public.sweeps sw where sw.round_id = r.id
    ) s
    where s.rn <= public.setting('traps_per_seeker') and public.in_area(p_tile, s.tile, s.radius)
  loop
    v_traps := v_traps + 1;
    perform public.notify(t.seeker_id, r.id, 'trap', 'Your drone trap just picked up someone moving into its area!', t.tile);
  end loop;
  if v_traps > 0 then
    perform public.notify(p_user, r.id, 'trapped',
      case when v_traps = 1 then 'You walked into a drone trap. The seeker who set it knows someone''s there.'
           else format('You walked into %s drone traps. Their seekers know someone''s there.', v_traps) end,
      p_tile);
  end if;
  return jsonb_build_object('moved_to', p_tile, 'fee', v_fee, 'trapped', v_traps, 'cooldown', v_cool);
end $$;

create or replace function public.search_tile(p_user uuid, p_tile int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  en public.entries;
  v_cost numeric;
  v_bonus_used numeric;
  v_real numeric;
  v_caught int := 0;
  v_reward numeric := 0;
  v_n int := 0;
  v_bot_found boolean := false;
  v_found jsonb := '[]'::jsonb;
  v_before boolean;
  h record;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Seeking is not open right now'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That spot is not in the city'; end if;
  select * into p from public.profiles where id = p_user for update;
  if p.frozen then raise exception 'This account is frozen'; end if;
  select * into en from public.entries where round_id = r.id and user_id = p_user;
  if found and en.role = 'hider' then raise exception 'Hiders cannot search'; end if;
  if not found then perform public.join_round(p_user, 'seeker'); select * into p from public.profiles where id = p_user; end if;

  v_before := exists (select 1 from public.searches where round_id = r.id and tile = p_tile);

  if p.free_search_day is distinct from current_date then
    v_cost := 0;
    update public.profiles set free_search_day = current_date where id = p_user;
  else
    v_cost := public.search_price(r.searched_count, r.tile_count);
  end if;

  v_bonus_used := least(p.bonus_coins, v_cost);
  v_real := v_cost - v_bonus_used;
  if p.coins < v_real then raise exception 'Not enough coins (a search costs %)', v_cost; end if;
  if v_cost > 0 then
    update public.profiles set bonus_coins = bonus_coins - v_bonus_used, coins = coins - v_real where id = p_user;
    if v_bonus_used > 0 then
      perform public.log_coins(p_user, r.id, 'search_fee', -v_bonus_used, true);
      perform public.burn(r.id, v_bonus_used, 'search fee (bonus)', true);
    end if;
    if v_real > 0 then
      perform public.log_coins(p_user, r.id, 'search_fee', -v_real);
      update public.rounds set pool = pool + v_real where id = r.id;
    end if;
    update public.entries set real_spent = real_spent + v_real where round_id = r.id and user_id = p_user;
  end if;

  for h in
    select e.user_id, pr.is_bot from public.entries e
    join public.profiles pr on pr.id = e.user_id
    where e.round_id = r.id and e.role = 'hider' and not e.caught and e.tile = p_tile
    order by pr.is_bot desc, e.created_at, e.user_id
  loop
    if not h.is_bot then v_n := v_n + 1; else v_bot_found := true; end if;
    v_caught := v_caught + 1;
    v_reward := v_reward + public.catch_hider(r.id, h.user_id, p_user, greatest(v_n, 1));
    v_found := v_found || jsonb_build_array(jsonb_build_object(
      'name', case when h.is_bot then r.bot_name else (select username from public.profiles where id = h.user_id) end,
      'avatar', case when h.is_bot then null else (select avatar from public.profiles where id = h.user_id) end,
      'bot', h.is_bot));
    perform public.notify(h.user_id, r.id, 'caught', format('%s found you. Better luck next round!', coalesce(p.username, 'A seeker')), p_tile);
  end loop;

  insert into public.searches (round_id, tile, seeker_id, cost, caught) values (r.id, p_tile, p_user, v_cost, v_caught);
  update public.rounds set
      searched_count = searched_count + case when v_before then 0 else 1 end,
      hiders_remaining = hiders_remaining - v_caught
    where id = r.id;
  insert into public.events (round_id, kind, tile) values (r.id, 'searched', p_tile);
  if v_caught > 0 then
    insert into public.events (round_id, kind, tile, detail)
      values (r.id, 'caught', p_tile, jsonb_build_object('how', 'search', 'finder', p.username, 'count', v_caught, 'bot', v_bot_found, 'hiders', v_found));
  end if;
  if r.hiders_remaining - v_caught <= 0 then perform public.finalize_round(r.id); end if;

  return jsonb_build_object('result', case when v_caught > 0 then 'caught' else 'empty' end,
                            'cost', v_cost, 'caught', v_caught, 'reward', v_reward, 'bot', v_bot_found,
                            'searched_before', v_before);
end $$;

create or replace function public.bot_think(p_round bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
  e public.entries;
  r public.rounds;
  v_tile int;
  v_try int := 0;
  v_swept boolean;
begin
  select * into r from public.rounds where id = p_round;
  select * into e from public.entries where round_id = p_round and user_id = v_bot;
  if not found or e.caught or r.status <> 'seek' then return 'idle'; end if;
  if e.frozen_until is not null and e.frozen_until > now() then return 'pinned'; end if;
  if e.last_move_at is not null and e.last_move_at > now() - make_interval(secs => public.setting('move_cooldown_seconds')::int) then
    return 'cooling down';
  end if;
  -- The bot only runs when a drone has swept it, and at most a few times a round.
  v_swept := e.last_swept_at is not null and e.last_swept_at > coalesce(e.last_move_at, '-infinity'::timestamptz);
  if not v_swept then return 'staying'; end if;
  if e.moves >= public.setting('bot_max_moves') then return 'out of moves'; end if;
  if (select coins from public.profiles where id = v_bot) < public.setting('second_move_fee') then return 'broke'; end if;
  loop
    v_try := v_try + 1;
    exit when v_try > 40;
    v_tile := floor(random() * r.tile_count)::int;
    continue when v_tile = e.tile or v_tile = any(e.visited);
    continue when exists (select 1 from public.searches where round_id = p_round and tile = v_tile);
    continue when exists (select 1 from public.entries where round_id = p_round and role = 'hider' and not caught and tile = v_tile);
    perform public.move_hider(v_bot, v_tile);
    return 'fled a sweep';
  end loop;
  return 'no tile';
end $$;

-- The bot pipes up in the City chat a couple of times a round, while it's still hidden.
-- Messages are stitched together from pieces so they rarely repeat.
create or replace function public.bot_tease(p_round bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  v_due timestamptz;
  v_open text[] := array['Psst.', 'Hello, detectives.', 'Still looking?', 'Ahem.', 'Knock knock.', 'Is it hot in here or is it just me?',
    'Breaking news:', 'Fun fact:', 'Hmm.', 'Okay, okay.', 'Dear seekers,', 'Quick update from the shadows:'];
  v_mid text[] := array[
    'I can hear you tapping the wrong roofs.', 'I''ve had %s coins of searches walk right past me.', 'The pool is %s coins. Imagine.',
    'You''ve checked %s spots and I''m still comfy.', 'I can see a drone. It can''t see me.', 'I''m closer than you think. Or am I?',
    'Somebody just searched next door. Rude.', '%s minutes left and I''ve barely broken a sweat.', 'My hiding spot has a lovely view.',
    'I''ve moved %s times. Or have I?', 'Try the tall buildings. Actually, don''t.', 'There are %s of you and one of me.'];
  v_end text[] := array['😏', '🙈', 'Toodles!', 'Catch me if you can.', 'Not even warm.', 'Good luck with that.', 'Tick tock.', '👀',
    'I believe in you. Sort of.', 'Back to my nap.', ''];
  v_mid_pick text;
  v_body text;
  v_seekers int;
begin
  select * into r from public.rounds where id = p_round;
  if r.status <> 'seek' or r.bot_teases >= public.setting('bot_teases') then return 'quiet'; end if;
  select * into e from public.entries where round_id = p_round and user_id = '00000000-0000-0000-0000-00000000b07a';
  if not found or e.caught then return 'quiet'; end if;
  -- Spread the teases over the hunt: the first after ~8-15 min, the next after ~30-40 min.
  v_due := r.join_ends_at + make_interval(mins => (case when r.bot_teases = 0 then 8 + (r.id % 8) else 30 + (r.id % 11) end)::int);
  if now() < v_due then return 'waiting'; end if;
  select count(*) into v_seekers from public.entries where round_id = p_round and role = 'seeker';
  v_mid_pick := v_mid[1 + floor(random() * array_length(v_mid, 1))::int];
  v_body := format(v_mid_pick,
    case
      when v_mid_pick like '%%coins of searches%%' then (select coalesce(round(sum(cost)), 0)::text from public.searches where round_id = p_round)
      when v_mid_pick like '%%pool%%' then round(r.pool)::text
      when v_mid_pick like '%%checked%%' then r.searched_count::text
      when v_mid_pick like '%%minutes left%%' then greatest(1, ceil(extract(epoch from (r.seek_ends_at - now())) / 60))::text
      when v_mid_pick like '%%moved%%' then e.moves::text
      when v_mid_pick like '%%of you%%' then greatest(v_seekers, 2)::text
      else ''
    end);
  v_body := trim(v_open[1 + floor(random() * array_length(v_open, 1))::int] || ' ' || v_body || ' ' ||
                 v_end[1 + floor(random() * array_length(v_end, 1))::int]);
  insert into public.chat_messages (round_id, sender_id, sender_name, sender_role, body)
    values (p_round, '00000000-0000-0000-0000-00000000b07a', coalesce(r.bot_name, 'The bot') || ' (bot)', 'hider', left(v_body, 500));
  update public.rounds set bot_teases = bot_teases + 1 where id = p_round;
  return 'teased';
end $$;

-- The round clock now also gives the bot its say in chat.
create or replace function public.tick_with_extras() returns text
language plpgsql security definer set search_path = public as $$
declare v text; r public.rounds;
begin
  v := public.tick();
  select * into r from public.rounds where status = 'seek';
  if found then
    begin
      v := v || ' / chat: ' || public.bot_tease(r.id);
    exception when others then
      v := v || ' / chat error: ' || sqlerrm;
    end;
  end if;
  return v;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('hideseek-tick');
    perform cron.schedule('hideseek-tick', '* * * * *', 'select public.tick_with_extras()');
  end if;
exception when others then
  raise notice 'pg_cron not updated (%)', sqlerrm;
end $$;

-- ============================================================ badges
-- Earned in a round and kept for good. Players can share them.
create table if not exists public.badges (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  round_id bigint references public.rounds (id) on delete set null,
  badge text not null,
  detail text,
  earned_at timestamptz not null default now(),
  unique (user_id, round_id, badge)
);
create index if not exists badges_user_idx on public.badges (user_id, earned_at desc);
alter table public.badges enable row level security;

create or replace function public.award_badges(p_round bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
  v_n int := 0;
  v_first uuid;
  v_survivors int;
begin
  -- Survivors: made it to the end without being caught.
  select count(*) into v_survivors from public.entries where round_id = p_round and role = 'hider' and not caught and user_id <> v_bot;
  insert into public.badges (user_id, round_id, badge, detail)
    select user_id, p_round, 'survivor', 'Stayed hidden till the end' from public.entries
    where round_id = p_round and role = 'hider' and not caught and user_id <> v_bot
  on conflict do nothing;
  insert into public.badges (user_id, round_id, badge, detail)
    select user_id, p_round, 'ghost', 'Survived without moving once' from public.entries
    where round_id = p_round and role = 'hider' and not caught and user_id <> v_bot and moves = 0
  on conflict do nothing;
  insert into public.badges (user_id, round_id, badge, detail)
    select user_id, p_round, 'escape_artist', format('Survived after %s moves', moves) from public.entries
    where round_id = p_round and role = 'hider' and not caught and user_id <> v_bot and moves >= 3
  on conflict do nothing;
  if v_survivors = 1 then
    insert into public.badges (user_id, round_id, badge, detail)
      select user_id, p_round, 'last_standing', 'The only hider left standing' from public.entries
      where round_id = p_round and role = 'hider' and not caught and user_id <> v_bot
    on conflict do nothing;
  end if;
  -- Finders.
  insert into public.badges (user_id, round_id, badge, detail)
    select caught_by, p_round, 'bot_hunter', 'Found the bot' from public.entries
    where round_id = p_round and user_id = v_bot and caught and caught_by is not null
  on conflict do nothing;
  insert into public.badges (user_id, round_id, badge, detail)
    select caught_by, p_round, 'hat_trick', format('Caught %s hiders in one round', count(*)) from public.entries
    where round_id = p_round and caught and caught_by is not null and user_id <> v_bot
    group by caught_by having count(*) >= 3
  on conflict do nothing;
  select seeker_id into v_first from public.searches where round_id = p_round and caught > 0 order by created_at limit 1;
  if v_first is not null then
    insert into public.badges (user_id, round_id, badge, detail) values (v_first, p_round, 'first_blood', 'First catch of the round')
    on conflict do nothing;
  end if;
  insert into public.badges (user_id, round_id, badge, detail)
    select s.seeker_id, p_round, 'sharpshooter', 'Found someone with their very first search' from public.searches s
    where s.round_id = p_round and s.caught > 0
      and s.id = (select min(id) from public.searches s2 where s2.round_id = p_round and s2.seeker_id = s.seeker_id)
  on conflict do nothing;
  insert into public.badges (user_id, round_id, badge, detail)
    select user_id, p_round, 'trapper', 'A drone trap caught someone sneaking in' from public.notifications
    where round_id = p_round and kind = 'trap' group by user_id
  on conflict do nothing;
  insert into public.badges (user_id, round_id, badge, detail)
    select user_id, p_round, 'big_win', format('Won %s coins in one round', round(sum(amount)))
    from public.ledger where round_id = p_round and user_id is not null and user_id <> v_bot
      and kind in ('catch_reward', 'bot_bounty', 'pool_hider', 'pool_seeker')
    group by user_id having sum(amount) >= 300
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Badges are handed out as each round finishes.
create or replace function public.badges_on_finish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    perform public.award_badges(new.id);
  end if;
  return new;
exception when others then
  raise warning 'badges failed: %', sqlerrm;
  return new;
end $$;
drop trigger if exists rounds_award_badges on public.rounds;
create trigger rounds_award_badges after update of status on public.rounds
  for each row execute function public.badges_on_finish();

-- ============================================================ coin balloons
-- Now and then a balloon carrying coins drifts by, just for one player. Popping it pays a few
-- coins, up to a daily limit. Each (player, day, slot) can only be claimed once.
create table if not exists public.balloon_claims (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  slot int not null,
  coins numeric(14,2) not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day, slot)
);
alter table public.balloon_claims enable row level security;

create or replace function public.claim_balloon(p_user uuid, p_slot int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_coins numeric := public.setting('balloon_coins');
  v_today int;
begin
  select count(*) into v_today from public.balloon_claims where user_id = p_user and day = current_date;
  if v_today >= public.setting('balloons_per_day') then raise exception 'That''s all the coin balloons for today. More tomorrow!'; end if;
  insert into public.balloon_claims (user_id, day, slot, coins) values (p_user, current_date, p_slot, v_coins);
  update public.profiles set coins = coins + v_coins where id = p_user;
  perform public.log_coins(p_user, null, 'balloon', v_coins);
  return jsonb_build_object('coins', v_coins, 'left_today', public.setting('balloons_per_day') - v_today - 1);
exception when unique_violation then
  raise exception 'Someone already popped that one';
end $$;

create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding', 'balloon')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ visitor count
create table if not exists public.site_counters (key text primary key, value bigint not null default 0);
insert into public.site_counters (key, value) values ('visits', 0) on conflict do nothing;
alter table public.site_counters enable row level security;

create or replace function public.count_visit() returns bigint
language sql security definer set search_path = public as $$
  update public.site_counters set value = value + 1 where key = 'visits' returning value;
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('move_hider', 'search_tile', 'bot_think', 'bot_tease', 'tick_with_extras', 'award_badges', 'badges_on_finish', 'claim_balloon', 'count_visit')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
