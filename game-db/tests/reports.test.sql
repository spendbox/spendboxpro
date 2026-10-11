\set ON_ERROR_STOP on
-- Part 45: map reports. A few a day; not the same spot twice while open; the owner marks them and
-- the reporter hears back when fixed.
\ir ../045_map_reports.sql
\ir ../045_map_reports.sql
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

insert into auth.users (email) values ('r1@rep.test');

do $$
declare
  a uuid := pg_temp.uid('r1@rep.test');
  id bigint;
begin
  id := map_report(a, 'lagos', 10, 20, 6.5, 3.4, 'road', 'The road stops in the middle of nowhere', 'Road: Herbert Macaulay Way');
  perform pg_temp.fails('not the same spot twice', 'already', format('select map_report(%L, %L, 10, 20, 6.5, 3.4, %L, null, null)', a, 'lagos', 'road'));
  perform map_report(a, 'lagos', 11, 20, 6.5, 3.4, 'name', null, null);
  perform map_report(a, 'lagos', 12, 20, 6.5, 3.4, 'water', null, null);
  perform map_report(a, 'lagos', 13, 20, 6.5, 3.4, 'other', null, null);
  perform map_report(a, 'lagos', 14, 20, 6.5, 3.4, 'other', null, null);
  perform pg_temp.fails('a few a day', 'too_many', format('select map_report(%L, %L, 15, 20, 6.5, 3.4, %L, null, null)', a, 'lagos', 'road'));
  perform pg_temp.check(jsonb_array_length(map_reports_list('open')) = 5, 'the owner sees them');
  perform map_report_set(id, 'fixed', 'Herbert Macaulay Way now runs all the way');
  perform pg_temp.check(jsonb_array_length(map_reports_list('open')) = 4, 'fixed ones leave the open list');
  perform pg_temp.check(exists (select 1 from notifications where user_id = a and kind = 'map_report'), 'the reporter hears back');
end $$;

\o
select 'reports: all checks passed' as result;
