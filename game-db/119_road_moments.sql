-- Newtown, part 119: more moments on the road. A road moment (the trip film, docs/TRIPS.md) only
-- waits for the last road moment now (5 minutes), not for any moment: a street moment every 12 to
-- 18 minutes had been keeping almost every trip quiet. Street moments still wait for any moment,
-- and the daily cap still counts them all together.
--
-- Safe to run more than once. Run after part 118.

create or replace function public.moment_open(p_user uuid, p_moment text, p_vars jsonb, p_spot text, p_gap int, p_per_day int, p_follow bigint default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_last timestamptz;
  v_today int;
  v_id bigint;
begin
  perform 1 from public.profiles where id = p_user for update;
  if p_spot = 'road' then
    select max(created_at) into v_last from public.moments where user_id = p_user and spot = 'road';
  else
    select max(created_at) into v_last from public.moments where user_id = p_user;
  end if;
  if v_last is not null and v_last > now() - make_interval(secs => greatest(0, p_gap)) then raise exception 'too_soon'; end if;
  select count(*) into v_today from public.moments where user_id = p_user and created_at >= date_trunc('day', now());
  if v_today >= p_per_day then raise exception 'daily_cap'; end if;
  update public.moments set answered_at = now(), choice = -1 where user_id = p_user and answered_at is null;
  if p_follow is not null then delete from public.moment_followups where id = p_follow and user_id = p_user; end if;
  insert into public.moments (user_id, moment, vars, spot) values (p_user, left(p_moment, 40), coalesce(p_vars, '{}'::jsonb), left(coalesce(p_spot, 'street'), 20))
    returning id into v_id;
  return v_id;
end $$;

revoke all on function public.moment_open(uuid, text, jsonb, text, int, int, bigint) from public, anon, authenticated;
grant execute on function public.moment_open(uuid, text, jsonb, text, int, int, bigint) to service_role;
