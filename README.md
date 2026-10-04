# Spendbox

Spendbox is a reverse marketplace for the businesses people already trust. Customers say what they need, with their budget, and the businesses they know reach out.

- **Customers** join a business from its link, using their name, email and a password (phone optional). In **My Spendbox** they post a request — "Red velvet cake for Saturday, up to ₦30,000" — with up to 4 photos, and pick how they'd like to be reached (WhatsApp, call and/or email). A request is live for **24 hours**, then it ends; they can post it again in one tap. They see which businesses are reaching out, mark "Found my plug", and collect simple perks under **Plugs**.
- **Businesses** sign up with their email, share their join link or QR code, and see live requests on their **Home**. One tap opens WhatsApp (with a greeting ready), a call or an email, and the customer is told who's reaching out. They also offer simple perks (welcome, invite a friend, birthday), team up with partner businesses, and manage their customer list. Menu: Home, Customers, Partners, Settings.
- **Partners** recommend each other's perks to their customers. On the **Plus** plan (and during the free trial), a business also sees requests from its partners' customers; **Starter** sees requests from its own customers.

Built with Next.js (hosted on Vercel), Supabase (database, login, photo storage), Paystack (businesses' monthly plan) and Resend (emails).

---

## Set it up (about 15 minutes, no coding)

You need accounts on **Supabase**, **Vercel** and **Paystack**. You'll also want **Resend**: it sends the email-confirmation and password-reset links and perk alerts.

### 1. Create the database (Supabase)

1. Go to [supabase.com](https://supabase.com) and create a new project. Choose a region close to your customers and save the database password somewhere safe.
2. When it's ready, open **SQL Editor** in the left menu and click **New query**.
3. Open [`supabase/catch_up.sql`](supabase/catch_up.sql), copy **everything**, paste it into the editor and press **Run**. If Supabase warns about destructive operations, confirm: it only replaces Spendbox's own functions.
4. At the end you'll see a table of 10 updates. Every row should say **yes**.

   This one file works whatever state your database is in. It checks which updates are already there and runs only the missing ones, in order, so you can run it again after every new version of Spendbox. (The same updates are also in `supabase/migrations/`, one file each, if you prefer running them one by one.)

### 2. Login: email and password

People sign up with their **email and a password** (at least 8 characters); a phone number is optional. Spendbox emails them a link (through Resend) to confirm their email, and a **Forgot password?** link lets them choose a new password. This uses Supabase's built-in email-and-password login (on by default under **Authentication → Sign In / Providers → Email** — leave it on). You don't need to turn on Supabase's own confirmation emails: Spendbox sends its own.

> Accounts made earlier with a phone number and PIN still work: on the login page, they type their phone number instead of an email, and their PIN as the password. They can add an email in Profile.

### 3. Paystack (plans) and Resend (emails, optional)

- **Paystack** takes businesses' monthly payments. In [Paystack](https://dashboard.paystack.com) go to **Settings → API Keys & Webhooks**, copy the **Secret Key** and add it as `PAYSTACK_SECRET_KEY`. On the same page, set the **Live Webhook URL** to `https://<your site>/api/paystack/webhook`, so payments count even if someone closes the page before coming back.

- **Resend** (sends confirmation and password-reset links, perk alerts, and tells businesses about new members and partners): create an account at [resend.com](https://resend.com), add and verify your domain under **Domains**, then create an **API key**. Until a domain is verified, Resend only delivers to your own Resend login email.

### 4. Put the app online (Vercel)

1. Go to [vercel.com](https://vercel.com) → **Add New… → Project** → import this GitHub repository.
2. Before pressing Deploy, open **Environment Variables** and add:

| Name | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → **Project Settings → API** (or the **Connect** button): Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → **Project Settings → API Keys**: Publishable key (older projects: the `anon` key also works, as `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `SUPABASE_SECRET_KEY` | Supabase → **Project Settings → API Keys**: Secret key (older projects: `service_role` key, as `SUPABASE_SERVICE_ROLE_KEY`). Keep it private. |
| `NEXT_PUBLIC_SITE_URL` | Your app's address, e.g. `https://spendbox.vercel.app` (or your own domain) |
| `PAYSTACK_SECRET_KEY` | Paystack secret key (step 3) — takes businesses' monthly payments |
| `CRON_SECRET` | Any long random text. Lets Vercel run the daily job (birthday treats and plan reminders). |
| `RESEND_API_KEY` | Optional — Resend API key (step 3) |
| `EMAIL_FROM` | Optional — who emails come from, e.g. `Spendbox <hello@yourdomain.com>` (must be on your verified Resend domain) |
| `ADMIN_EMAIL` | The email you'll use to log in to the admin area at `/admin` |
| `ADMIN_PASSWORD` | Your admin password. At least 10 characters (longer is better) and don't reuse one. Change it here any time and redeploy; that signs everyone out of the admin area. |

Optional: `NEXT_PUBLIC_TRIAL_DAYS` (starting free-trial length, default `14`; change it later in `/admin`), `NEXT_PUBLIC_DEFAULT_COUNTRY_CODE` (default `234`), `NEXT_PUBLIC_TIME_ZONE` (default `Africa/Lagos`). See [`.env.example`](.env.example).

3. Press **Deploy**. If you change a variable later, redeploy (**Deployments → ⋯ → Redeploy**) so it takes effect.
4. **For speed:** in Vercel → **Settings → Functions → Function Region**, pick the region closest to your Supabase project's region (shown in Supabase → Project Settings → General). When the two are far apart, every page waits for the data to travel between continents.

> Tip: Vercel's Supabase integration (**Vercel → Storage → Supabase**) can fill in the Supabase variables for you. The app accepts the names it creates.

### 5. Try it

1. Open your site → **For businesses** → **Start free**. Create a business with your email and a password, then tap the link in the confirmation email.
2. On **Home**, add a welcome perk and copy your join link.
3. Open the join link in a private browser window and join as a customer with a different email. Type your name when asked.
4. As the customer, tap **What do you need today?**, write a request, set a budget, add a photo, pick WhatsApp and post it.
5. Back as the business, the request shows on **Home**. Tap **WhatsApp**: the chat opens, and the customer now sees that your business is reaching out.

### 6. The admin area (`/admin`)

Open `your-site/admin` and log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. It works on your phone too.

- **Dashboard:** businesses, customers, live requests, reach-outs, perks used, free trials, and charts of requests, new members and businesses over the last 30 days.
- **Businesses:** search, then open one to **pause** it (new customers can't join, and the owner sees a paused notice), give it **free time** with one tap (7 days to 1 year), **record a payment** made outside Paystack, or **delete** it.
- **People:** everyone with a login. **Pause** someone (they can't log in) or **delete** their account.
- **Settings:** set the **prices** of Starter and Plus, switch the **free trial** for new businesses on or off and set its length, pause **new business sign-ups**, pause **customers joining**, and switch **emails** off.
- **Team** (main admin only): give someone access with the email they use on Spendbox. They then log in to Spendbox as usual and open `/admin`. *Viewer* can only look, *Support* can also pause and change trials, *Manager* can also delete and change settings.
- **Activity:** every admin action, plus failed logins. After 8 wrong passwords from the same place, logins are blocked for 15 minutes.

---

## How it works

**Invite-only customers.** A customer account is created from a business's join link (`/j/business-name`). A friend's share link adds `?ref=…`, so the friend who shared it gets the invite perk when the new customer joins.

**Requests.** A customer can have up to 3 live requests at once, and post up to 10 a day. Each needs a description, a budget (an "up to" amount or a range) and at least one contact method. Photos are shrunk on the phone before uploading (max 4). A request is live for 24 hours; after that it moves to **Earlier**, where **Post again** fills in a new one. The customer can close it early, mark **Found my plug**, or delete it (the photos are deleted too).

**Who sees a request.** The businesses the customer joined — and, if one of those businesses is on **Plus** (or still in its free trial), its partners see it too, marked "Glow Spa's customer". Businesses get the customer's first name and only the contact details picked for that request (phone for WhatsApp or calls, email for email). When a business taps a contact button it's recorded once, so the customer sees "2 plugs are reaching out" with each business's name and a button to chat back.

**Perks.** Three simple kinds a business can see happen: **welcome** (on joining), **invite a friend** (for every friend who joins with the customer's link) and **birthday** (during their birthday month, even if the birthday is private). Perks are earned automatically; the business taps **Mark as given** on the customer's page. **Customers → Only customers with perks to give** lists everyone with a perk waiting. Each perk can have a time limit (1 week to 3 months, or none).

**Perks for customers.** Tapping a perk opens it full screen in the perk's colour, with a live clock (so a screenshot won't pass) and a **Share with [business]** button that sends the business a link to that perk — it opens straight into the perk in their dashboard, ready to mark as given.

**Partners (cross-promotion).** Under **Partners**, a business switches on cross-promotion and finds other businesses by name, category or area. Switching one on sends a request (or partners straight away if they approve instantly). A business can have up to 2 partners. Once partnered, each one's perks show to the other's customers under **Plugs your plugs recommend**, and on Plus each sees the other's customers' requests. Either side can end a partnership at any time. Partners never see each other's customer lists.

**Plans and fair use.** New businesses get a free trial (two weeks by default). After it, they pay monthly through Paystack: **Starter** (₦2,500, requests from your own customers, perks and partners) or **Plus** (₦5,000, also requests from your partners' customers). Prices, the trial length and whether there's a trial at all are set in `/admin` → Settings. Owners pay from **Settings → Plan & billing** for 1, 3, 6 or 12 months; paid time starts when their current time ends. The daily job reminds them before their plan ends. If a business still hasn't paid **14 days after** its plan ends, it's paused (new customers can't join and requests stop showing). Paying switches it straight back on. In `/admin`, open a business to give it free time with one tap, set an exact end date, or record a payment made outside Paystack.

**Contacting customers.** When a customer shares their details with a business, the business sees **Call**, **WhatsApp** and **Email** buttons on that customer's page (only for what the customer has added).

**Privacy.** Name, phone, email, gender and birthday are seen by a business only if that customer switches sharing on for it; otherwise the business sees a member number. Requests are the exception, and only for the contact methods the customer picked on that request. Customers can delete their account and everything in it.

**Emails (optional).** Customers can add an email to hear when a perk is ready. Businesses add an email in Settings to hear about new members and partner requests.

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
| `npm test` | Unit tests (phone numbers, plans) |
| `bash supabase/build-catch-up.sh` | Rebuilds `supabase/catch_up.sql` after you add or change a migration (add the new file's check to the list in the script first) |
| `TEST_DATABASE_URL=postgres://… npm run test:db` | Database scenario tests (joining, referrals, perks, privacy, permissions, partners, billing, requests). Needs an **empty, throwaway** Postgres database, never your real one. |

Project layout:

- `supabase/migrations/` — the whole database: tables, Row Level Security, the perk engine (`sync_member_rewards`), requests (`post_request`, `business_requests`, `contact_request`) and the functions the app calls.
- `src/app/` — pages. `/` front page, `/plug` the page for businesses, `/start` business sign-up, `/admin` admin area, `/login`, `/j/[slug]` join page, `/me/…` customer app (`/me` My Spendbox, `/me/new` post a request, `/me/plugs`, `/me/profile`), `/dashboard/[bizId]/…` business dashboard.
- `src/lib/requests.ts` — request rules shared by the screens (24 hours, photo limits, budget labels).
- `src/components/requests/` — the request cards for customers and businesses, and photo shrinking.
