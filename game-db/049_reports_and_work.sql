-- Newtown, part 49: reports about people, several side hustles, and pay that arrives by itself.
--
-- Reports. Reporting a person (a player or a character), not just the map: who it is about, what is
-- wrong, where it happened and a note. The owner reads them with the map ones. See docs/MAP_REPORTS.md.
--
-- Side hustles. Up to hustles_max at once (each with its own start-up cost, gone once spent), as
-- long as your day still leaves 4 hours of sleep (the game checks that: src/lib/world/day.ts).
--
-- Pay. Your job and hustles pay into your wallet by themselves at the end of each game week (the
-- game calls the collect functions; nothing to tap). Pay waits up to work_hold_days game days in
-- case you are away, so it is raised to four game weeks.
--
-- Safe to run more than once. Run after parts 1-48.

insert into public.game_settings (key, value, note) values
  ('person_reports_per_day', 10, 'Reports about people each player can send a day')
on conflict (key) do update set note = excluded.note;

create table if not exists public.person_reports (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  -- A player (their account), or a character (its id, e.g. 'npc:12'), with the name shown then.
  about_user uuid references public.profiles (id) on delete set null,
  about_npc text check (about_npc is null or char_length(about_npc) <= 60),
  about_name text not null check (char_length(about_name) between 1 and 60),
  kind text not null check (kind in ('abuse', 'scam', 'profile', 'glitch', 'other')),
  note text check (note is null or char_length(note) <= 300),
  -- Where it happened (a room or a place), when known.
  place text check (place is null or char_length(place) <= 120),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists person_reports_open_idx on public.person_reports (status, created_at desc);
create index if not exists person_reports_user_idx on public.person_reports (user_id, created_at desc);

/** Report a person (a few a day each; once each per person until it's looked at). */
create or replace function public.person_report(
  p_user uuid, p_about_user uuid, p_about_npc text, p_name text, p_kind text, p_note text, p_place text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_about_user is not null and p_about_user = p_user then raise exception 'self'; end if;
  if (select count(*) from public.person_reports where user_id = p_user and created_at > now() - interval '1 day') >= public.setting('person_reports_per_day') then
    raise exception 'too_many';
  end if;
  if exists (
    select 1 from public.person_reports
    where user_id = p_user and status = 'open'
      and (about_user = p_about_user or (p_about_user is null and about_npc = p_about_npc))
  ) then
    raise exception 'already';
  end if;
  insert into public.person_reports (user_id, about_user, about_npc, about_name, kind, note, place)
    values (p_user, p_about_user, p_about_npc, left(btrim(p_name), 60), p_kind, nullif(btrim(coalesce(p_note, '')), ''), nullif(left(btrim(coalesce(p_place, '')), 120), ''))
    returning id into v_id;
  return v_id;
end $$;

/** Reports about people for the owner's page, newest first ('open' or 'all'). */
create or replace function public.person_reports_list(p_status text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'aboutUser', r.about_user, 'aboutNpc', r.about_npc, 'name', r.about_name, 'kind', r.kind, 'note', r.note,
    'place', r.place, 'status', r.status, 'at', r.created_at, 'by', coalesce(p.username, 'A player')
  ) order by r.created_at desc), '[]'::jsonb)
  from (select * from public.person_reports where p_status = 'all' or status = p_status order by created_at desc limit 500) r
  left join public.profiles p on p.id = r.user_id
$$;

