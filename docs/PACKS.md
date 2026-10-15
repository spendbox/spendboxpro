# Starting out: free or a starter pack

A life on the real map starts free with **₦2,000,000 and a free home**, or richer with a starter pack
bought once, in the first 72 hours after joining (`src/lib/world/packs.ts`, game-db/090 and 105). After that the offer is gone, whether or not you have bought a home.

| Pack | Starting money | Price |
| --- | --- | --- |
| The Hustler (free) | ₦2,000,000 (₥1,333.33) and a free home | free |
| Uncle Abroad | ₦20,000,000 (₥13,333.33) | ₦1,000 |
| Comfortable Home | ₦80,000,000 (₥53,333.33) | ₦2,500 |
| Rich Family | ₦300,000,000 (₥200,000) | ₦5,000 |

- **One pack per player**, until they buy a home of their own (living in the free home is fine).
  A pack raises the starting money to its amount: a player who started free with ₦2m gets ₦18m more
  for Uncle Abroad. Paid before pressing Start: the life starts with the pack's money.
- **Paid like top-ups** (game-db/090, `src/app/play/topup-actions.ts`, option `pack_<id>`), in the
  Wallet (the welcome screen sends you there): bank transfer right in the game, or card/USSD/bank app
  in Paystack's pop-up.
- **Never paid and not credited.** The money arrives once Paystack confirms the full payment, and only
  once, from whichever comes first: the pop-up closing paid, the transfer box's checks, the page
  Paystack sends players back to (`/api/paystack/return`), Paystack's webhook, the game opening
  (`checkMyPacks`), the Wallet opening (Your payments), or the daily job (`/api/cron/daily`, the last
  three days). A second pack paid in another tab before the first landed is credited too (in full:
  paid is paid). The owner's dashboard lists every payment with a Check with Paystack button.
- **Mint can never be turned back into cash.**
- Packs don't use up the first top-up's doubling.
- Older pack payments (`pk-…`, game-db/042) still arrive as before.
- In the world lab the packs are pretend: nothing is paid.

## The owner credits a player

The dashboard's **Credit a player** form gives someone game money by hand: their name in the game or
their email, an amount in game naira, and a reason (they get a notice with it). Every credit is kept
in `admin_credits` and the ledger (`admin_credit`), and counts in "Money made today" (game-db/090).

## What paid packs bring besides mint

Paid packs bring things, not only more money, so prices keep meaning something for everyone
(src/lib/world/packs.ts):

| Pack | Also comes with |
|---|---|
| The Hustler (free) | Nothing extra: a free home to live in, and ₦2,000,000. |
| Uncle Abroad | A smartphone and designer sneakers, sent from abroad. |
| Comfortable Home | The first home comes fully furnished, plus a laptop, a wristwatch and a generator. |
| Rich Family | A Toyota Camry, a gold chain and a luxury watch; the first home furnished on two floors with its own dance hall; the Rich Family badge. |

- **The things** go into the player's Items once, the first time the game opens after paying
  (`starter_payments.perks_at`, game-db/069_pack_perks.sql). Packs bought before this existed get
  them too.
- **The furnished home** is what Plan my home shows until the player saves a plan of their own,
  and visitors see it too. Saving it costs nothing for what came with it; anything added is paid
  for as usual.
