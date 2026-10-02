# Spendbox

Spendbox lets small businesses keep their customer list, track purchases and reward customers with perks.

- **Businesses** sign up with their phone number and a PIN, start a free trial, and get a join link and QR code. They add perks as cards (welcome, loyalty, invite rewards, big spender, birthday), connect the bank account customers pay into (read-only, through Mono), and hand over perks.
- **Customers** join only from a business's link (invite-only), using their phone number and a 6-digit PIN. They pay as usual: transfers are seen in the business's bank and counted for them automatically, with nothing to upload. They share businesses with friends, and choose, business by business, whether to share their details.

Built with Next.js (hosted on Vercel), Supabase (database, login, file storage) and Mono (reads payments coming into a business's bank account).

---

## Set it up (about 20 minutes, no coding)

You need accounts on **Supabase**, **Vercel** and **Mono**. Optional: **Resend** (sends notification emails).

### 1. Create the database (Supabase)

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick a region close to your customers.
2. When it's ready, open **SQL Editor** → **New query**.
3. Open the file [`supabase/migrations/20261001000000_spendbox.sql`](supabase/migrations/20261001000000_spendbox.sql) in this repository, copy **everything**, paste it into the editor and press **Run**. You should see "Success".
4. Do the same with [`supabase/migrations/20261002000000_logos_emails_durations.sql`](supabase/migrations/20261002000000_logos_emails_durations.sql) (logos, emails, perk durations).
5. Then [`supabase/migrations/20261003000000_bank_feeds.sql`](supabase/migrations/20261003000000_bank_feeds.sql) (payments from the bank). Always run the files in order, each once.

### 2. Login: nothing to set up

People log in with their **phone number and a 6-digit PIN** they choose the first time. No text messages are sent, so you don't need an SMS provider. Behind the scenes this uses Supabase's built-in email-and-password login (on by default under **Authentication → Sign In / Providers → Email** — leave it on). No emails are ever sent.

> Phone numbers are not verified yet, and there is no "forgot PIN" yet. To reset someone's PIN, open Supabase → **Authentication → Users**, find them by phone number and delete or update the user. Adding text-message or WhatsApp codes later is a small change.

### 3. Mono (counts payments from the bank)

1. Sign up at [mono.co](https://mono.co) and open the dashboard. Create an app for **Connect / Financial data**.
2. Under the app's **Keys**, copy the **public key** and the **secret key**. Keys starting with `test_` use Mono's **sandbox** (practice banks and made-up payments, nothing real). Keys starting with `live_` use real banks; Mono gives you these once they've approved your business.
3. Make up a long random password for webhooks (any text, e.g. from a password generator). After your site is online (step 5), go to the app's **Webhooks** settings in Mono and add:
   - URL: `https://<your site>/api/mono/webhook`
   - Secret: the random text you made up.

   Mono then tells Spendbox the moment a business has new payments. Without it, payments still arrive: whenever the business opens Payments or taps **Check for new payments**, and once a day.

### 4. Optional: Resend (emails)

- **Resend** (emails customers when a perk is ready or a transfer is counted, and emails businesses about new members): create an account at [resend.com](https://resend.com), add and verify your domain under **Domains**, then create an **API key**. Until a domain is verified, Resend only delivers to your own Resend login email.

### 5. Put the app online (Vercel)

1. Go to [vercel.com](https://vercel.com) → **Add New… → Project** → import this GitHub repository.
2. Before pressing Deploy, open **Environment Variables** and add:

| Name | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → **Project Settings → API** (or the **Connect** button): Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → **Project Settings → API Keys**: Publishable key (older projects: the `anon` key also works, as `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `SUPABASE_SECRET_KEY` | Supabase → **Project Settings → API Keys**: Secret key (older projects: `service_role` key, as `SUPABASE_SERVICE_ROLE_KEY`). Keep it private. |
| `NEXT_PUBLIC_MONO_PUBLIC_KEY` | Mono public key (step 3) |
| `MONO_SECRET_KEY` | Mono secret key (step 3). Keep it private. |
| `MONO_WEBHOOK_SECRET` | The random text you put in Mono's webhook settings (step 3) |
| `NEXT_PUBLIC_SITE_URL` | Your app's address, e.g. `https://spendbox.vercel.app` (or your own domain) |
| `CRON_SECRET` | Any long random text. Lets Vercel run the daily job (birthday treats, and a bank check in case a webhook was missed). |
| `RESEND_API_KEY` | Optional — Resend API key (step 4) |
| `EMAIL_FROM` | Optional — who emails come from, e.g. `Spendbox <hello@yourdomain.com>` (must be on your verified Resend domain) |

Moving from Mono's sandbox to real banks: replace the two Mono keys with your `live_` keys and redeploy. Optional: `NEXT_PUBLIC_TRIAL_DAYS` (free-trial length, default `90`), `NEXT_PUBLIC_DEFAULT_COUNTRY_CODE` (default `234`), `NEXT_PUBLIC_TIME_ZONE` (default `Africa/Lagos`). See [`.env.example`](.env.example).

3. Press **Deploy**. If you change a variable later, redeploy (**Deployments → ⋯ → Redeploy**) so it takes effect.
4. **For speed:** in Vercel → **Settings → Functions → Function Region**, pick the region closest to your Supabase project's region (shown in Supabase → Project Settings → General). When the two are far apart, every page waits for the data to travel between continents.

> Tip: Vercel's Supabase integration (**Vercel → Storage → Supabase**) can fill in the Supabase variables for you. The app accepts the names it creates.

### 6. Try it

1. Open your site → **Get started**. Create a business with your phone number and a PIN.
2. Add perks (Perks page). In **Settings → Your bank**, tap **Connect your bank** and pick a bank in Mono's window. With sandbox keys, use one of Mono's test banks and the test login Mono shows you.
3. Open your join link in a private browser window and join as a customer with a different phone number. In **Profile**, enter a name.
4. Go back to **Payments**. Sandbox payments are made up by Mono, so most will be in **Who paid this?**: pick a customer for one. Every later payment from that sender counts for that customer by itself.

---

## How it works

**Invite-only customers.** A customer account can only be created from a business's join link (`/j/business-name`). The login page only lets in numbers that already have an account.

**Free trial.** Every business dashboard shows a free-trial banner with the days left (90 days from sign-up by default) and says paid plans come after. Nothing is charged or switched off automatically. A friend's share link adds `?ref=…`, so the friend who shared it gets the invite reward when the new customer's first purchase counts.

**Privacy.** Customers need only a phone number. Name, gender and birthday are optional, and each business sees them only if that customer switches sharing on for that business. Otherwise the business sees a member number and purchases. Details live in one place, so an edit shows up everywhere straight away. Customers can delete their account and everything in it.

**Payments from the bank.** A business connects its bank account through Mono's secure window (read-only: Spendbox can see money coming in, never move it). When money arrives:
- if the sender is already **recognised** as a member (same name or account number as an earlier payment, at any business on Spendbox), it counts for them straight away;
- otherwise, if exactly one member's **profile name** matches the sender's name (order, middle names and short forms like Tolu/Tolulope don't matter), it counts for them;
- otherwise, if the business **recorded a purchase** for the same amount at about the same time, the two are linked (it's never counted twice);
- otherwise it waits in **Who paid this?**: the business picks the customer once, and that sender is recognised from then on. **Not a customer** skips it (optionally for good, e.g. money the owner moves themselves).

Payments from before someone joined don't count for them automatically. **Wrong customer?** on any payment undoes a match and stops that sender being matched to that member again. Customers see **Bank accounts recognised as you** in Profile & privacy and can tap **Not me**; businesses never see that list. Payments arrive through Mono's webhook, when the business opens Payments or taps **Check for new payments**, and in a daily check.

**Receipts (switched off).** Customer receipt uploads, read by Claude, are still in the code but hidden. To bring them back, set `NEXT_PUBLIC_RECEIPT_UPLOADS=on` and `ANTHROPIC_API_KEY` (from [console.anthropic.com](https://console.anthropic.com), roughly $20–30 per 1,000 receipts), and redeploy. Optionally set `PAYSTACK_SECRET_KEY` so account names fill themselves in when businesses add the accounts receipts are checked against.

**Perks.** Five card types: welcome (on joining), loyalty (every N purchases), invite reward (when an invited friend makes a first purchase), big spender (every ₦X spent), birthday treat (during the birthday month, even when the birthday is kept private). Perks are earned automatically by the database, shown on the customer's live pass, and marked as given by the business. Each perk has a time limit the business chooses (1 week to 3 months, or none); customers see a bar showing how long they have left.

**Emails (optional).** Customers can add an email in Profile & privacy to hear when a perk is ready or a payment is counted. Businesses add an email in Settings to hear about new members. Businesses never see customers' emails.

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
| `npm test` | Matching tests (bank narrations, names, receipts) |
| `TEST_DATABASE_URL=postgres://… npm run test:db` | Database scenario tests (joining, referrals, perks, privacy, permissions, perk durations, bank payments). Needs an **empty, throwaway** Postgres database, never your real one. |

Project layout:

- `supabase/migrations/` — the whole database: tables, Row Level Security, the perk engine (`sync_member_rewards`) and the functions the app calls.
- `src/app/` — pages. `/` landing, `/start` business sign-up, `/login`, `/j/[slug]` join page, `/me/…` customer app, `/dashboard/[bizId]/…` business dashboard, `/api/mono/webhook` Mono's webhook, `/api/receipts` receipt upload (switched off).
- `src/lib/mono.ts` and `src/lib/bank/` — talking to Mono, reading senders from bank narrations and matching them to members (`match.ts`), and fetching and counting payments (`sync.ts`).
- `src/lib/receipts/` — reading receipts with Claude (`extract.ts`) and matching them to businesses (`match.ts`).
- `src/components/` — shared UI. Fonts (DM Sans, Bricolage Grotesque, SIL Open Font License) are bundled in `src/app/fonts/`.
