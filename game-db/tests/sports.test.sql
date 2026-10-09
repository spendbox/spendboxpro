\set ON_ERROR_STOP on
-- Part 20: the stadium. Tickets to watch matches, bets, and settling the betting pools.
-- Run part 20 again first: it must be safe to re-run (and earlier tests re-run older parts).
\ir ../020_sports.sql
-- Earlier test files may set balances by hand, so check that this part adds no gap of its own.
-- From part 20 on, coins held include the stakes of bets that aren't settled yet.
create function pg_temp.gap() returns numeric language sql as $$
  select (select sum(created) - sum(burned) from coin_supply_daily)
       - ((select sum(coins + bonus_coins) from profiles) + (select value from game_state where key = 'carry')
          + (select coalesce(sum(pool), 0) from rounds where status <> 'done')
          + (select coalesce(sum(amount), 0) from sports_bets where not settled))
$$;
create temp table books_s as select pg_temp.gap() as gap_before;
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.coins(u uuid) returns numeric language sql as $$ select coins from profiles where id = u $$;
-- Prints 'ok <what>: <error>' when the call fails as it should.
create function pg_temp.fails(what text, q text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'should fail: %', what;
exception when others then
  if sqlerrm like 'should fail%' then raise; end if;
  raise notice 'ok %: %', what, sqlerrm;
end $$;

insert into auth.users (email) values ('sp1@sports.test'), ('sp2@sports.test'), ('sp3@sports.test'), ('sp4@sports.test'),
                                      ('sp5@sports.test'), ('sp6@sports.test');
update profiles set username = 'Chidi' where email_key = 'sp1@sports.test';
update profiles set username = 'Amaka' where email_key = 'sp2@sports.test';
update profiles set username = 'Segun' where email_key = 'sp3@sports.test';
update profiles set username = 'Halima' where email_key = 'sp4@sports.test';
update profiles set username = 'Obi' where email_key = 'sp5@sports.test';
update profiles set username = 'Gone' where email_key = 'sp6@sports.test';
select pg_temp.set_coins(pg_temp.uid(e), 3000) from unnest(array['sp1@sports.test', 'sp2@sports.test', 'sp3@sports.test',
                                                                  'sp4@sports.test', 'sp6@sports.test']) e;
select pg_temp.set_coins(pg_temp.uid('sp5@sports.test'), 12);
-- Known settings for this test (whatever an earlier run left).
update game_settings set value = 20 where key = 'sports_ticket_football';
update game_settings set value = 15 where key in ('sports_ticket_basketball', 'sports_ticket_boxing', 'sports_ticket_wrestling');
update game_settings set value = 10 where key = 'bet_min';
update game_settings set value = 500 where key = 'bet_max';
update game_settings set value = 2000 where key = 'bet_daily_max';
update game_settings set value = 0.10 where key = 'bet_burn_share';

-- ============================================================ tickets
do $$
declare c uuid := pg_temp.uid('sp1@sports.test'); o uuid := pg_temp.uid('sp5@sports.test');
        bot uuid := '00000000-0000-0000-0000-00000000b07a'; res jsonb; before numeric; burns int;
begin
  before := pg_temp.coins(c);
  select count(*) into burns from ledger where kind = 'burn';
  res := buy_ticket(c, 'football:1001');
  raise notice 'first ticket: already %, price %, balance %, paid %', res->>'already', res->>'price', res->>'balance', before - pg_temp.coins(c);
  res := buy_ticket(c, 'football:1001');
  raise notice 'second time: already %, price %, paid in total %', res->>'already', res->>'price', before - pg_temp.coins(c);
  raise notice 'one ticket row: %, one ticket ledger row: %, burned with a note: %',
    (select count(*) from sports_tickets where match_id = 'football:1001' and user_id = c),
    (select count(*) from ledger where user_id = c and kind = 'ticket'),
    (select string_agg(amount || ' (' || note || ')', ', ') from ledger where kind = 'burn' and note like 'Sports ticket%');
  res := buy_ticket(c, 'boxing:7');
  raise notice 'boxing ticket price %', res->>'price';
  perform pg_temp.fails('too few coins (12) for a basketball ticket (15)', format('select buy_ticket(%L, %L)', o, 'basketball:55'));
  raise notice 'no ticket and nothing taken: %', not exists (select 1 from sports_tickets where user_id = o) and pg_temp.coins(o) = 12;
  perform pg_temp.fails('no tickets for the bot', format('select buy_ticket(%L, %L)', bot, 'football:1001'));
  perform pg_temp.fails('no such sport', format('select buy_ticket(%L, %L)', c, 'cricket:1'));
  perform pg_temp.fails('not a match id', format('select buy_ticket(%L, %L)', c, 'football'));
  raise notice 'match_state with ticket: %', match_state('football:1001', c);
  raise notice 'match_state without: %', match_state('football:1001', o);
end $$;

-- ============================================================ bet rules
do $$
declare a uuid := pg_temp.uid('sp2@sports.test'); o uuid := pg_temp.uid('sp5@sports.test');
        bot uuid := '00000000-0000-0000-0000-00000000b07a'; res jsonb; before numeric;
        opts text[] := array['home', 'draw', 'away']; ko timestamptz := now() + interval '10 minutes';
begin
  perform pg_temp.fails('at least 10', format('select place_bet(%L, %L, %L, 5, %L, %L)', a, 'football:1001', 'home', ko, opts));
  perform pg_temp.fails('at most 500', format('select place_bet(%L, %L, %L, 501, %L, %L)', a, 'football:1001', 'home', ko, opts));
  perform pg_temp.fails('whole coins', format('select place_bet(%L, %L, %L, 10.5, %L, %L)', a, 'football:1001', 'home', ko, opts));
  perform pg_temp.fails('unknown option', format('select place_bet(%L, %L, %L, 50, %L, %L)', a, 'football:1001', 'martians', ko, opts));
  perform pg_temp.fails('closed after kick-off', format('select place_bet(%L, %L, %L, 50, %L, %L)', a, 'football:1001', 'home', now() - interval '1 second', opts));
  perform pg_temp.fails('not enough coins', format('select place_bet(%L, %L, %L, 50, %L, %L)', o, 'football:1001', 'home', ko, opts));
  perform pg_temp.fails('not the bot', format('select place_bet(%L, %L, %L, 50, %L, %L)', bot, 'football:1001', 'home', ko, opts));
  perform pg_temp.fails('not a match', format('select place_bet(%L, %L, %L, 50, %L, %L)', a, 'darts:1', 'home', ko, opts));
  update profiles set frozen = true where id = a;
  perform pg_temp.fails('frozen accounts can''t bet', format('select place_bet(%L, %L, %L, 50, %L, %L)', a, 'football:1001', 'home', ko, opts));
  update profiles set frozen = false where id = a;

  -- Several bets on one match are fine, up to 500 together.
  before := pg_temp.coins(a);
  res := place_bet(a, 'football:1001', 'home', 300, ko, opts);
  raise notice 'bet 300 on home: pool %, mine %, left today %, balance %', res->'pool', res->>'mine', res->>'left_today', res->>'balance';
  res := place_bet(a, 'football:1001', 'away', 150, ko, opts);
  raise notice 'and 150 on away: pool %, mine %', res->'pool', res->>'mine';
  perform pg_temp.fails('per match cap (450 + 100 > 500)', format('select place_bet(%L, %L, %L, 100, %L, %L)', a, 'football:1001', 'draw', ko, opts));
  res := place_bet(a, 'football:1001', 'draw', 50, ko, opts);
  perform pg_temp.fails('per match cap reached', format('select place_bet(%L, %L, %L, 10, %L, %L)', a, 'football:1001', 'draw', ko, opts));
  raise notice 'coins taken: %, ledger: %', before - pg_temp.coins(a),
    (select string_agg(kind || ' ' || amount, ', ' order by id) from ledger where user_id = a and kind = 'bet');

  -- The daily cap (2,000 by default; 1,000 here), across matches.
  update game_settings set value = 1000 where key = 'bet_daily_max';
  perform place_bet(a, 'basketball:20', 'home', 400, ko, array['home', 'away']);
  perform pg_temp.fails('daily cap (500 + 400 + 400 > 1,000)', format('select place_bet(%L, %L, %L, 400, %L, %L)', a, 'boxing:20', 'red', ko, array['red', 'blue']));
  perform place_bet(a, 'boxing:20', 'red', 100, ko, array['red', 'blue']);
  perform pg_temp.fails('daily cap reached', format('select place_bet(%L, %L, %L, 10, %L, %L)', a, 'wrestling:20', 'red', ko, array['red', 'blue']));
  update game_settings set value = 2000 where key = 'bet_daily_max';
  raise notice 'pool for football:1001: %', match_pool('football:1001');
  raise notice 'board: %', sports_board(a, array['football:1001', 'basketball:20', 'boxing:7']);
end $$;
select 'books with open bets' as "check", (select gap_before from books_s) = pg_temp.gap() as balanced;

-- ============================================================ a three-way football match
-- 930 coins in the pool: home 330 (100 + 200 + 30), draw 200, away 400. Home wins.
-- The house burns 10% (93); the other 837 go to the home bets by stake (253.6, 507.3, 76.1 →
-- 253, 507, 76, and the 1 coin left over goes to the biggest stake).
do $$
declare c uuid := pg_temp.uid('sp1@sports.test'); a uuid := pg_temp.uid('sp2@sports.test'); s uuid := pg_temp.uid('sp3@sports.test');
        h uuid := pg_temp.uid('sp4@sports.test'); res jsonb; ko timestamptz := now() + interval '5 minutes';
        opts text[] := array['home', 'draw', 'away']; bc numeric; ba numeric; bs numeric; bh numeric; burned numeric;
begin
  perform place_bet(c, 'football:2001', 'home', 100, ko, opts);
  perform place_bet(a, 'football:2001', 'home', 200, ko, opts);
  perform place_bet(s, 'football:2001', 'home', 30, ko, opts);
  perform place_bet(s, 'football:2001', 'draw', 200, ko, opts);
  perform place_bet(h, 'football:2001', 'away', 400, ko, opts);
  bc := pg_temp.coins(c); ba := pg_temp.coins(a); bs := pg_temp.coins(s); bh := pg_temp.coins(h);
  select coalesce(sum(amount), 0) into burned from ledger where kind = 'burn';
  perform pg_temp.fails('unknown winner', format('select settle_match(%L, %L, %L, %L, %L)', 'football:2001', 'martians', '2-1', 'x', opts));
  res := settle_match('football:2001', 'home', 'Lions 2-1 Eagles', 'Late winner', opts);
  raise notice 'settled: pool %, winners stake %, cut %, paid %, refunded %, bets %', res->>'pool', res->>'winners_stake', res->>'cut',
    res->>'paid', res->>'refunded', res->>'bets';
  raise notice 'payouts by bet: %', (select string_agg(option || ' ' || amount || ' -> ' || payout, ', ' order by id) from sports_bets where match_id = 'football:2001');
  raise notice 'won: chidi +%, amaka +%, segun +% (lost his 200 on the draw), halima +%', pg_temp.coins(c) - bc, pg_temp.coins(a) - ba,
    pg_temp.coins(s) - bs, pg_temp.coins(h) - bh;
  raise notice 'burned %, house cut row: %', (select sum(amount) from ledger where kind = 'burn') - burned,
    (select amount || ' (' || note || ')' from ledger where kind = 'burn' and note = 'Sports house cut: football:2001');
  raise notice 'all settled: %, result: %', not exists (select 1 from sports_bets where match_id = 'football:2001' and not settled),
    (select winner || ' / ' || score || ' / ' || summary from sports_results where match_id = 'football:2001');
  raise notice 'ledger kinds: %', (select string_agg(kind || ' ' || amount, ', ' order by id) from ledger where kind = 'bet_win' and note = 'Bet won: football:2001');
  raise notice 'chidi told: %', (select body from notifications where user_id = c and kind = 'sports' order by id desc limit 1);
  raise notice 'halima told: %', (select body from notifications where user_id = h and kind = 'sports' order by id desc limit 1);

  -- Settling again (many people watch the end at once) pays nothing more.
  bc := pg_temp.coins(c);
  res := settle_match('football:2001', 'home', 'Lions 2-1 Eagles', 'Late winner', opts);
  raise notice 're-settle: already %, paid %, chidi +%, bet_win rows %', res->>'already', res->>'paid', pg_temp.coins(c) - bc,
    (select count(*) from ledger where kind = 'bet_win' and note = 'Bet won: football:2001');
  res := settle_match('football:2001', 'away', 'something else', null, opts);
  raise notice 'a different result later changes nothing: winner %', res->>'winner';
  perform pg_temp.fails('no bets once it''s settled', format('select place_bet(%L, %L, %L, 50, %L, %L)', c, 'football:2001', 'home', now() + interval '1 hour', opts));
end $$;
select 'books after the three-way match' as "check", (select gap_before from books_s) = pg_temp.gap() as balanced;

-- ============================================================ refunds
do $$
declare c uuid := pg_temp.uid('sp1@sports.test'); s uuid := pg_temp.uid('sp3@sports.test'); h uuid := pg_temp.uid('sp4@sports.test');
        res jsonb; ko timestamptz := now() + interval '5 minutes'; bc numeric; bs numeric; bh numeric; burned numeric;
begin
  -- Nobody picked the winner (bets on home and away, it's a draw): everyone gets their coins back.
  perform place_bet(c, 'football:3001', 'home', 120, ko, array['home', 'draw', 'away']);
  perform place_bet(s, 'football:3001', 'away', 80, ko, array['home', 'draw', 'away']);
  bc := pg_temp.coins(c); bs := pg_temp.coins(s);
  select coalesce(sum(amount), 0) into burned from ledger where kind = 'burn';
  res := settle_match('football:3001', 'draw', '1-1', null, array['home', 'draw', 'away']);
  raise notice 'no winners: refunded %, cut %, paid %, chidi +%, segun +%, burned %', res->>'refunded', res->>'cut', res->>'paid',
    pg_temp.coins(c) - bc, pg_temp.coins(s) - bs, (select sum(amount) from ledger where kind = 'burn') - burned;
  raise notice 'refund rows: %', (select string_agg(kind || ' ' || amount, ', ' order by id) from ledger where note = 'Bet refunded: football:3001');
  raise notice 'segun told: %', (select body from notifications where user_id = s and kind = 'sports' order by id desc limit 1);

  -- Everyone on the same side (and it won): no losers to pay them, so it's refunded too.
  perform place_bet(s, 'boxing:4001', 'red', 60, ko, array['red', 'blue', 'draw']);
  perform place_bet(h, 'boxing:4001', 'red', 40, ko, array['red', 'blue', 'draw']);
  bs := pg_temp.coins(s); bh := pg_temp.coins(h);
  res := settle_match('boxing:4001', 'red', 'KO round 3', null, array['red', 'blue', 'draw']);
  raise notice 'one-sided: refunded %, cut %, segun +%, halima +%', res->>'refunded', res->>'cut', pg_temp.coins(s) - bs, pg_temp.coins(h) - bh;
  raise notice 'halima told: %', (select body from notifications where user_id = h and kind = 'sports' order by id desc limit 1);

  -- No bets at all: just recorded.
  res := settle_match('wrestling:5001', 'blue', 'Pin', null, array['red', 'blue']);
  raise notice 'no bets: pool %, paid %, recorded %', res->>'pool', res->>'paid', exists (select 1 from sports_results where match_id = 'wrestling:5001');

  -- Winners never lose coins: home 950 vs away 50 (10% of 1,000 = 100 would be more than the 50 lost).
  update game_settings set value = 5000 where key = 'bet_daily_max';
  update game_settings set value = 1000 where key = 'bet_max';
  perform place_bet(c, 'basketball:6001', 'home', 950, ko, array['home', 'away']);
  perform place_bet(s, 'basketball:6001', 'away', 50, ko, array['home', 'away']);
  bc := pg_temp.coins(c);
  res := settle_match('basketball:6001', 'home', '101-99', null, array['home', 'away']);
  raise notice 'lopsided: cut % (only the losing stakes), chidi gets % for 950', res->>'cut', pg_temp.coins(c) - bc;
  update game_settings set value = 500 where key = 'bet_max';
  update game_settings set value = 2000 where key = 'bet_daily_max';
end $$;
select 'books after refunds' as "check", (select gap_before from books_s) = pg_temp.gap() as balanced;

-- ============================================================ a player leaves mid-match
-- Their stake stays in the pool, and what it wins is burned rather than lost from the books.
-- (Empty their purse first: deleting an account with coins in it is a gap of its own.)
do $$
declare g uuid := pg_temp.uid('sp6@sports.test'); h uuid := pg_temp.uid('sp4@sports.test'); res jsonb;
        ko timestamptz := now() + interval '5 minutes'; bh numeric; burned numeric;
begin
  perform place_bet(g, 'football:8001', 'home', 200, ko, array['home', 'draw', 'away']);
  perform place_bet(h, 'football:8001', 'away', 100, ko, array['home', 'draw', 'away']);
  perform pg_temp.set_coins(g, 0);
  delete from auth.users where email = 'sp6@sports.test';
  raise notice 'bet kept without a player: %', (select user_id is null from sports_bets where match_id = 'football:8001' and option = 'home');
  bh := pg_temp.coins(h);
  select coalesce(sum(amount), 0) into burned from ledger where kind = 'burn';
  res := settle_match('football:8001', 'home', '1-0', null, array['home', 'draw', 'away']);
  raise notice 'paid % (to nobody), burned % in total', res->>'paid', (select sum(amount) from ledger where kind = 'burn') - burned;
  raise notice 'halima lost her 100: %', pg_temp.coins(h) = bh;
end $$;

-- ============================================================ my bets
do $$
declare c uuid := pg_temp.uid('sp1@sports.test'); res jsonb;
begin
  res := my_bets(c);
  raise notice 'chidi has % bets listed, newest: %', jsonb_array_length(res),
    (select string_agg(x->>'match' || ' ' || (x->>'option') || ' ' || (x->>'amount') || ' -> ' || coalesce(x->>'payout', 'open')
                        || coalesce(' (' || (x->>'winner') || ')', ''), '; ' order by (x->>'id')::bigint desc)
       from jsonb_array_elements(res) x);
  raise notice 'nobody''s bets: %', my_bets('00000000-0000-0000-0000-000000000001');
end $$;

-- ============================================================ settle what's still open, check the books
select settle_match(m, 'home', null, null) is not null as settled_leftovers
  from (select distinct match_id m from sports_bets where not settled) x;
select (select count(*) from sports_bets where not settled) as open_bets_left,
       (select coalesce(sum(amount), 0) from ledger where kind in ('bet', 'bet_win', 'bet_refund'))
         + (select coalesce(sum(amount), 0) from ledger where kind = 'burn' and note like 'Sports %')
         - (select coalesce(sum(amount), 0) from ledger where kind = 'burn' and note like 'Sports ticket%') as bets_net_zero;
select gap_before, pg_temp.gap() as gap_after from books_s;  -- must be equal
