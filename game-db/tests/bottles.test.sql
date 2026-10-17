\set ON_ERROR_STOP on
-- Part 126: bottle service. Paying from Fun money then savings, never more than there is, the
-- sanity cap, a place that isn't one; running the part twice.
\ir ../126_bottle_service.sql
\ir ../126_bottle_service.sql
\o /dev/null
insert into auth.users (email) values ('bt@bt.test');
update profiles set username = 'BottleBoss', coins = 5000 where email_key = 'bt@bt.test';
insert into lives (user_id, region, granted) select id, 'lagos', 1000 from profiles where email_key = 'bt@bt.test';
do $$
declare
  u uuid := (select id from profiles where email_key = 'bt@bt.test');
  v numeric;
begin
  v := life_order_bottles(u, 'b:123', 'Moët', 300);
  if v <> 300 then raise exception 'FAILED: paid %', v; end if;
  if exists (select 1 from ledger where user_id = u and kind = 'bottles' and amount = -300) is not true then raise exception 'FAILED: logged'; end if;
  begin
    perform life_order_bottles(u, 'b:123', 'Jeroboam', 1000000);
    raise exception 'should fail';
  exception when others then
    if sqlerrm not like 'not_enough%' then raise exception 'FAILED: over what you have gave %', sqlerrm; end if;
  end;
  begin
    perform life_order_bottles(u, 'lagos', 'x', 10);
    raise exception 'should fail';
  exception when others then
    if sqlerrm not like 'bad_place%' then raise exception 'FAILED: a bad place gave %', sqlerrm; end if;
  end;
end $$;
\o
\echo 'bottles: all ok'
