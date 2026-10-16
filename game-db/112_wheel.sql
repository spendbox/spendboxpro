-- Newtown, part 112: the wheel (docs/LIFE_WHEEL.md). Your life drawn as a ring: every moment you've
-- lived, the stories still going, and what's on you right now. This adds:
--
--   - short effects (Blessed, Talked about, Hurt, Owed a favour...) that wear off by themselves
--     and change how later moments turn out (src/lib/world/moments.ts EFFECTS);
--   - where a story came from: a follow-up remembers the moment that started it, so the wheel can
--     show "what came of it" under the moment, and which stories are still going.
--
-- The two moment functions from part 109 are the same as before, except that they pass that on.
-- Safe to run more than once. Run after part 111.

alter table public.moment_followups add column if not exists from_id bigint references public.moments (id) on delete set null;
alter table public.moments add column if not exists from_id bigint references public.moments (id) on delete set null;
create index if not exists moments_from_idx on public.moments (from_id) where from_id is not null;

create table if not exists public.life_effects (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  effect text not null check (char_length(effect) <= 30),
  -- Who it's about, when it's about someone ("Owed a favour" by Tunde).
  who text check (char_length(who) <= 40),
  moment_id bigint references public.moments (id) on delete set null,
  until timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists life_effects_user_idx on public.life_effects (user_id, until desc);

do $$
begin
  revoke all on table public.life_effects from public, anon, authenticated;
  grant all on table public.life_effects to service_role;
  revoke all on sequence public.life_effects_id_seq from public, anon, authenticated;
  grant all on sequence public.life_effects_id_seq to service_role;
end $$;

/**
 * Start a moment for a player: not within p_gap seconds of the last one, at most p_per_day a day,
 * any earlier one left unanswered closed. p_follow: the follow-up it comes from (used up). Returns
 * its id. Errors: too_soon, daily_cap.
 */
create or replace function public.moment_open(p_user uuid, p_moment text, p_vars jsonb, p_spot text, p_gap int, p_per_day int, p_follow bigint default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_last timestamptz;
  v_today int;
  v_id bigint;
  v_from bigint;
begin
  perform 1 from public.profiles where id = p_user for update;
  select max(created_at) into v_last from public.moments where user_id = p_user;
  if v_last is not null and v_last > now() - make_interval(secs => greatest(0, p_gap)) then raise exception 'too_soon'; end if;
  select count(*) into v_today from public.moments where user_id = p_user and created_at >= date_trunc('day', now());
  if v_today >= p_per_day then raise exception 'daily_cap'; end if;
  update public.moments set answered_at = now(), choice = -1 where user_id = p_user and answered_at is null;
  if p_follow is not null then
    delete from public.moment_followups where id = p_follow and user_id = p_user returning from_id into v_from;
  end if;
  insert into public.moments (user_id, moment, vars, spot, from_id) values (p_user, left(p_moment, 40), coalesce(p_vars, '{}'::jsonb), left(coalesce(p_spot, 'street'), 20), v_from)
    returning id into v_id;
  return v_id;
end $$;

/**
 * Answer a moment: what you chose and what came of it (worked out by the game). p_cash (mint):
 * paid from Fun money then the wallet when below 0, into the wallet when above (no more than
 * p_gain_day a day from moments); p_rep: reputation, no more than p_rep_day either way in a day,
 * and kept between p_rep_min and p_rep_max in all. p_follow: a moment to come back p_follow_hours
 * later. Returns { cash, rep, coins }. Errors: no_moment, too_late, not_enough.
 */
create or replace function public.moment_answer(
  p_user uuid, p_id bigint, p_choice int, p_text text, p_cash numeric, p_rep numeric,
  p_follow text, p_follow_vars jsonb, p_follow_hours numeric,
  p_answer_secs int, p_gain_day numeric, p_rep_day numeric, p_rep_min numeric, p_rep_max numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m public.moments;
  v_cash numeric := round(coalesce(p_cash, 0), 2);
  v_rep numeric := round(coalesce(p_rep, 0), 2);
  v_gained numeric;
  v_rep_today numeric;
  v_now numeric;
begin
  select * into m from public.moments where id = p_id and user_id = p_user for update;
  if not found or m.answered_at is not null then raise exception 'no_moment'; end if;
  if m.created_at < now() - make_interval(secs => greatest(60, p_answer_secs)) then
    update public.moments set answered_at = now(), choice = -1 where id = p_id;
    raise exception 'too_late';
  end if;
  perform 1 from public.profiles where id = p_user for update;
  if v_cash < 0 then
    if public.life_can_spend(p_user, array['fun']) < -v_cash then raise exception 'not_enough'; end if;
    perform public.life_spend(p_user, array['fun'], -v_cash);
    perform public.log_coins(p_user, null, 'moment', v_cash, false, 'Out and about');
    perform public.burn(null, -v_cash, 'Moments');
  elsif v_cash > 0 then
    select coalesce(sum((outcome ->> 'cash')::numeric), 0) into v_gained from public.moments
      where user_id = p_user and answered_at >= date_trunc('day', now()) and (outcome ->> 'cash')::numeric > 0;
    v_cash := least(v_cash, greatest(0, coalesce(p_gain_day, 0) - v_gained));
    if v_cash > 0 then
      update public.profiles set coins = coins + v_cash where id = p_user;
      perform public.log_coins(p_user, null, 'moment', v_cash, false, 'Out and about');
    end if;
  end if;
  if v_rep <> 0 then
    select coalesce(sum((outcome ->> 'rep')::numeric), 0) into v_rep_today from public.moments
      where user_id = p_user and answered_at >= date_trunc('day', now());
    v_rep := case when v_rep > 0 then least(v_rep, greatest(0, p_rep_day - greatest(0, v_rep_today)))
                  else greatest(v_rep, -greatest(0, p_rep_day + least(0, v_rep_today))) end;
    select moment_rep into v_now from public.lives where user_id = p_user for update;
    if found then
      v_rep := least(p_rep_max, greatest(p_rep_min, v_now + v_rep)) - v_now;
      update public.lives set moment_rep = moment_rep + v_rep where user_id = p_user;
    else
      v_rep := 0;
    end if;
  end if;
  update public.moments
    set answered_at = now(), choice = p_choice,
        outcome = jsonb_build_object('text', left(coalesce(p_text, ''), 400), 'cash', v_cash, 'rep', v_rep)
    where id = p_id;
  if p_follow is not null and p_follow <> '' then
    insert into public.moment_followups (user_id, moment, vars, from_id, due_at)
      values (p_user, left(p_follow, 40), coalesce(p_follow_vars, '{}'::jsonb), p_id, now() + make_interval(secs => (greatest(1, coalesce(p_follow_hours, 24)) * 3600)::int));
  end if;
  return jsonb_build_object('cash', v_cash, 'rep', v_rep, 'coins', (select coins from public.profiles where id = p_user));
end $$;
