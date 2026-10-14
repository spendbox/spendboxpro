-- Newtown, part 81: no more Newtown prize on top of a challenge won (the winner takes the pot,
-- docs/MONEY.md). The trigger from part 73 stays, paying nothing while this is 0.
--
-- Safe to run more than once.

update public.game_settings set value = 0, note = 'Mint Newtown adds for each challenge won: none since part 81'
where key = 'challenge_bonus';