do $$
begin
  revoke all on table public.person_reports from public, anon, authenticated;
  grant all on table public.person_reports to service_role;
  revoke all on sequence public.person_reports_id_seq from public, anon, authenticated;
  grant all on sequence public.person_reports_id_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.person_report(uuid, uuid, text, text, text, text, text)', 'public.person_reports_list(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ============================================================ several side hustles
insert into public.game_settings (key, value, note) values
  ('hustles_max', 3, 'Side hustles each player can run at once')
on conflict (key) do update set note = excluded.note;
-- Four game weeks of pay can wait while you are away (it is paid in by itself each game week).
insert into public.game_settings (key, value, note) values
  ('work_hold_days', 28, 'Most game days of pay that wait (it is paid in by itself each game week)')
on conflict (key) do update set value = greatest(public.game_settings.value, excluded.value), note = excluded.note;

-- One row per hustle you run (it was one per player).
do $$
begin
  if (select array_length(conkey, 1) from pg_constraint where conname = 'life_hustles_pkey' and conrelid = 'public.life_hustles'::regclass) = 1 then
    alter table public.life_hustles drop constraint life_hustles_pkey;
    alter table public.life_hustles add primary key (user_id, hustle);
  end if;
end $$;

/** Collect what one side hustle has made (at most work_hold_days game days), less income tax. */
create or replace function public.life_hustle_collect_one(p_user uuid, p_hustle text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  h public.life_hustles;
  v_hours numeric := public.setting('work_day_hours');
  v_days numeric;
  v_start timestamptz;
  v_off numeric := 0;
  v_boost numeric := 0;
  v_work numeric;
  v_level int;
  v_gross numeric;
  v_tax numeric;
begin
  perform 1 from public.profiles where id = p_user for update;
  select * into h from public.life_hustles where user_id = p_user and hustle = p_hustle for update;
  if not found then return jsonb_build_object('days', 0, 'worked', 0, 'gross', 0, 'tax', 0, 'net', 0); end if;
  select * into l from public.lives where user_id = p_user;
  v_days := least(public.setting('work_hold_days'), greatest(0, extract(epoch from (now() - h.paid_until)) / 3600.0 / v_hours));
  v_start := now() - make_interval(secs => v_days * v_hours * 3600);
  -- Days it was stalled, or you were away, earn nothing; boosted days earn more.
  if h.stalled_until is not null and h.stalled_until > v_start then
    v_off := least(v_days, extract(epoch from (least(now(), h.stalled_until) - v_start)) / 3600.0 / v_hours);
  end if;
  if l.recovering_until is not null and l.recovering_until > v_start then
    v_off := greatest(v_off, least(v_days, extract(epoch from (least(now(), l.recovering_until) - v_start)) / 3600.0 / v_hours));
  end if;
  v_work := greatest(0, v_days - v_off);
  if h.boost_until is not null and h.boost_until > v_start then
    v_boost := least(v_work, extract(epoch from (least(now(), h.boost_until) - v_start)) / 3600.0 / v_hours);
  end if;
  v_work := v_work * case when public.life_work_factor(l.health, l.mind) = 0 then 0 else 1 end;
  v_boost := least(v_boost, v_work);
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = h.skill;
  v_gross := round(h.pay_day * (1 + coalesce(v_level, 0) * public.setting('work_skill_bonus'))
                   * (v_work + v_boost * (h.boost - 1)) * public.life_work_factor(l.health, l.mind)
                   * (1 + h.swing * (random()::numeric * 2 - 1)), 2);
  v_gross := greatest(0, v_gross);
  v_tax := round(v_gross * public.setting('work_income_tax'), 2);
  update public.life_hustles set paid_until = now() where user_id = p_user and hustle = p_hustle;
  if v_gross > 0 then
    perform public.log_coins(p_user, null, 'hustle_pay', v_gross, false, 'Side hustle: ' || h.title);
    if v_tax > 0 then
      perform public.log_coins(p_user, null, 'income_tax', -v_tax, false, 'Income tax');
      perform public.pay_tax(l.region, v_tax, 'income_tax', 'Income tax on a side hustle');
    end if;
    perform public.life_income(p_user, v_gross - v_tax);
  end if;
  if v_work > 0 then
    insert into public.life_skills (user_id, skill, days) values (p_user, h.skill, round(v_work, 3))
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end if;
  return jsonb_build_object('days', round(v_days, 3), 'worked', round(v_work, 3), 'gross', v_gross, 'tax', v_tax, 'net', v_gross - v_tax);
end $$;

/** Collect what all your side hustles have made (added up). */
create or replace function public.life_hustle_collect(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v jsonb;
  v_days numeric := 0;
  v_worked numeric := 0;
  v_gross numeric := 0;
  v_tax numeric := 0;
begin
  for r in select hustle from public.life_hustles where user_id = p_user order by started_at loop
    v := public.life_hustle_collect_one(p_user, r.hustle);
    v_days := greatest(v_days, (v->>'days')::numeric);
    v_worked := v_worked + (v->>'worked')::numeric;
    v_gross := v_gross + (v->>'gross')::numeric;
    v_tax := v_tax + (v->>'tax')::numeric;
  end loop;
  return jsonb_build_object('days', v_days, 'worked', v_worked, 'gross', v_gross, 'tax', v_tax, 'net', v_gross - v_tax);
end $$;

/** Start a side hustle beside the ones you have (up to hustles_max), paying its start-up cost. */
create or replace function public.life_hustle_start(
  p_user uuid, p_hustle text, p_title text, p_skill text, p_pay_day numeric, p_swing numeric, p_hours numeric, p_cost numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_cost numeric := round(coalesce(p_cost, 0), 2);
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if l.home_unit is null then raise exception 'home_first'; end if;
  if p_hustle !~ '^[a-z_]{2,30}$' or p_skill !~ '^[a-z_]{2,30}$' or coalesce(p_pay_day, 0) <= 0 or p_pay_day > public.setting('hustle_pay_max')
     or v_cost < 0 or v_cost > public.setting('hustle_start_max') or coalesce(p_hours, 0) <= 0 or p_hours > 8 then raise exception 'bad_item'; end if;
  if exists (select 1 from public.life_hustles where user_id = p_user and hustle = p_hustle) then raise exception 'already'; end if;
  if (select count(*) from public.life_hustles where user_id = p_user) >= public.setting('hustles_max') then
    raise exception 'too_many:%', public.setting('hustles_max')::int;
  end if;
  if public.life_can_spend(p_user, array['savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
  if v_cost > 0 then
    perform public.life_spend(p_user, array['savings'], v_cost);
    perform public.log_coins(p_user, null, 'hustle_start', -v_cost, false, 'Starting: ' || left(p_title, 50));
    perform public.burn(null, v_cost, 'Side hustle start-up costs');
  end if;
  insert into public.life_hustles (user_id, hustle, title, skill, pay_day, swing, hours)
    values (p_user, p_hustle, left(p_title, 60), p_skill, round(p_pay_day, 2), least(1, greatest(0, coalesce(p_swing, 0.3))), p_hours);
  return jsonb_build_object('collected', jsonb_build_object('days', 0, 'gross', 0, 'tax', 0, 'net', 0), 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Stop one side hustle (what it made is paid in first). */
create or replace function public.life_hustle_stop(p_user uuid, p_hustle text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  if not exists (select 1 from public.life_hustles where user_id = p_user and hustle = p_hustle) then raise exception 'no_hustle'; end if;
  v_out := public.life_hustle_collect_one(p_user, p_hustle);
  delete from public.life_hustles where user_id = p_user and hustle = p_hustle;
  return v_out;
end $$;

/** Stop all your side hustles (what they made is paid in first). */
create or replace function public.life_hustle_stop(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  v_out := public.life_hustle_collect(p_user);
  delete from public.life_hustles where user_id = p_user;
  return v_out;
end $$;

/** Your life as the screens show it: as part 41, with every side hustle ('hustles'; 'hustle' is the first). */
create or replace function public.life_status(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'health', l.health,
    'mind', l.mind,
    'exercise', l.exercise,
    'powerOwed', l.power_owed,
    'wasteOwed', l.waste_owed,
    'powerCut', l.power_day > 0 and l.power_owed > l.power_day * public.setting('living_cutoff_days'),
    'budget', l.budget,
    'recoveringUntil', l.recovering_until,
    'wallet', (select coins from public.profiles where id = p_user),
    'pots', coalesce((select jsonb_object_agg(pot, balance) from public.life_pots where user_id = p_user), '{}'::jsonb),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('course', course, 'title', title, 'cert', cert, 'startedAt', started_at, 'endsAt', ends_at, 'done', done_at is not null) order by started_at)
                         from public.life_courses where user_id = p_user), '[]'::jsonb),
    'procedures', coalesce((select jsonb_agg(jsonb_build_object('procedure', procedure, 'title', title, 'at', created_at) order by created_at desc)
                            from public.life_procedures where user_id = p_user), '[]'::jsonb),
    'payOwed', coalesce((select owed from public.life_jobs where user_id = p_user), 0),
    'hustles', coalesce((select jsonb_agg(jsonb_build_object('hustle', hustle, 'title', title, 'skill', skill, 'payDay', pay_day, 'swing', swing, 'hours', hours,
                                         'paidUntil', paid_until, 'boost', boost, 'boostUntil', boost_until, 'stalledUntil', stalled_until) order by started_at)
                         from public.life_hustles where user_id = p_user), '[]'::jsonb),
    'hustle', (select jsonb_build_object('hustle', hustle, 'title', title, 'skill', skill, 'payDay', pay_day, 'swing', swing, 'hours', hours,
                                         'paidUntil', paid_until, 'boost', boost, 'boostUntil', boost_until, 'stalledUntil', stalled_until)
               from public.life_hustles where user_id = p_user order by started_at limit 1),
    'event', (select jsonb_build_object('id', id, 'source', source, 'key', key, 'title', title, 'expiresAt', expires_at)
              from public.life_events where user_id = p_user and status = 'open' and expires_at > now() order by created_at desc limit 1)
  )
  from public.lives l where l.user_id = p_user
$$;

/** Players whose job or side hustles have a game week of pay or more waiting (for the daily job to pay them in). */
create or replace function public.life_pay_due(p_limit int) returns setof uuid
language sql stable security definer set search_path = public as $$
  select user_id from (
    select user_id, paid_until from public.life_jobs
    union all
    select user_id, paid_until from public.life_hustles
  ) w
  where paid_until < now() - make_interval(secs => 7 * public.setting('work_day_hours') * 3600)
  group by user_id
  limit greatest(1, least(coalesce(p_limit, 500), 2000))
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.life_hustle_collect_one(uuid, text)', 'public.life_hustle_collect(uuid)',
    'public.life_hustle_start(uuid, text, text, text, numeric, numeric, numeric, numeric)',
    'public.life_hustle_stop(uuid, text)', 'public.life_hustle_stop(uuid)', 'public.life_status(uuid)', 'public.life_pay_due(int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
