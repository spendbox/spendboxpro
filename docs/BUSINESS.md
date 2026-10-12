# Real businesses on the map

Real businesses lease a building in Newtown's Lagos for a year, through Paystack. The rules and
prices are in `src/lib/world/business.ts`; the server side in `src/lib/business.ts`; the database in
`game-db/043_business.sql`; the pages are `/business` (lease) and `/advertiser` (numbers and upgrades).

## Leasing

- On the map, tap a building → **Lease this building** (on its card) → `/business?building=…`.
- Landmarks can't be leased, nor any building players own part of; players can't buy units in a
  leased building while the lease runs.
- The business gives its name, what kind of business, what it does, its **real address**, phone,
  WhatsApp, website and logo, then pays a year's lease. It signs in later with that email at
  `/advertiser` (the same sign-in as advertisers).
- **One live lease per account for now, and at most one new lease a week.**

| Building | A year (before the area) |
| --- | --- |
| Lock-up shops, shop with flats, bungalow, rooming house, land | ₦20,000–₦25,000 |
| Duplex, terrace | ₦60,000 |
| Flats, warehouse | ₦80,000 |
| Office block | ₦120,000 |
| Shopping plaza, apartment tower | ₦250,000 |
| Glass tower | ₦600,000 |

The area changes it about 0.6× (cheapest areas) to 2× (Ikoyi, VI), never under ₦20,000 or over ₦1m.

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

## Advertising, step by step (`/advertise/start`)
Every Advertise button (a building's card, the empty billboard, the guest explainer, `/advertise`)
opens a three-step wizard (`src/app/advertise/start/`): 1) how it works, with pictures (you own a
building for a year, players tap it and find you, your design on the billboards, your numbers);
2) find a building: search a neighbourhood, district or landmark, set a budget, and see the
buildings nobody owns there, nearest first (`leasableNear` in `src/lib/business.ts`); 3) your
business and pay (the lease form, then Paystack). From a building's card it starts at step 3.
