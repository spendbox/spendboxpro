# Real businesses on the map

Advertisers choose, in one wizard over the live map (`src/app/play/life/advertise-panel.tsx`):

1. **Billboard ads on their own** (`src/app/play/life/billboard-wizard.tsx`, `src/lib/ads.ts`): a picture,
   brand and line on the city's billboards, in one state or all of Nigeria, from ₦5,000 a week for 1 to
   8 weeks. Their ad goes up on the billboards round them while they make it (a note says only they
   see that preview, until it's paid for and live). On the map the picture fills the whole board, as in
   the preview: cropped to the board's 2:1 shape, with the line and brand on a see-through band at the
   bottom. A business with only a logo shows it whole, on a soft blur of itself.
2. **A building of their own, by the month**, which comes with their design on the billboards too.

Buildings are leased through Paystack, 1, 3, 6 or 12 months up front, with **Another month** any time
from the ad page. The rules and prices are in `src/lib/world/business.ts`; the server side in
`src/lib/business.ts`; the database in `game-db/043_business.sql`, 047 and `092_monthly_leases.sql`;
the numbers and upgrades at `/advertiser`.

## Leasing

- In the wizard: pick a state, then search an area, tap a monthly amount and step through buildings
  at that price, or tap a building on the map. Add a logo and billboard picture and see it lit up, then
  the details, how many months, and pay.
- Landmarks can't be leased.
- **Buildings people live in** (anything with homes: rooming houses, bungalows, duplexes, terraces,
  flats, apartments, shops with flats) can be leased even when players own homes there. They keep
  their homes, and anyone can still buy and live in its homes while the lease runs, so advertising
  never takes places to live off the map (game-db/094). Nobody can rename the building while it's
  leased, and the business can't refit it or add storeys. Its card has **Homes in this building**.
- Other buildings (offices, plazas, shops, towers, warehouses, land) can only be leased when no player
  owns any of it, and players can't buy units in them while the lease runs.
- The business gives its name, what kind of business, what it does, its **real address**, phone,
  WhatsApp, website and logo. It signs in later with that email at `/advertiser`.
- **One live lease per account for now, and at most one new lease a week.**

A building costs at least **3 times** billboard ads alone (the smallest billboard ad is ₦5,000 a week,
₦20,000 for 4 weeks), because it comes with the billboards and a building with your name besides.

| Building | A month (before the area) |
| --- | --- |
| Lock-up shops, shop with flats, bungalow, rooming house, land | ₦60,000–₦72,000 |
| Duplex, terrace | ₦180,000 |
| Flats, warehouse | ₦240,000 |
| Office block | ₦360,000 |
| Shopping plaza, apartment tower | ₦720,000 |
| Glass tower | ₦1,500,000 |

The area changes it about 0.6× (cheapest areas) to 2× (Ikoyi, VI), never under ₦60,000 or over ₦3m a
month. A lease runs 30 days for each month paid (leases from before monthly ones keep their year),
or until it has been tapped as many times as it covers (₦20 a tap). Upgrades are priced from the
monthly price: another month is a month's price, a refit 40% of it, a storey a month's price, a bright
sign ₦15,000.

## On the map

A leased building glows softly (a ring of warm light), with the business's logo and name over it.
Tapping it opens the business's card: what they do, their real address, and Call, WhatsApp, Website
and Directions (Google Maps) buttons. Anything arranged with them happens outside the game.

## Upgrades

| Upgrade | Price | What it does |
| --- | --- | --- |
| Bright sign | ₦15,000 | Glows brighter; the logo shows bigger and from further away |
| Refit | a tenth of the lease (at least ₦10,000) | Turn it into shopfronts, a plaza, offices, a glass tower, a warehouse... |
| Add a storey | a quarter of the lease (at least ₦15,000) | One more floor, from 30 days after the lease starts |

**Advertising is leasing a building** (part 47, `game-db/047_ads_are_property.sql`): every lease is on the
city's billboards from day one, showing its logo until the business uploads a billboard design, which it can
swap any time, free, from `/advertiser`. A lease runs a year, or until its building and billboards have been
tapped (opening its card) as many times as it paid for, one tap for every ₦20 (`lease_naira_per_click`),
whichever comes first. Players no longer get mint for tapping ads (`ad_rewards_per_day` is 0).

## Numbers

At `/advertiser`, each business sees, all time and this week: building taps, card views, billboard
views, calls, WhatsApp taps, website visits and directions.

## To do

- Taking a business down: set its `status` to `removed` in `business_leases` (Supabase).

## Advertising, on the map (`src/app/play/life/advertise-panel.tsx`)
Every Advertise button (a building's card, an empty billboard, the explainer, `/advertise`, and
`/advertise/start` or `/business`, which now just open the map) opens a panel over the live 3D map,
never a new page:
1. **Where.** The state the ad shows in (every Nigerian state is listed; the ones on the map can be
   picked, the rest say "soon"). Your building and billboards show to the people living in that
   state. Then search an area or landmark (the camera flies there and steps through free buildings
   nearest first), or tap an amount (₦20k to ₦1m, or type one): the map flies to a free building at
   about that yearly price, and ‹ › cycle through the others (`leasableByPrice`). Or tap any building.
   Each one shows as a small 3D block, bigger the dearer it is.
2. **Your pictures.** Upload the logo and the billboard picture (big photos are shrunk in the
   browser). The building on the map lights up with your name and your picture goes on the
   billboards near you, live; "Take a preview picture" grabs the 3D view as it'll look.
3. **Details & pay.** The lease form; both pictures upload with it (the billboard one is set on the
   lease), then Paystack. Paystack sends the business back to `/business/enter`, which checks the
   payment and signs it in to `/advertiser` on that device (for 3 days after the lease is taken;
   after that, the email code), where it sees its numbers.
