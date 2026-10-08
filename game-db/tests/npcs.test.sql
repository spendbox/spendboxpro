\set ON_ERROR_STOP on
-- Run part 18 again: it must be safe to re-run.
\ir ../018_npcs.sql
-- NPCs (part 18): gossips' real clues (rough, rare, never a ghost's own tile), generous NPCs'
-- gifts (capped), who may call what, and the books still balance.
create temp table books18 as select
  (select sum(created) - sum(burned) from coin_supply_daily) - ((select sum(coins+bonus_coins) from profiles)
   + (select value from game_state where key='carry') + (select coalesce(sum(pool),0) from rounds where status <> 'done')) as gap_before;
create temp table npc_settings_before as select key, value from game_settings where key like 'npc\_%';
update game_settings set value = 0 where key in ('search_cooldown_seconds', 'move_cooldown_seconds');

-- The tile at (x, y) really is the opposite of spiral_xy.
do $$ begin
  for i in 0..5000 loop
    assert public.npc_xy_tile((public.spiral_xy(i))[1], (public.spiral_xy(i))[2]) = i, format('npc_xy_tile wrong for tile %s', i);
  end loop;
  raise notice 'ok: npc_xy_tile undoes spiral_xy for tiles 0..5000';
end $$;

-- Only the server can call these.
do $$ begin
  assert not has_function_privilege('anon', 'public.npc_hint(uuid,text)', 'execute'), 'anon can ask for clues';
  assert not has_function_privilege('authenticated', 'public.npc_hint(uuid,text)', 'execute'), 'players can ask for clues directly';
  assert not has_function_privilege('authenticated', 'public.npc_gift(uuid,text)', 'execute'), 'players can ask for gifts directly';
  assert not has_function_privilege('anon', 'public.npc_gift(uuid,text)', 'execute'), 'anon can ask for gifts';
  assert has_function_privilege('service_role', 'public.npc_hint(uuid,text)', 'execute'), 'server cannot ask for clues';
  assert has_function_privilege('service_role', 'public.npc_gift(uuid,text)', 'execute'), 'server cannot ask for gifts';
  raise notice 'ok: only the server may call npc_hint / npc_gift';
end $$;

-- A fresh round: two ghosts (plus the bot) and a hunter.
update rounds set seek_ends_at = now() - interval '1s' where status = 'seek'; select tick();
select tick() as r18;
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
select pg_temp.set_coins(id, 20000) from profiles where email_key in ('bo@x.com', 'cy@x.com', 'ada@gmail.com');
do $$ begin
  perform join_round((select id from profiles where email_key='bo@x.com'),'hider');
  perform join_round((select id from profiles where email_key='cy@x.com'),'hider');
  perform join_round((select id from profiles where email_key='ada@gmail.com'),'seeker');
end $$;

-- Before the hunt starts, nobody knows anything (and nothing is decided yet).
do $$ declare a uuid := (select id from profiles where email_key='ada@gmail.com'); begin
  update game_settings set value = 1 where key = 'npc_hint_chance';
  assert public.npc_hint(a, 'npc:b:5:f2:1') is null, 'clue before the hunt';
  assert not exists (select 1 from npc_talks where user_id = a and kind = 'hint'), 'a clue was decided before the hunt';
  raise notice 'ok: no clues before the hunt';
end $$;

update rounds set join_ends_at = now() - interval '1s' where status = 'join'; select tick();

do $$
declare
  b uuid := (select id from profiles where email_key='bo@x.com');
  c uuid := (select id from profiles where email_key='cy@x.com');
  a uuid := (select id from profiles where email_key='ada@gmail.com');
  bot uuid := '00000000-0000-0000-0000-00000000b07a';
  r bigint := (select id from rounds where status = 'seek');
  res jsonb; again jsonb; centre int; about int; real_n int; i int; worst int := 0; crowded int := 0;
