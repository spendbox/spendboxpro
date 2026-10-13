\set ON_ERROR_STOP on
-- Part 78: name your home (yours only; letters and numbers; empty puts back the plain name).
\ir ../078_home_name.sql
\ir ../078_home_name.sql
\o /dev/null
create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
create function pg_temp.fails(what text, p_code text, q text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'should fail: %', what;
exception when others then
  if sqlerrm like 'should fail%' then raise; end if;
  if sqlerrm not like p_code || '%' then raise exception 'FAILED: % gave "%" (expected %)', what, sqlerrm, p_code; end if;
  raise notice 'ok %: %', what, sqlerrm;
end $$;
insert into auth.users (email) values ('a@hn.test'), ('b@hn.test');
do $$
declare
  a uuid := pg_temp.uid('a@hn.test');
  b uuid := pg_temp.uid('b@hn.test');
  v jsonb;
begin
  v := life_start(a, 'lagos');
  v := life_start(b, 'lagos');
  v := starter_room_give(a, 'lagos', 'lagos:20,20/0', '{}'::jsonb, 'Room 1', 12, false);
  perform home_rename(a, 'lagos:20,20/0', 'Tolu''s Pad');
  perform pg_temp.check((select label from property_units where unit_id = 'lagos:20,20/0') = 'Tolu''s Pad', 'a free room can be named');
  perform pg_temp.fails('someone else can''t name it', 'not_yours', format('select home_rename(%L, ''lagos:20,20/0'', ''Mine'')', b));
  perform pg_temp.fails('a silly name is refused', 'bad_name', format('select home_rename(%L, ''lagos:20,20/0'', ''<b>x</b>'')', a));
  perform home_rename(a, 'lagos:20,20/0', null);
  perform pg_temp.check((select label from property_units where unit_id = 'lagos:20,20/0') = 'Room', 'an empty name puts back "Room"');
end $$;
\o
select 'all ok' as home_name;
