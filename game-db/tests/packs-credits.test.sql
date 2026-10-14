\set ON_ERROR_STOP on
-- Part 90: ₦2m to start, starter packs paid like top-ups (credited once, never lost), owner credits.
\ir ../090_packs_and_credits.sql
\ir ../090_packs_and_credits.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
-- Test payments from an earlier run (the references are fixed).
delete from starter_payments where reference ~ '^pk-(a{19}|b{19}|c{19})[0-9]$';
delete from topups where reference ~ '^tu-(a{19}|b{19}|c{19})[0-9]$';
update profiles set username = null where username = 'Ada_Test90';
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  r jsonb;
  coins0 numeric;
begin
  insert into auth.users (id, email) values (a, a || '@t.test'), (b, b || '@t.test'), (c, c || '@t.test');
  perform pg_temp.check(public.setting('start_grant') = 1333.33, 'a life starts with ₦2,000,000');
  -- A: started free, then buys Uncle Abroad (₦20m = 13,333.33 mint).
  perform life_start(a, 'lagos');
  coins0 := (select coins from profiles where id = a);
  perform pg_temp.check(pack_status(a) = 'open', 'a new player can buy a pack');
  perform pack_topup_start(a, 'tu-aaaaaaaaaaaaaaaaaaa1', 'lagos', 'starter', 13333.33, 100000);
  r := topup_paid('tu-aaaaaaaaaaaaaaaaaaa1', 50000);
  perform pg_temp.check((r->>'short')::boolean and (select coins from profiles where id = a) = coins0, 'paying less than the pack gives nothing');
  r := topup_paid('tu-aaaaaaaaaaaaaaaaaaa1', 100000);
  perform pg_temp.check((select coins from profiles where id = a) = coins0 + 12000, 'the pack raises the starting money to ₦20m: '||r::text);
  r := topup_paid('tu-aaaaaaaaaaaaaaaaaaa1', 100000);
  perform pg_temp.check(not (r->>'new')::boolean and (select coins from profiles where id = a) = coins0 + 12000, 'confirming twice credits once');
  perform pg_temp.check(exists (select 1 from starter_payments where user_id = a and status = 'paid' and pack = 'starter' and perks_at is null), 'its gifts are queued');
  perform pg_temp.check(pack_status(a) = 'had', 'one pack each');
  begin
    perform pack_topup_start(a, 'tu-aaaaaaaaaaaaaaaaaaa2', 'lagos', 'bigboy', 53333.33, 250000);
    perform pg_temp.check(false, 'a second pack is refused');
  exception when others then perform pg_temp.check(sqlerrm = 'had', 'a second pack is refused');
  end;
  -- B: two tabs, two packs started before either was paid: both paid, both credited.
  perform life_start(b, 'lagos');
  coins0 := (select coins from profiles where id = b);
  perform pack_topup_start(b, 'tu-bbbbbbbbbbbbbbbbbbb1', 'lagos', 'bigboy', 53333.33, 250000);
  perform pack_topup_start(b, 'tu-bbbbbbbbbbbbbbbbbbb2', 'lagos', 'odogwu', 200000, 500000);
  perform topup_paid('tu-bbbbbbbbbbbbbbbbbbb1', 250000);
  perform topup_paid('tu-bbbbbbbbbbbbbbbbbbb2', 500000);
  perform pg_temp.check((select coins from profiles where id = b) = coins0 + 52000 + 198666.67, 'two packs paid in two tabs: both credited');
  -- C: pays before pressing Start: the life starts with the pack's money (and no free grant on top).
  perform pack_topup_start(c, 'tu-ccccccccccccccccccc1', 'lagos', 'starter', 13333.33, 100000);
  coins0 := (select coins from profiles where id = c);
  perform topup_paid('tu-ccccccccccccccccccc1', 100000);
  perform pg_temp.check((select coins from profiles where id = c) = coins0 + 13333.33, 'a pack before starting brings all its money');
  r := life_start(c, 'lagos');
  perform pg_temp.check((select coins from profiles where id = c) = coins0 + 13333.33, 'and starting afterwards adds nothing more');
  -- Packs don't use up the first top-up's doubling.
  insert into topups (reference, user_id, region, option, mint, amount_kobo) values ('tu-ccccccccccccccccccc2', c, 'lagos', 't1', 3333.33, 100000);
  r := topup_paid('tu-ccccccccccccccccccc2', 100000);
  perform pg_temp.check((r->>'doubled')::boolean, 'the first real top-up is still doubled after a pack');
  -- The owner credits a player (found by name or email).
  update profiles set username = 'Ada_Test90' where id = a;
  perform pg_temp.check((select id from admin_find_player('ada_test90')) = a, 'the owner finds a player by name');
  perform pg_temp.check((select id from admin_find_player(upper(a::text) || '@T.TEST')) = a, 'or by email');
  coins0 := (select coins from profiles where id = a);
  perform pg_temp.check(admin_credit(a, 500, 'Sorry about the outage', 'owner@t.test') = coins0 + 500, 'the owner can credit a player');
  perform pg_temp.check(exists (select 1 from admin_credits where user_id = a and mint = 500) and exists (select 1 from ledger where user_id = a and kind = 'admin_credit'), 'and it is recorded');
  begin
    perform admin_credit(a, -5, 'x', null);
    perform pg_temp.check(false, 'no negative credits');
  exception when others then perform pg_temp.check(sqlerrm = 'bad_amount', 'no negative credits');
  end;
end $$;
\o
\echo 'packs and credits: all ok'