begin
  if to_regclass('public.world_events') is not null then execute 'delete from world_events where round_id = $1' using r; end if;
  update entries set tile = 100 where round_id = r and user_id = b;
  update entries set tile = 102 where round_id = r and user_id = c;   -- two ghosts close together
  update entries set tile = 300 where round_id = r and user_id = bot;

  -- A gossip who knows something: the middle of a 9×9 area near a ghost, never a ghost's own tile.
  res := public.npc_hint(a, 'npc:b:5:f2:1');
  assert res is not null, 'gossip with chance 1 knew nothing';
  centre := (res->>'tile')::int; about := (res->>'count')::int;
  assert (res->>'radius')::int = 4, 'clue area is not 9x9';
  assert centre not in (100, 102, 300), format('clue points at a ghost''s exact tile %s', centre);
  assert centre < (select tile_count from rounds where id = r), 'clue is off the map';
  select count(*) into real_n from entries where round_id = r and role = 'hider' and not caught and public.in_area(tile, centre, 4);
  assert real_n >= 1, 'no ghost inside the clue area';
  assert about >= 1 and abs(about - real_n) <= 1, format('"about %s" is too far from %s', about, real_n);
  raise notice 'ok: clue says about % ghost(s) (really %) around tile % - not a ghost''s own tile', about, real_n, centre;

  -- Asking the same NPC again this round: the same answer.
  again := public.npc_hint(a, 'npc:b:5:f2:1');
  assert (again->>'tile')::int = centre and (again->>'repeat')::boolean, 'same NPC gave a different clue';
  -- Any other NPC this round: nothing more (one real clue per player per round).
  assert public.npc_hint(a, 'npc:b:5:f2:2') is null, 'second real clue in one round';
  assert public.npc_hint(a, 'npc:v:train:12:0') is null, 'second real clue in one round (ride)';
  raise notice 'ok: one real clue per player per round, repeats give the same answer';

  -- An NPC who knew nothing stays that way for the round.
  update game_settings set value = 0 where key = 'npc_hint_chance';
  assert public.npc_hint(c, 'npc:balloon:3:0') is null, 'chance 0 gave a clue';
  update game_settings set value = 1 where key = 'npc_hint_chance';
  assert public.npc_hint(c, 'npc:balloon:3:0') is null, 'NPC changed their mind in the same round';
  -- A ghost asking hears about someone else, never about themselves.
  res := public.npc_hint(c, 'npc:b:9:r:4');
  assert res is not null, 'ghost got no clue';
  centre := (res->>'tile')::int;
  assert centre not in (100, 102, 300), 'clue on a ghost''s own tile (asked by a ghost)';
  assert exists (select 1 from entries where round_id = r and role = 'hider' and not caught and user_id <> c and public.in_area(tile, centre, 4)),
    'a ghost was told about themselves';
  raise notice 'ok: undecided NPCs stay quiet; a ghost hears about others';

  -- Asking too many NPCs: they all go quiet (and nothing more is written down).
  update game_settings set value = 0 where key = 'npc_hint_chance';
  update game_settings set value = 3 where key = 'npc_hint_asks_per_round';
  perform public.npc_hint(b, 'npc:b:1:g:0'); perform public.npc_hint(b, 'npc:b:1:g:1'); perform public.npc_hint(b, 'npc:b:1:g:2');
  update game_settings set value = 1 where key = 'npc_hint_chance';
  assert public.npc_hint(b, 'npc:b:1:g:3') is null, 'clue after the ask limit';
  assert (select count(*) from npc_talks where round_id = r and user_id = b and kind = 'hint') = 3, 'ask limit wrote extra rows';
  raise notice 'ok: at most % NPCs can be asked per round', 3;

  -- Lots of clues (limits lifted, the bot crowded in next to the ghosts so some areas hold 3):
  -- never on a ghost's tile, always a ghost inside, "about" within one.
  update entries set tile = 101 where round_id = r and user_id = bot;
  update game_settings set value = 100000 where key in ('npc_hints_per_round', 'npc_hint_asks_per_round');
  for i in 1..400 loop
    res := public.npc_hint(a, format('npc:b:%s:f%s:%s', 1000 + i, 1 + i % 50, i % 8));
    assert res is not null, format('no clue on try %s', i);
    centre := (res->>'tile')::int; about := (res->>'count')::int;
    assert not exists (select 1 from entries where round_id = r and role = 'hider' and not caught and tile = centre),
      format('try %s: clue on a ghost''s tile %s', i, centre);
    select count(*) into real_n from entries where round_id = r and role = 'hider' and not caught and public.in_area(tile, centre, 4);
    assert real_n >= 1, format('try %s: no ghost in the area around %s', i, centre);
    assert about >= 1 and abs(about - real_n) <= 1, format('try %s: about %s vs %s', i, about, real_n);
    worst := greatest(worst, abs(about - real_n));
    crowded := crowded + (real_n >= 3)::int;
  end loop;
  assert crowded > 0, 'no crowded area was tested';
  raise notice 'ok: 400 clues (% with 3 ghosts), none on a ghost''s tile, every area has a ghost, "about" off by at most %', crowded, worst;

  -- Bad ids are refused.
  begin
    perform public.npc_hint(a, 'npc:../etc:1');
    raise exception 'bad id accepted';
  exception when others then
    if sqlerrm <> 'bad_npc' then raise; end if;
  end;
  begin
    perform public.npc_gift(a, 'npc:b:1:g:9');
    raise exception 'bad id accepted';
  exception when others then
    if sqlerrm <> 'bad_npc' then raise; end if;
  end;
  begin
    perform public.npc_hint(bot, 'npc:b:1:g:0');
    raise exception 'bot accepted';
  exception when others then
    if sqlerrm <> 'no_player' then raise; end if;
  end;
  raise notice 'ok: bad NPC ids and the bot are refused';
