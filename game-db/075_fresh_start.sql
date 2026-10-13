-- Newtown, part 75: the fresh start (docs/MONEY.md, "The fresh start"). Run ONCE, after part 74, on
-- the day the simple life goes live. Running it again does nothing (it remembers it ran).
--
-- Everyone's money goes to ₦250,000 plus a ₦100,000 founder bonus (₦350,000), their savings pots
-- are emptied, they get the Founder badge and a message saying what happened. Homes, places, cars
-- and things they own stay theirs. Players with no home get a free room the next time they open
-- the game.
--
-- Everyone's old money is saved first in public.fresh_start_backup. To undo, run the block at the
-- bottom of this file (it's commented out).

create table if not exists public.fresh_start_backup (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  coins numeric(14,2) not null,
  pots jsonb not null default '{}'::jsonb,
  backed_up_at timestamptz not null default now()
);
alter table public.fresh_start_backup enable row level security;

insert into public.game_settings (key, value, note) values
  ('fresh_start_coins', 233.34, 'Mint everyone has after the fresh start: ₦250,000 plus a ₦100,000 founder bonus (₦350,000)')
on conflict (key) do nothing;

do $$
declare
  v_to numeric := coalesce(public.setting('fresh_start_coins'), 233.34);
  x record;
  v_pots jsonb;
begin
  if exists (select 1 from public.game_settings where key = 'fresh_start_done') then
    raise notice 'The fresh start has run already: nothing changed.';
    return;
  end if;
  for x in select id, coins from public.profiles where not is_bot loop
    v_pots := coalesce((select jsonb_object_agg(pot, balance) from public.life_pots where user_id = x.id), '{}'::jsonb);
    insert into public.fresh_start_backup (user_id, coins, pots) values (x.id, x.coins, v_pots) on conflict (user_id) do nothing;
    update public.life_pots set balance = 0 where user_id = x.id;
    update public.profiles set coins = v_to where id = x.id;
    perform public.log_coins(x.id, null, 'fresh_start', v_to - x.coins, false, 'The fresh start');
    if not exists (select 1 from public.badges where user_id = x.id and badge = 'founder') then
      insert into public.badges (user_id, badge, detail) values (x.id, 'founder', 'Here before the fresh start');
    end if;
    perform public.notify(x.id, null, 'fresh_start',
      'Newtown has a fresh start: real Lagos prices, a daily gift, and a free room for everyone. Your money is now ₦350,000 (₦250,000 plus a ₦100,000 founder bonus), your homes and things are still yours, and you''re a Founder.');
  end loop;
  insert into public.game_settings (key, value, note) values ('fresh_start_done', 1, 'The fresh start (part 75) has run');
end $$;

-- ============================================================ to undo (only if you must)
-- Puts everyone's money and pots back as they were before the fresh start (money earned or spent
-- since is lost), and lets part 75 run again.
--
-- update public.profiles p set coins = b.coins from public.fresh_start_backup b where b.user_id = p.id;
-- update public.life_pots lp set balance = coalesce((b.pots ->> lp.pot)::numeric, 0) from public.fresh_start_backup b where b.user_id = lp.user_id;
-- delete from public.game_settings where key = 'fresh_start_done';
