# Starting out: free or a starter pack

A life on the real map starts free with ₥19,500 (₦29.25m), or with a starter pack bought once, before your first
home, through Paystack (`src/lib/world/packs.ts`, `src/app/play/pack-actions.ts`,
`game-db/042_starter_packs.sql`).

| Pack | Mint | Price |
| --- | --- | --- |
| Free | ₥19,500 | free |
| Starter | ₥78,000 | ₦1,000 |
| Big Boy | ₥195,000 | ₦2,500 |
| Odogwu (Rich Family, ₦900m) | ₥600,000 | ₦7,500 |

- One pack per account, only before your first home. If you already started free, the pack tops you
  up to its amount.
- The mint only arrives once Paystack confirms the full payment (when the player comes back from
  Paystack, or from the Paystack webhook, whichever comes first; never twice).
- **Mint can never be turned back into cash.** Brands may reward players in other ways later.
- If Paystack never sends the player back (they closed the page) and the webhook is missed, the
  game checks their unpaid packs with Paystack again each time it opens.
- Paystack sends players back to `/api/paystack/return`, which gives the mint before anything else
  (even if that browser has lost its sign-in), then opens the game.
- In the world lab the packs are pretend: nothing is paid.

## What paid packs bring besides mint

Paid packs bring things, not only more money, so prices keep meaning something for everyone
(src/lib/world/packs.ts):

| Pack | Also comes with |
|---|---|
| The Hustler (free) | Nothing extra. ₥19,500 buys a flat almost anywhere in Lagos. |
| Uncle Abroad | A smartphone and designer sneakers, sent from abroad. |
| Comfortable Home | The first home comes fully furnished, plus a laptop, a wristwatch and a generator. |
| Rich Family | A Toyota Camry, a gold chain and a luxury watch; the first home furnished on two floors with its own dance hall; the Rich Family badge. |

- **The things** go into the player's Items once, the first time the game opens after paying
  (`starter_payments.perks_at`, game-db/069_pack_perks.sql). Packs bought before this existed get
  them too.
- **The furnished home** is what Plan my home shows until the player saves a plan of their own,
  and visitors see it too. Saving it costs nothing for what came with it; anything added is paid
  for as usual.