end $$;

-- Gifts: 5–20 coins, once per NPC per round, at most 3 a day; logged as npc_gift.
do $$
declare
  a uuid := (select id from profiles where email_key='ada@gmail.com');
  b uuid := (select id from profiles where email_key='bo@x.com');
  res jsonb; before numeric; got numeric := 0;
begin
  update game_settings set value = 1 where key = 'npc_gift_chance';
  before := (select coins from profiles where id = a);
  res := public.npc_gift(a, 'npc:b:7:g:0');
  assert (res->>'coins')::numeric between 5 and 20, format('gift out of range: %s', res);
  got := got + (res->>'coins')::numeric;
  assert (select coins from profiles where id = a) = before + got, 'gift not added to coins';
  assert (select count(*) from ledger where user_id = a and kind = 'npc_gift') = 1, 'gift not in the ledger';
  -- The same NPC again this round: no.
  res := public.npc_gift(a, 'npc:b:7:g:0');
  assert (res->>'coins')::numeric = 0 and res->>'why' = 'already', format('second gift from the same NPC: %s', res);
  -- Two more NPCs: yes. A fourth today: no.
  got := got + (public.npc_gift(a, 'npc:b:7:g:1')->>'coins')::numeric;
  got := got + (public.npc_gift(a, 'npc:balloon:2:5')->>'coins')::numeric;
  res := public.npc_gift(a, 'npc:v:boat:3:1');
  assert (res->>'coins')::numeric = 0 and res->>'why' = 'daily_cap', format('fourth gift in a day: %s', res);
  assert (select count(*) from ledger where user_id = a and kind = 'npc_gift') = 3, 'more than 3 gifts in the ledger';
  assert (select sum(amount) from ledger where user_id = a and kind = 'npc_gift') = got, 'ledger does not match the gifts';
  assert (select coins from profiles where id = a) = before + got, 'coins do not match the gifts';
  raise notice 'ok: 3 gifts today worth % coins, then the daily cap', got;

  -- Unlucky: that NPC has decided for this round.
  update game_settings set value = 0 where key = 'npc_gift_chance';
  res := public.npc_gift(b, 'npc:b:8:f3:0');
  assert (res->>'coins')::numeric = 0 and res->>'why' = 'no_luck', format('no-luck gift: %s', res);
  update game_settings set value = 1 where key = 'npc_gift_chance';
  res := public.npc_gift(b, 'npc:b:8:f3:0');
  assert res->>'why' = 'already', 'NPC changed their mind about a gift';
  -- Asking too many NPCs in a day.
  update game_settings set value = 2 where key = 'npc_gift_asks_per_day';
  res := public.npc_gift(b, 'npc:b:8:f3:1');
  assert (res->>'coins')::numeric > 0, 'second ask should still be lucky';
  res := public.npc_gift(b, 'npc:b:8:f3:2');
  assert res->>'why' = 'tired', format('ask limit for gifts: %s', res);
  raise notice 'ok: unlucky NPCs stay unlucky for the round; ask limit per day';
end $$;

-- When the hunt is over, no more clues.
update rounds set seek_ends_at = now() - interval '1s' where status = 'seek'; select tick();
do $$ begin
  update game_settings set value = 1 where key = 'npc_hint_chance';
  assert public.npc_hint((select id from profiles where email_key='bo@x.com'), 'npc:b:77:g:0') is null, 'clue after the hunt';
  raise notice 'ok: no clues after the hunt';
end $$;

-- Put the NPC numbers back for the tests that follow.
update game_settings g set value = s.value from npc_settings_before s where g.key = s.key;

select gap_before, (select sum(created) - sum(burned) from coin_supply_daily) - ((select sum(coins+bonus_coins) from profiles)
  + (select value from game_state where key='carry') + (select coalesce(sum(pool),0) from rounds where status <> 'done')) as gap_after
  from books18;  -- must be equal
do $$ begin
  assert (select gap_before from books18) = (select sum(created) - sum(burned) from coin_supply_daily) - ((select sum(coins+bonus_coins) from profiles)
    + (select value from game_state where key='carry') + (select coalesce(sum(pool),0) from rounds where status <> 'done')), 'NPC gifts broke the books';
  raise notice 'ok: books balance after NPC gifts';
end $$;
