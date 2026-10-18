\set ON_ERROR_STOP on
-- Part 128: only the server runs the game's functions. A function left open (as part 97 left
-- event_open) is closed; one made afterwards starts closed; the server can still run them all.
create or replace function public.zz_open(p int) returns int language sql security definer as 'select p';
grant execute on function public.zz_open(int) to public, anon, authenticated;
\ir ../128_lock_down.sql
\ir ../128_lock_down.sql
create or replace function public.zz_later() returns int language sql as 'select 1';
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
               and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'))
  then raise exception 'FAILED: a function is still open to the public key'; end if;
  if not has_function_privilege('service_role', 'public.event_open(uuid, text, text, text, text, text, int, int, text, boolean, timestamptz, int, numeric, numeric, int, int, numeric, int, int)', 'execute') then raise exception 'FAILED: the server can run event_open'; end if;
  if not has_function_privilege('service_role', 'public.zz_later()', 'execute') then raise exception 'FAILED: the server can run a new one'; end if;
end $$;
drop function public.zz_open(int);
drop function public.zz_later();
\echo 'lock down: all ok'
