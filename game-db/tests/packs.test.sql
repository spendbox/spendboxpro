\set ON_ERROR_STOP on
-- Part 42: starter packs. Once, before the first home; the pack's mint arrives once Paystack
-- confirms the full amount; a life started free is topped up to the pack's amount.
\ir ../042_starter_packs.sql
\ir ../042_starter_packs.sql
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

insert into auth.users (email) values ('p1@pack.test'), ('p2@pack.test');
update profiles set username = 'Packer1' where email_key = 'p1@pack.test';
update profiles set username = 'Packer2' where email_key = 'p2@pack.test';

do $$
declare
  a uuid := pg_temp.uid('p1@pack.test');
  b uuid := pg_temp.uid('p2@pack.test');
  v jsonb;
begin
  update profiles set coins = 0 where id in (a, b);
  perform life_pack_start(a, 'pk-aaaaaaaaaa', 'lagos', 'bigboy', 50000, 250000);
  v := life_pack_paid('pk-aaaaaaaaaa', 100);
  perform pg_temp.check((v->>'short')::boolean and (select coins from profiles where id = a) = 0, 'not the full amount: nothing');
  v := life_pack_paid('pk-aaaaaaaaaa', 250000);
  perform pg_temp.check((select coins from profiles where id = a) = 50000 and (select granted from lives where user_id = a) = 50000, 'paid: the life starts with the pack');
  v := life_pack_paid('pk-aaaaaaaaaa', 250000);
  perform pg_temp.check(not (v->>'new')::boolean and (select coins from profiles where id = a) = 50000, 'only once');
  perform pg_temp.fails('one pack per account', 'already', format('select life_pack_start(%L, %L, %L, %L, 100000, 750000)', a, 'pk-bbbbbbbbbb', 'lagos', 'odogwu'));

  -- Started free, then a pack: topped up to the pack's amount.
  perform life_start(b, 'lagos');
  perform life_pack_start(b, 'pk-cccccccccc', 'lagos', 'starter', 20000, 100000);
  perform life_pack_paid('pk-cccccccccc', 100000);
  perform pg_temp.check((select coins from profiles where id = b) = 20000, 'a free start topped up to the pack');
  update lives set home_unit = 'lagos:1,1/0' where user_id = b;
  update starter_payments set status = 'pending' where user_id = b;
  perform pg_temp.fails('not after the first home', 'too_late', format('select life_pack_start(%L, %L, %L, %L, 50000, 250000)', b, 'pk-dddddddddd', 'lagos', 'bigboy'));
end $$;

\o
select 'packs: all checks passed' as result;
