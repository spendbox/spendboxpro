\set ON_ERROR_STOP on
-- Part 25 (and 21): big towns stay fast. A two-million-spot town: dropping ghosts in, the
-- big search's 3x3 block and the bot's tantrum must not look at every spot.
\ir ../025_big_towns.sql
update rounds set join_ends_at = now() - interval '2 seconds' where status = 'join';
select tick() as make_sure;
update rounds set seek_ends_at = now() - interval '1 second' where status = 'seek';
select tick() as finish;
select tick() as next_game;
update rounds set tile_count = 2000000 where status = 'join';
insert into entries (round_id, user_id, role)
  select r.id, p.id, 'hider' from rounds r, profiles p
  where r.status = 'join' and p.email_key in ('bo@x.com', 'cy@x.com')
  on conflict do nothing;
update rounds set join_ends_at = now() - interval '1 second' where status = 'join';
do $$
declare t0 timestamptz := clock_timestamp(); r rounds; n int; d int;
begin
  perform tick();
  select * into r from rounds where status = 'seek';
  if r.id is null then raise exception 'the big game did not start'; end if;
  select count(*), count(distinct tile) into n, d from entries where round_id = r.id and role = 'hider';
  if n < 3 or d <> n then raise exception 'ghosts not placed on distinct spots (% ghosts, % spots)', n, d; end if;
  if exists (select 1 from entries where round_id = r.id and role = 'hider' and (tile is null or tile < 0 or tile >= r.tile_count)) then
    raise exception 'a ghost landed off the map';
  end if;
  raise notice 'ok: % ghosts dropped into a 2,000,000-spot town in % ms', n, round(extract(epoch from clock_timestamp() - t0) * 1000);
end $$;
-- The 3x3 block around a spot, worked out directly, matches the old "in_area" scan on a small town.
select (select array_agg(t order by t) from (
          select public.npc_xy_tile(c[1] + dx, c[2] + dy) t
          from (select public.spiral_xy(57) c) s, generate_series(-1, 1) dx, generate_series(-1, 1) dy) x)
     = (select array_agg(g order by g) from generate_series(0, 2000) g where public.in_area(g, 57, 1)) as block_matches;
-- The bot's tantrum: it runs to a random free spot, quickly.
do $$
declare t0 timestamptz; r rounds; before int; after int;
begin
  select * into r from rounds where status = 'seek';
  select tile into before from entries where round_id = r.id and user_id = '00000000-0000-0000-0000-00000000b07a';
  insert into world_events (round_id, key, tile, starts_at, ends_at) values (r.id, 'bot_tantrum', 0, now() - interval '1 second', now() + interval '1 minute');
  t0 := clock_timestamp();
  perform world_event_tick();
  select tile into after from entries where round_id = r.id and user_id = '00000000-0000-0000-0000-00000000b07a';
  raise notice 'ok: bot tantrum moved the bot: % (% ms)', after is distinct from before, round(extract(epoch from clock_timestamp() - t0) * 1000);
end $$;
-- Back to a normal-sized town for anything that runs after this.
update rounds set tile_count = 460 where status = 'seek';
update entries e set tile = (e.tile % 460) from rounds r where r.id = e.round_id and r.status = 'seek' and e.role = 'hider';
