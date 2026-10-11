# Trying the real-map game on the live site

Everything below has been built and tested on the test page (`/world-lab`), where nothing is
saved and nothing is paid. This is how to switch it on for real and check it on your phone.
It takes about 20 minutes. Tick each box as you go.

## 1. The database (Supabase), about 5 minutes

Open your project at supabase.com → **SQL Editor** → **New query**. For each file below, in this
order: open it on GitHub (the `game-db` folder), copy all of it, paste it into the editor, press
**Run** and wait for "Success". Each one is safe to run twice.

- [ ] `038_property.sql`: owning property, the starting budget
- [ ] `039_work.sql`: jobs, fares, neighbours
- [ ] `040_living.sql`: money pots, bills, health, school
- [ ] `041_your_day.sql`: side hustles, exercise, interviews, breakthroughs
- [ ] `042_starter_packs.sql`: the four starting choices
- [ ] `043_business.sql`: businesses leasing buildings
- [ ] `044_services.sql`: services between players
- [ ] `045_map_reports.sql`: map problem reports
- [ ] `046_market.sql`: selling, offers, tenants, World Bank loans

If one shows a red error, stop and send me the error text.

## 2. Settings (Vercel), about 5 minutes

Open your project at vercel.com → **Settings** → **Environment Variables**. Add each one (for
Production), then go to **Deployments** and **Redeploy** the latest one so they take effect.

- [ ] `GAME_SECRET`: any long random text, e.g. 40 letters and numbers mashed on the keyboard.
      Set it once and never change it.
- [ ] `PAYSTACK_SECRET_KEY`: from paystack.com → Settings → **API Keys & Webhooks** → Secret Key.
      Use the **test** key (`sk_test_...`) first; switch to the live key (`sk_live_...`) when the
      test payment works.
- [ ] `ADMIN_EMAIL`: the email you sign in with. It lets you see map reports at `/map-reports`.

## 3. Paystack, about 2 minutes

- [ ] On the same Paystack page (**API Keys & Webhooks**), set **Webhook URL** to
      `https://newtown.world/api/paystack/webhook` (your own site address if it's different).
      Payments for packs, business leases and ads all come back through it.

## 4. Try it on your phone, about 10 minutes

Open `https://newtown.world/play?world=lagos` and sign in. Check each step:

- [ ] **Start:** the four starting choices appear. Pick **The Hustler (free)**. The home search
      opens by itself.
- [ ] **Home:** tap a cheap room in the list. The map flies there and the building's card opens.
      Tap **Buy**. Home, Work and Money buttons appear at the top.
- [ ] **Job:** tap **Work** and take a job near you (one that says "No experience needed").
- [ ] **Money:** open **Money**. Your wallet and pots show. After a game day (2 real hours),
      collect your pay from **Work**.
- [ ] **Map report:** tap **Report a problem**, send one, then open `/map-reports` (signed in as
      `ADMIN_EMAIL`) and see it there.
- [ ] **A real payment (test key):** on a second account (a new email), pick **Uncle Abroad
      (₦1,000)**. Paystack's page opens; pay with Paystack's test card
      (`4084 0840 8408 4081`, any future date, CVV `408`, PIN `0000`, OTP `123456`). You come back to the
      map with ₥20,000.
- [ ] **Two players:** with both accounts, put a unit up for sale on one and buy it (or make an
      offer) from the other.

If anything doesn't work, tell me which step and what you saw (a screenshot helps). I'll fix it.

## When the test payment works

- [ ] Change `PAYSTACK_SECRET_KEY` in Vercel to the live key and redeploy.
- [ ] Make one real ₦1,000 pack payment to be sure.
