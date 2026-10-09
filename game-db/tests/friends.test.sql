\set ON_ERROR_STOP on
-- Part 26: friends. Asking, saying yes (or asking back), the lists each side sees, removing
-- (and turning down), names to search, the limits, who can't have friends, notifications,
-- running part 26 again, and that nothing here is open to the app's clients.
-- Run part 26 again first: it must be safe to re-run.
\ir ../026_friends.sql
-- Only the 'ok …' lines are printed (query results go nowhere).
\o /dev/null

create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
-- Stops the run with FAILED when something isn't right, and prints 'ok <what>' when it is.
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
-- Prints 'ok <what>: <error>' when the call fails as it should (and the error starts with p_code).
create function pg_temp.fails(what text, p_code text, q text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'should fail: %', what;
exception when others then
  if sqlerrm like 'should fail%' then raise; end if;
  if sqlerrm not like p_code || '%' then raise exception 'FAILED: % gave "%" (expected %)', what, sqlerrm, p_code; end if;
  raise notice 'ok %: %', what, sqlerrm;
end $$;
-- Names in a friends_of list ('incoming', 'outgoing' or 'friends'), sorted, comma-separated.
create function pg_temp.names(u uuid, k text) returns text language sql as $$
  select coalesce(string_agg(x->>'name', ',' order by x->>'name'), '') from jsonb_array_elements(friends_of(u)->k) x
$$;

insert into auth.users (email) values ('f1@friends.test'), ('f2@friends.test'), ('f3@friends.test'), ('f4@friends.test'),
                                      ('f5@friends.test'), ('f6@friends.test');
update profiles set username = 'Qxamaka' where email_key = 'f1@friends.test';
update profiles set username = 'Qxbayo' where email_key = 'f2@friends.test';
update profiles set username = 'Qxchioma' where email_key = 'f3@friends.test';
update profiles set username = 'Qxamadi' where email_key = 'f4@friends.test';
update profiles set username = 'Qxfela', frozen = true where email_key = 'f5@friends.test';
-- f6 has no player name yet.

-- ============================================================ asking and saying yes
do $$
declare a uuid := pg_temp.uid('f1@friends.test'); b uuid := pg_temp.uid('f2@friends.test'); c uuid := pg_temp.uid('f3@friends.test'); res jsonb;
begin
  res := friend_request(a, b);
  perform pg_temp.check(res->>'status' = 'pending', 'asking someone sends a request');
  perform pg_temp.check(pg_temp.names(a, 'outgoing') = 'Qxbayo' and pg_temp.names(a, 'friends') = '' and pg_temp.names(b, 'incoming') = 'Qxamaka',
    'Amaka sees her request to Bayo; Bayo sees it waiting for him');
  perform pg_temp.check((select count(*) from notifications where user_id = b and kind = 'friend' and body like 'Qxamaka wants to be your friend%') = 1,
    'Bayo gets a notification');
  res := friend_request(a, b);
  perform pg_temp.check(res->>'status' = 'pending' and (select count(*) from friendships) = 1, 'asking twice changes nothing');
  res := friend_accept(b, a);
  perform pg_temp.check(res->>'status' = 'friends', 'Bayo says yes');
  perform pg_temp.check(pg_temp.names(a, 'friends') = 'Qxbayo' and pg_temp.names(b, 'friends') = 'Qxamaka'
    and pg_temp.names(a, 'outgoing') = '' and pg_temp.names(b, 'incoming') = '', 'now friends on both sides, no requests left');
  perform pg_temp.check((select count(*) from notifications where user_id = a and kind = 'friend' and body like 'Qxbayo is your friend now%') = 1,
    'Amaka hears Bayo said yes');
  perform pg_temp.check((friends_of(a)->'friends'->0->>'level')::int >= 1 and friends_of(a)->'friends'->0->>'since' is not null,
    'the list has level and since');
  res := friend_request(b, a);
  perform pg_temp.check(res->>'status' = 'friends' and (select count(*) from friendships) = 1, 'asking a friend again: already friends');
  -- Asking back is a yes.
  res := friend_request(c, a);
  perform pg_temp.check(res->>'status' = 'pending', 'Chioma asks Amaka');
  res := friend_request(a, c);
  perform pg_temp.check(res->>'status' = 'friends' and pg_temp.names(a, 'friends') = 'Qxbayo,Qxchioma', 'Amaka asking back makes them friends');
  perform pg_temp.check((select count(*) from friendships) = 2, 'still one row per pair');
end $$;

-- ============================================================ removing and turning down
do $$
declare a uuid := pg_temp.uid('f1@friends.test'); b uuid := pg_temp.uid('f2@friends.test'); d uuid := pg_temp.uid('f4@friends.test'); res jsonb;
begin
  res := friend_remove(b, a);
  perform pg_temp.check((res->>'removed')::boolean and pg_temp.names(a, 'friends') = 'Qxchioma' and pg_temp.names(b, 'friends') = '',
    'either side can remove a friend');
  res := friend_remove(b, a);
  perform pg_temp.check(not (res->>'removed')::boolean, 'removing again does nothing');
  perform friend_request(d, a);
  res := friend_remove(a, d);
  perform pg_temp.check((res->>'removed')::boolean and pg_temp.names(a, 'incoming') = '' and pg_temp.names(d, 'outgoing') = '', 'turning a request down');
  perform pg_temp.fails('saying yes to nothing', 'no_request', format('select friend_accept(%L, %L)', a, d));
  perform friend_request(d, a);
  res := friend_remove(d, a);
  perform pg_temp.check((res->>'removed')::boolean and pg_temp.names(a, 'incoming') = '', 'cancelling your own request');
end $$;

-- ============================================================ who can't
select pg_temp.fails('asking yourself', 'self', format('select friend_request(%L, %L)', pg_temp.uid('f1@friends.test'), pg_temp.uid('f1@friends.test')));
select pg_temp.fails('asking the bot', 'bot', format('select friend_request(%L, %L)', pg_temp.uid('f1@friends.test'), '00000000-0000-0000-0000-00000000b07a'));
select pg_temp.fails('asking a paused player', 'frozen', format('select friend_request(%L, %L)', pg_temp.uid('f1@friends.test'), pg_temp.uid('f5@friends.test')));
select pg_temp.fails('a paused player asking', 'frozen', format('select friend_request(%L, %L)', pg_temp.uid('f5@friends.test'), pg_temp.uid('f1@friends.test')));
select pg_temp.fails('asking someone with no name yet', 'no_player', format('select friend_request(%L, %L)', pg_temp.uid('f1@friends.test'), pg_temp.uid('f6@friends.test')));
select pg_temp.fails('asking nobody', 'no_player', format('select friend_request(%L, %L)', pg_temp.uid('f1@friends.test'), '00000000-0000-0000-0000-000000000001'));
select pg_temp.fails('nobody asking', 'unknown_player', format('select friend_request(%L, %L)', '00000000-0000-0000-0000-000000000001', pg_temp.uid('f1@friends.test')));

-- ============================================================ limits
update game_settings set value = 2 where key = 'friend_requests_per_day';
select friend_request(pg_temp.uid('f4@friends.test'), pg_temp.uid('f2@friends.test'));
select friend_request(pg_temp.uid('f4@friends.test'), pg_temp.uid('f3@friends.test'));
select pg_temp.fails('too many requests in a day', 'too_many_requests:2', format('select friend_request(%L, %L)', pg_temp.uid('f4@friends.test'), pg_temp.uid('f1@friends.test')));
update game_settings set value = 40 where key = 'friend_requests_per_day';
update game_settings set value = 2 where key = 'friends_max';
select pg_temp.fails('too many friends and requests', 'too_many_friends:2', format('select friend_request(%L, %L)', pg_temp.uid('f4@friends.test'), pg_temp.uid('f1@friends.test')));
update game_settings set value = 300 where key = 'friends_max';
select friend_remove(pg_temp.uid('f4@friends.test'), pg_temp.uid('f2@friends.test'));
select friend_remove(pg_temp.uid('f4@friends.test'), pg_temp.uid('f3@friends.test'));

-- ============================================================ finding people
select pg_temp.check((select string_agg(x->>'name', ',') from jsonb_array_elements(find_players(pg_temp.uid('f2@friends.test'), ' QXAMA ')) x) = 'Qxamadi,Qxamaka',
  'search by name (any case, starts-with first, then shorter names)');
select pg_temp.check(jsonb_array_length(find_players(pg_temp.uid('f1@friends.test'), 'qxama')) = 1, 'you don''t find yourself');
select pg_temp.check(jsonb_array_length(find_players(pg_temp.uid('f1@friends.test'), 'a')) = 0, 'one letter finds nobody');
select pg_temp.check(jsonb_array_length(find_players(pg_temp.uid('f1@friends.test'), 'qxfela')) = 0, 'paused players aren''t found');
select pg_temp.check((select string_agg(x->>'name', ',') from jsonb_array_elements(find_players(pg_temp.uid('f1@friends.test'), 'xchiom')) x) = 'Qxchioma',
  'search inside names too');

-- ============================================================ running part 26 again
update game_settings set value = 77 where key = 'friends_max';
create temp table before_rerun as select count(*) as n from friendships;
\ir ../026_friends.sql
\o /dev/null
select pg_temp.check((select count(*) from friendships) = n, 'part 26 re-run keeps every friendship') from before_rerun;
select pg_temp.check(setting('friends_max') = 77, 'part 26 re-run keeps changed settings');
update game_settings set value = 300 where key = 'friends_max';

-- ============================================================ privacy
select pg_temp.check(not has_table_privilege('anon', 'public.friendships', 'select')
  and not has_table_privilege('authenticated', 'public.friendships', 'select')
  and has_table_privilege('service_role', 'public.friendships', 'insert')
  and (select relrowsecurity from pg_class where oid = 'public.friendships'::regclass),
  'friendships are server-only (RLS on, no access for anon or signed-in clients)');
select pg_temp.check(not has_function_privilege('authenticated', 'public.friend_request(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.friends_of(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.find_players(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.friend_remove(uuid,uuid)', 'execute'),
  'friend functions are server-only');
\o
