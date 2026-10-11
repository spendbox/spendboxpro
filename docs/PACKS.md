# Starting out: free or a starter pack

A life on the real map starts free with ₥5,000, or with a starter pack bought once, before your first
home, through Paystack (`src/lib/world/packs.ts`, `src/app/play/pack-actions.ts`,
`game-db/042_starter_packs.sql`).

| Pack | Mint | Price |
| --- | --- | --- |
| Free | ₥5,000 | free |
| Starter | ₥20,000 | ₦1,000 |
| Big Boy | ₥50,000 | ₦2,500 |
| Odogwu | ₥100,000 | ₦7,500 |

- One pack per account, only before your first home. If you already started free, the pack tops you
  up to its amount.
- The mint only arrives once Paystack confirms the full payment (when the player comes back from
  Paystack, or from the Paystack webhook, whichever comes first; never twice).
- **Mint can never be turned back into cash.** Brands may reward players in other ways later.
- In the world lab the packs are pretend: nothing is paid.
