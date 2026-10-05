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
4. At the end you'll see a table of every update. Every row should say **yes**.

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
4. **For speed (important):** in Vercel → **Settings → Functions → Function Region**, pick the region closest to your Supabase project's region (shown in Supabase → Project Settings → General). When the two are far apart, every page waits for the data to travel between continents.
5. **For speed, too:** in Supabase → **Project Settings → JWT Keys**, if it offers to migrate from the legacy JWT secret to the new signing keys, do it (follow Supabase's steps). Then Spendbox checks logins without an extra trip to Supabase on every page.

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

**Open sign-up for customers.** Anyone can create a customer account at `/signup` (linked from the front page and login). Customers can also sign up from a business's join link (`/j/business-name`), which makes them that business's customer at the same time. A friend's share link adds `?ref=…`, so the friend who shared it gets the invite perk when the new customer joins.

**Requests.** A customer can have up to 3 live requests at once, and post up to 10 a day. Each needs a description, a budget (an "up to" amount or a range) and at least one contact method. Photos are shrunk on the phone before uploading (max 4). A request is live for 24 hours; after that it moves to **Earlier**, where **Post again** fills in a new one. The customer can close it early, mark **Found my plug**, or delete it (the photos are deleted too).

**Who sees a request.** The businesses the customer joined — and, if one of those businesses is on **Plus** (or still in its free trial), its partners see it too, marked "Glow Spa's customer". Businesses get the customer's first name and only the contact details picked for that request (phone for WhatsApp or calls, email for email). When a business taps a contact button it's recorded once, so the customer sees "2 plugs are reaching out" with each business's name and a button to chat back.

**Products & services.** On **Home → Products & services**, a business adds a photo or a short video (up to 60 seconds) with a name, description and optional price. Photos are shrunk on the phone; videos go straight from the phone to storage with a one-time upload link, and the phone grabs a still frame for the thumbnail. After posting, **Share to WhatsApp status** opens the phone's share sheet with the photo or video. Products show in **My Spendbox → Explore** for the business's customers and its partners' customers (with cross-promotion on): small round pictures, newest first, with a bright ring until seen, and a search box. Tapping one opens a full-screen, swipe-up viewer where customers can like it (it goes to **My box**) or chat, call or email the business. **Home → Stats** and each product's page show views, people, partner views, likes and who got in touch.

**3D marketplace.** Explore opens on a little 3D town (switch to **Grid** any time; the choice is remembered on that phone). Every business the customer joined, and those businesses' partners, is a shop on a street, with its name and how many customers it has (shortened for big numbers, like 12.4K) floating above it; the town grows block by block as there are more shops, with roads, parks, trees and cars. A red badge on a shop shows how many products the customer hasn't seen. Drag to move around, pinch or scroll to zoom. Tapping a shop opens its 3D store full screen, with close-to-real materials (marble, glossy leather, oak, cane, brass), soft daylight shadows and reflections: a welcome board at the top of the back wall, a big wall screen showing the shop's logo, name and newest products (with prices and NEW tags; the tiles always fill the screen: up to 4 in one row, then 3 + 2, 3 + 3, 4 + 3, 4 + 4, with "+N See all" after 8, and a featured layout for a single product), a fluted marble counter with a bell (tap to chat, call or email), plants, a lounge table set on a rug and framed wall art. When the business has perks, a wrapped **gift** sits on the counter (and a Gift button below): tap it, it shakes open, and shows the perks with a button to join. Tapping a product on the screen opens the swipe viewer with just that shop's products, and closing it goes back into the store. Shoppers can look around but can't change anything.

**The product hall.** Behind the visitor as they walk in, every product is a framed picture, down a hall that grows as the business adds products (up to 400). Products are grouped by **category**, each a section with a hanging sign, and everything stands against a wall facing the walkway down the middle, so the middle stays clear and no picture hides another. There are three places for a section: the **left aisle**, the **right aisle** (as you walk in) and the **back wall**. A section goes where the business put it, or else to whichever aisle is shorter, so both sides fill before the hall gets longer, and several sections can follow each other down one aisle. Each category shows the way the business chose: **framed on the wall** (one row, a brass picture light over each), **on shelves** (shelving units, eye level first) or **on display tables** (one row of frames facing the walkway). Shelves come in five designs (in the business's colour, walnut, light oak, white lacquer, black and brass) and tables in five (marble on the business's colour, white marble, oak, glass and brass, black marble), each in three sizes (3, 4 or 6 across). Frames come in five styles (walnut and mat, thin black, gold, white, a frameless canvas) and three sizes, and each frame is the shape of its own photo (tall, square, wide or long; `products.media_aspect`, update 22, measured in the browser for older products), unless the business picks one shape for the category. The back wall can show one category instead of its decorations (great for businesses with only a few things; anything that doesn't fit carries on in an aisle). Wall frames cast no shadows on the floor. Visitors drag to look round, pinch or scroll to walk, tap the floor to walk there (never into a table or shelf), or use the section buttons. Tapping a product, or the table or shelf it's on, glides up to it; tapping again opens it full screen.

**Many products at once.** **Products & services → Add many at once** (`/dashboard/…/products/bulk`) takes up to 30 photos and videos in one go. Each becomes a draft with its name (taken from the file name unless it's a camera's IMG_1234), price, description and product/service; a "same for selected" bar sets price, description or product/service for several together. Nothing is posted until **Post all**, which needs every one named; then **Share all to WhatsApp** sends all the photos and videos to the phone's share sheet together (WhatsApp status or a chat). Computers, which can't share files, open WhatsApp with the names, prices and link instead. WhatsApp has no way for other apps to post a status or a catalogue directly, so the share sheet is the closest. On the products grid, **Select** picks several products to **Edit** together (on one page, with the same "same for selected" bar), **Share**, **Hide**, **Show** or **Delete**.

**Categories.** Every product or service has a category, picked when it's posted (on its own, many at once, or when editing). The app suggests the best one as the name is typed, from a built-in list of common product and service categories (clothes, fabrics, shoes, bags, jewellery, hair & wigs, beauty, perfumes, phones, electronics, home & furniture, food, cakes, drinks, groceries, homes & property, cars, hair styling, make-up & nails, tailoring, photography, events, catering, repairs, classes and more), each with many words that point to it (sneakers, jollof, duplex, knotless…), then the business's own categories. It knows a food word used as a colour isn't food ("Coffee brown gown" is clothes). The picker opens as a sheet on phones, with search (by name or by those words), suggestions, the categories that suit the business, and **Add your own category** (a name, and where it shows in the 3D shop, picked from little pictures of a wall, shelves and a table). A business's own categories are kept in the shop design; products are saved with `products.category` (update 21). Older products without one are placed by the same suggestions. Photos are shown whole in their frames; there is no background removal (`products.cutout_url` from update 20 is no longer used).

**Drafts are kept.** In **Add many at once**, the photos, videos and everything typed are saved on the phone or computer (in the browser) as you go, so a closed tab, a dead battery or a failed upload loses nothing: open the page again and they're back. They're cleared once posted.

**Sharing a product on WhatsApp.** WhatsApp's chat links can't carry a photo, so the message to the business includes a short link (`/s/[shop]/p/[product]`) that WhatsApp shows as a preview card with the product's picture, name and price; the link opens a simple product page with Chat and "Walk into" buttons.

**Swipe viewer.** Full-screen products show "2 of 8" at the top and, on opening, "Swipe up for more" (on computers: scroll or press ↓, with up and down buttons).

**The business's own shop.** A business's home page has a **Grid / 3D shop** switch to walk round its shop as customers do, and "Design your 3D shop" is one of the setup steps (it opens the editor straight away).

**Editing the 3D shop (business only).** In **Settings → Your 3D shop**, **Edit my shop** opens a full-screen editor. Tap anything in the shop (or a tool at the bottom) to change it: the **welcome board** (light box, colour pill, neon on smoked glass, brass letters or a felt letter board, with the business's own words), the **backdrop** behind the screen (oak or walnut slats, white fluted panels, a marble slab, an accent panel, brick, a living wall of leaves, or plain), each **plant** on its own (bird of paradise, monstera, olive tree, snake plant, flowers, pampas grass or none, and the pot colour), the **table** set (Sage booth, Marble & cane, Bistro, Linen dinner, Garden ring or none), the **rug** (plain, border, stripes, geometric, woven jute or none, in eight colours), the **counter** (show or hide the business name on it), the **lamps** (dome, opal globe, brass cone, rattan or a linear bar, in warm, neutral or cool light), the two **wall pictures** (five prints, or upload your own photo), the **floor** (oak planks, herringbone, checker tiles, terrazzo, polished concrete or marble, each in several colours) the wall and accent **colours**, the **categories** (tap one to choose framed on the wall, on shelves or on tables, from pictures that use its own product photos and the shop's colour; which side, or the back wall; the shelf or table design; the size; the frame style and shape; add a category; tap a product in the hall to move it to another category), the **signs** over each section (dark, light, the shop's colour, brass, or any colour), the **door and window** (steel and glass, oak, arched glass, French doors or a door in the shop's colour; a steel grid, arched, plain or shuttered window; any frame colour), and the hall's **back wall** (a centrepiece: the business's name, a big framed print or photo, an arched mirror, a living wall or floating shelves; brass sconces, opal globes or a picture light; a console table with flowers or books; and a plant in each corner, each with its own space so nothing overlaps). Every colour (walls, accent, floor, rug, signs, door and window) can also be anything from the colour picker, so there are well over a million ways to set a shop up. Changes show straight away and are kept on **Save**; replaced uploaded pictures are deleted.

**Sharing.** A business's home page and Customers page share its 3D shop link (`/s/…`), and customers inviting friends share it too, with their invite code (`/s/…?ref=…`) so the invite perk still counts. The front page leads with the 3D shops ("Shop comfortably. Shop different.") and the page for businesses shows one off.

**Inside a shop.** The business's name at the top opens its details (about, location, joining). At the bottom, one scrolling row holds the Gift, All products, Partners and section buttons, with a big green **Chat** button below, so nothing overlaps on a phone. On a business's page, **Ready for you** shows three perks with **View all** for the rest.

**Sharing the 3D shop.** Each shop has a link, `/s/their-link`, that anyone can open, even without an account: it walks them into the 3D shop, with **Join** and **Chat** buttons. Products on the screen open the swipe viewer (liking or tapping the business there asks them to join), and the gift shows the perks. The business finds the link on **Your 3D shop**, and the share button inside a shop sends it too.

The 3D scenes are React components (three.js through React Three Fiber, about 250 KB compressed; every texture is drawn in code, so there are no model or image downloads), and that code only downloads when the map or a store is opened, and devices without 3D support get the grid.

**Business home tabs.** Products & services, Requests and Stats, each with the join link at the top. My Spendbox has Explore, My box and Ask (requests).

**Birthday emails.** On a customer's birthday, each business where their birthday treat is still waiting emails them in its own name ("Kemi Cakes via Spendbox"), once.

**Invite reward.** The friend gets the welcome perk; the customer who shared gets the invite reward. So a business needs a welcome perk before it can add an invite reward, and pausing or deleting the welcome perk pauses the invite reward too.

**Customer interests.** Every request also feeds a private profile of that customer (`customer_interests`, built from `request_signals`): what they ask for most (categories and key words), their usual budget, areas, how they like to be reached, how often they post and find a plug. Deleted requests still count. Only Spendbox sees it, in `/admin` → People → a person; businesses never do.

**Joining, one question at a time.** The Join button (on a business's join page, or in its shared 3D shop) opens a pop-up that asks one thing per step: email, then password. Someone new to Spendbox is then asked their name and (optionally) phone number; people who already have an account skip those. The last step asks whether to share their details with the business, then they're in.

**A plug's page.** Opening a plug (from **Plugs**) shows any perk waiting, then tabs for its **Products** (tap one for the swipe viewer, and back), **Perks** (with the Bring a friend link) and **Partners** (the businesses it partners with, each with a way into their 3D shop and a Join or Open button). A **Regular / 3D shop** switch at the top shows the plug's 3D shop right on the page, with a full-screen button. If the plug has partners, a **door** at the back of the shop (and a Partners button) swings open onto them, with Walk in links to their shops.

**Inviting businesses.** At the top of customers' **Plugs** page, a compact **Invite more plugs** bar has a link (to `/plug`, the business sign-up page) to send to a business they love that isn't on Spendbox yet.

**Customer invites.** On **Plugs**, a customer's "Invite more plugs" link is `/plug?by=their-code`. A business that signs up from it (within 30 days, on the same device) gets that customer added to its customers straight away, with its welcome perk (update 18, `claim_inviter`).

**Partner invites.** On **Partners**, a business can share an invite link (`/start?partner=their-link`). A business that signs up from it becomes their partner straight away, if the inviter still has a free place.

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
