# Spendbox

Spendbox lets small businesses keep their customer list, track purchases and reward customers with perks.

- **Businesses** sign up with their phone number and get a join link and QR code. They add perks as cards (welcome, loyalty, invite rewards, big spender, birthday), add every bank account they get paid into, confirm payments, and hand over perks.
- **Customers** join only from a business's link (invite-only), using their phone number. They upload payment receipts, which are read automatically and matched to the right business. They share businesses with friends, and choose, business by business, whether to share their details.

Built with Next.js (hosted on Vercel), Supabase (database, phone login, file storage) and Claude (reads receipts).

---

## Set it up (about 30 minutes, no coding)

You need free accounts on **Supabase**, **Vercel**, **Anthropic** (for Claude) and **Twilio** (to send login codes by SMS or WhatsApp).

### 1. Create the database (Supabase)

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick a region close to your customers.
2. When it's ready, open **SQL Editor** → **New query**.
3. Open the file [`supabase/migrations/20261001000000_spendbox.sql`](supabase/migrations/20261001000000_spendbox.sql) in this repository, copy **everything**, paste it into the editor and press **Run**. You should see "Success".

### 2. Switch on phone login (Supabase + Twilio)

1. In Supabase: **Authentication** → **Sign In / Providers** → **Phone** → turn it on.
2. Choose **Twilio** (or **Twilio Verify**) as the SMS provider and paste in your Twilio Account SID, Auth Token and sender (Message Service SID or phone number) from your Twilio console.
   - Want codes sent by **WhatsApp** instead of SMS? Set up a WhatsApp sender in Twilio, then later set `NEXT_PUBLIC_OTP_CHANNEL=whatsapp` in Vercel (step 4).
3. **For testing without sending real messages:** on the same Phone page, add *Test phone numbers and OTPs*, for example `2348000000001=123456`. Logging in with `0800 000 0001` then always accepts the code `123456`.

### 3. Get a Claude API key

Go to [console.anthropic.com](https://console.anthropic.com) → **API keys** → **Create key**. Add some credit under **Billing**. Reading a receipt costs roughly 1–4 US cents with the default model; you can pick a cheaper Claude model with the optional `RECEIPT_MODEL` setting.

### 4. Put the app online (Vercel)

1. Go to [vercel.com](https://vercel.com) → **Add New… → Project** → import this GitHub repository.
2. Before pressing Deploy, open **Environment Variables** and add:

| Name | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → **Project Settings → API** (or the **Connect** button): Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → **Project Settings → API Keys**: Publishable key (older projects: the `anon` key also works, as `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `SUPABASE_SECRET_KEY` | Supabase → **Project Settings → API Keys**: Secret key (older projects: `service_role` key, as `SUPABASE_SERVICE_ROLE_KEY`). Keep it private. |
| `ANTHROPIC_API_KEY` | The key from step 3 |
| `NEXT_PUBLIC_SITE_URL` | Your app's address, e.g. `https://spendbox.vercel.app` (or your own domain) |
| `CRON_SECRET` | Any long random text. Lets Vercel run the daily birthday-treat job. |

Optional: `NEXT_PUBLIC_OTP_CHANNEL` (`sms` or `whatsapp`), `NEXT_PUBLIC_DEFAULT_COUNTRY_CODE` (default `234`), `NEXT_PUBLIC_TIME_ZONE` (default `Africa/Lagos`). See [`.env.example`](.env.example).

3. Press **Deploy**. If you change a variable later, redeploy (**Deployments → ⋯ → Redeploy**) so it takes effect.

> Tip: Vercel's Supabase integration (**Vercel → Storage → Supabase**) can fill in the Supabase variables for you. The app accepts the names it creates.

### 5. Try it

1. Open your site → **Get started**. Create a business with a test phone number.
2. Add perks (Perks page), and your bank accounts (Settings).
3. Open your join link in a private browser window and join as a customer with a second test number.
4. As the customer, upload a screenshot of a transfer receipt paid into one of the bank accounts you added. It's matched and counted, and perks unlock automatically.

---

## How it works

**Invite-only customers.** A customer account can only be created from a business's join link (`/j/business-name`). The login page only lets in numbers that already have an account. A friend's share link adds `?ref=…`, so the friend who shared it gets the invite reward when the new customer's first purchase counts.

**Privacy.** Customers need only a phone number. Name, gender and birthday are optional, and each business sees them only if that customer switches sharing on for that business. Otherwise the business sees a member number and purchases. Details live in one place, so an edit shows up everywhere straight away. Customers can delete their account and everything in it.

**Receipts.** The customer uploads a photo, screenshot or PDF. Claude reads the amount, date and time, who was paid (account number, name, bank), the reference and what it was for. Spendbox then:
- matches the account number (even partly hidden, like `******4821`) to the bank accounts of the businesses the customer has joined → **counted automatically**;
- if only the name matches, or the customer picks the business themselves, the payment waits for the business to confirm it;
- refuses the same receipt twice, failed payments, and anything that isn't a receipt; very old or future-dated receipts need confirming.

Businesses can tap **Not received** on any payment; perks it earned are taken back if they haven't been used yet. Receipt images are stored privately: only the customer and that business can open them.

**Perks.** Five card types: welcome (on joining), loyalty (every N purchases), invite reward (when an invited friend makes a first purchase), big spender (every ₦X spent), birthday treat (during the birthday month, even when the birthday is kept private). Perks are earned automatically by the database, shown on the customer's live pass, and marked as given by the business.

---

## For developers

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run lint` / `npm run typecheck` | Code checks |
| `npm test` | Receipt-matching tests |
| `TEST_DATABASE_URL=postgres://… npm run test:db` | Database scenario tests (56 checks: joining, referrals, perks, privacy, permissions). Needs an **empty, throwaway** Postgres database, never your real one. |

Project layout:

- `supabase/migrations/` — the whole database: tables, Row Level Security, the perk engine (`sync_member_rewards`) and the functions the app calls.
- `src/app/` — pages. `/` landing, `/start` business sign-up, `/login`, `/j/[slug]` join page, `/me/…` customer app, `/dashboard/[bizId]/…` business dashboard, `/api/receipts` receipt upload.
- `src/lib/receipts/` — reading receipts with Claude (`extract.ts`) and matching them to businesses (`match.ts`).
- `src/components/` — shared UI. Fonts (DM Sans, Bricolage Grotesque, SIL Open Font License) are bundled in `src/app/fonts/`.
