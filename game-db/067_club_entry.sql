-- Newtown, part 67: club entry fees on the real map. Some clubs charge at the door; paid once, it
-- lets you in (and back in) for 24 hours. From your Fun money, then your wallet.
--
-- Safe to run more than once. Run after part 66.

create table if not exists public.club_entries (
  user_id uuid not null references public.profiles (id) on delete cascade,
  place text not null check (char_length(place) <= 40),
  fee numeric not null default 0,
  paid_at timestamptz not null default now(),
  primary key (user_id, place)
);

/**
 * Into a club: free if you paid in the last 24 hours, otherwise pays the fee (mint, at most 1,000).
 * Returns what was paid now and until when you're in.
 */
create or replace function public.life_club_entry(p_user uuid, p_place text, p_fee numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_fee numeric := round(least(1000, greatest(0, coalesce(p_fee, 0))), 2);
  v_paid numeric := 0;
  v_at timestamptz;
  p public.profiles;
begin
  if p_place is null or p_place !~ '^b:[0-9]{1,7}$' then raise exception 'bad_place'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select paid_at into v_at from public.club_entries where user_id = p_user and place = p_place for update;
  if v_at is not null and v_at > now() - interval '24 hours' then
    return jsonb_build_object('paid', 0, 'until', v_at + interval '24 hours');
  end if;
  if v_fee > 0 then
    perform 1 from public.lives where user_id = p_user for update;
    if not found then raise exception 'no_life'; end if;
    if public.life_can_spend(p_user, array['fun']) < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
    v_paid := public.life_spend(p_user, array['fun'], v_fee);
    perform public.log_coins(p_user, null, 'club_entry', -v_paid, false, 'Club entry: ' || p_place);
    perform public.burn(null, v_paid, 'Club entry');
  end if;
  insert into public.club_entries (user_id, place, fee, paid_at) values (p_user, p_place, v_paid, now())
  on conflict (user_id, place) do update set fee = excluded.fee, paid_at = excluded.paid_at;
  return jsonb_build_object('paid', v_paid, 'until', now() + interval '24 hours');
end $$;

do $$
begin
  revoke all on table public.club_entries from public, anon, authenticated;
  grant all on table public.club_entries to service_role;
  revoke all on function public.life_club_entry(uuid, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_club_entry(uuid, text, numeric) to service_role;
end $$;
