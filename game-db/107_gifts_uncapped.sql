-- Part 107: no cap on giving money. Players can give as much as they have, as often as they like,
-- to anyone. The one rule left is for brand-new accounts (part 65): under gift_new_days days old
-- or below level gift_new_level, they can give gift_new_daily_max a day, so nobody can farm the
-- free starting money with throwaway accounts. Spraying uses the same checks.

/** How much more this player may give away today: null when there's no limit. */
create or replace function public.gift_left_today(p public.profiles) returns numeric
language sql stable set search_path = public as $$
  select case
    when p.created_at > now() - make_interval(days => public.setting('gift_new_days')::int)
      or coalesce(p.level, 1) < public.setting('gift_new_level')
    then greatest(0, public.setting('gift_new_daily_max') - (select coalesce(sum(amount), 0) from public.coin_gifts
                                                            where from_id = p.id and created_at >= date_trunc('day', now())))
    else null end
$$;

-- Checks shared by gifts and spraying: may this player give this much away?
create or replace function public.gift_check(p public.profiles, p_amount numeric) returns void
language plpgsql set search_path = public as $$
declare
  v_left numeric;
begin
  if p.id is null or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen then raise exception 'frozen'; end if;
  if p.username is null then raise exception 'no_name'; end if;
  if p.seeker_rounds + p.hider_rounds < public.setting('gift_min_rounds') then raise exception 'new_player'; end if;
  v_left := public.gift_left_today(p);
  if v_left is not null and p_amount > v_left then raise exception 'new_giver_cap:%', v_left; end if;
  if p.coins < p_amount then raise exception 'not_enough'; end if;
end $$;

-- Give money to another player: any whole amount you have. Returns { amount, to, balance, left_today }
-- (left_today is null unless you're a new player with a daily limit).
create or replace function public.give_coins(p_from uuid, p_to uuid, p_amount numeric, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f public.profiles;
  t public.profiles;
  v_note text := nullif(btrim(left(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g'), 80)), '');
  v_round bigint;
  v_q bigint;
begin
  if p_amount is null or p_amount <> trunc(p_amount) or p_amount < 1 then raise exception 'bad_amount'; end if;
  if p_to is null or p_to = p_from then raise exception 'gift_self'; end if;
  perform public.lock_players(array[p_from, p_to]);
  select * into f from public.profiles where id = p_from;
  select * into t from public.profiles where id = p_to;
  if t.id is null or t.username is null then raise exception 'unknown_target'; end if;
  if t.is_bot then raise exception 'target_bot'; end if;
  if t.frozen then raise exception 'target_frozen'; end if;
  perform public.gift_check(f, p_amount);

  select max(id) into v_round from public.rounds;
  update public.profiles set coins = coins - p_amount where id = p_from;
  update public.profiles set coins = coins + p_amount where id = p_to;
  perform public.log_coins(p_from, v_round, 'gift_sent', -p_amount, false, 'To ' || t.username || coalesce(': ' || v_note, ''));
  perform public.log_coins(p_to, v_round, 'gift_received', p_amount, false, 'From ' || f.username || coalesce(': ' || v_note, ''));
  insert into public.coin_gifts (from_id, to_id, kind, amount, note) values (p_from, p_to, 'gift', p_amount, v_note);
  perform public.notify(p_to, v_round, 'gift', format('%s gave you %s coins%s', f.username, p_amount,
    coalesce(': "' || v_note || '"', '!')));

  select id into v_q from public.quests where user_id = p_from and status = 'active' and expires_at > now();
  if found then perform public.quest_sync(v_q); end if;
  select * into f from public.profiles where id = p_from;
  return jsonb_build_object('amount', p_amount, 'to', t.username, 'balance', f.coins, 'left_today', public.gift_left_today(f));
end $$;
