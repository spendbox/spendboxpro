# Property, money and the start of a life

How owning buildings works, where the money comes from and goes, and the order to build it.
The bigger picture is in `docs/LIFE.md`; the map is in `docs/WORLD.md`.

---

## 1. Buildings: many kinds, made from rules

Every building is made from a **recipe**, worked out from where it stands (the seed, the
district, the culture), never from a fixed list of models:

- **Plot:** one tile up to several joined tiles (an estate or a plaza takes a whole block).
- **Use:** home, shops, offices, mixed (shops below, flats above), industry, farm, worship,
  school, hospital, hotel, government.
- **Form:** storeys, footprint shape (box, L, U, courtyard, twin blocks), setbacks, roof (flat,
  hipped, gabled, water tanks and solar on top), balconies, a ground floor raised on pillars,
  a compound wall and gate, a car park.
- **State:** a building site, part-built, **uncompleted** (left unfinished, rods sticking out of
  the roof), finished, ageing, damaged, being renovated, demolished.
- **Style from the culture:** in Lagos that means bungalows, duplexes, "face-me-I-face-you" rooming
  houses, 3–4 storey blocks of flats, gated estates of identical houses, shopping plazas, glass
  towers on the islands, warehouses, filling stations, churches and mosques of every size,
  markets, farmland at the edges.

Combining these gives thousands of distinct buildings, all drawn from the same cheap pieces, so
it costs no more to draw than today. A recipe is never stored. Only when an owner changes a
building (renovates, rebuilds) is the new recipe saved.

**Floors and units:** every building is split into units (a flat, a floor, a shop, a whole
house). Each unit can be owned, rented out or made someone's home.

## 2. What a property is worth

A property's value is **land + building**, like real property:

- **Land value** = plot area × the area's price per m² of land × demand. Land is what location
  and popularity move. It never depreciates on its own.
- **Building value** = floor area × building cost per m² (by kind: a glass tower costs more to
  build than a bungalow) × condition (new, ageing, uncompleted, damaged) × upgrades (a pool, a
  generator, security, a lift: a few percent each).
- **A unit's value** (a flat, a floor, a shop) is its share of both: its floor area, times a small
  factor for its floor (higher floors and penthouses more; ground-floor shops on a busy road more).
  A building's units always add up to the whole building.

This makes rebuilding meaningful. Demolish an old block and the land keeps its value, and a new
building adds its own. An uncompleted building on Ikoyi land is still worth a lot, for the land.

**Not valued:** the rooms and parts inside a building (a kitchen, a stage, a bar). They make a
place useful and bring visitors, which earns entry fees, but they don't set its price. Valuing
parts by how much they're used would be confusing for players and easy to fake with fake visits.

- **Local price per m²:** a table of real prices by area, worldwide. For Lagos, Ikoyi, Victoria
  Island and Lekki are high; Yaba, Surulere and Ikeja are middle; Ajegunle, Mushin and the edges
  are low. Every new city or country comes with its own table, so prices are realistic wherever
  the map grows.
- **Building factor:** its kind, how many storeys, its condition (new, aged, uncompleted,
  damaged) and its improvements.
- **Demand:** rises with how many people own property nearby, how many live there, and how many
  distinct, genuine people visit. It's worked out for each neighbourhood every game day and
  moves land values only, a little at a time (capped per day), so nobody can pump a street
  overnight.

Players see **their assets grow**: today's value, the change since they bought it, and a small
chart.

**Landmarks can't be bought.** They belong to the city (later the government, see section 8).

## 3. Money coming in: how real estate earns

Like real estate, not every property pays out. Each unit is one of these:

| Kind | Earns | Value over time |
| --- | --- | --- |
| **Your home** (primary residence) | Nothing, but you pay no rent | Grows with the land (and the area's demand); the building ages unless kept up |
| **Rental home** (a room, flat, house let out) | Rent each game month (every 2½ real days), only while a tenant is in | As above |
| **Commercial** (a shop, office, plaza, warehouse) | Rent each game day, higher than homes, from businesses (players or NPCs) | As above; empty more often when the street is quiet |
| **Land** (an empty plot) | Nothing | Grows with demand; build on it to make it earn |

- **Tenants:** each area has a share of NPC tenants looking (more in busy areas). A unit put up
  for rent fills sooner if the rent is fair and the area is popular, and can sit empty if
  not. Players can rent too.
- **Rent levels** follow real ones: homes earn about 5–7% of their value a year in rent,
  commercial about 8–10% (a game year is a real month).
- **Entry fees:** each time someone enters a property, the owner gets a small fee.
- **Selling:** at the asking price, or by accepting an offer.
- **Jobs:** they already exist (interviews, shifts, pay); school and courses unlock better ones.
- **Ads (later):** a share of the real ad revenue in each area. See section 8.

**Transport costs** are part of living somewhere: every trip (walk free; okada, keke, danfo, BRT,
train, ferry, taxi, plane) costs by distance and mode, so living far from where you work or
play costs you every day. That's one reason central places are worth more.

## 4. Taxes and treasuries

Every money movement is taxed, and every tax goes to a public treasury:

- **The state treasury** (Lagos State): property tax, tax on sales, on earnings, on entry fees.
- **The country treasury** (Nigeria): a share of those taxes, plus import and company taxes later.
- **The World Bank:** funded by loan interest and its own fees; it lends to players.

Anyone can open each treasury and see its balance, what came in and what was spent, item by
item (roads, rebuilding after a flood, government salaries).

**Later, with politics:**
- A **governor** can appoint people and spend from the state treasury.
- A **president** can do the same with the country treasury.
- A **local government chairman** can spend a local budget.

Until then the game runs the treasuries itself: roads, repairs, events.

## 5. Money going out

So money doesn't only pile up:

- Buying property, and the fees and tax on a sale.
- Upkeep: buildings age and need repairs, or they lose value.
- Improving, demolishing and rebuilding (each costs money and takes game days).
- Loan interest.
- Travel (more for longer trips and faster modes), food, school fees.
- Rent, if you rent.

Every way mint is made or destroyed goes into the `coin_supply_daily` view, so the books balance.
That rule is already in `TODO.md`.

## 6. Starting a life

1. A new player gets a **starting budget**.
2. They **search** the map for property in their budget: a search bar, not a phone. Search finds
   places, addresses, neighbourhoods, properties for sale and people, and flies the camera there.
3. They **must buy a home first**: a room, a flat, a floor or a house. They can't start anything
   else without one.
4. That home is their **primary residence**. They can switch it to any property or floor they
   own later.
5. **Assets** replaces the houses screen: everything they own, its value, its earnings, and which
   one is home.

The budget decides where they can start. Someone can start in a ₦1 million room and work up to
an Ikoyi penthouse.

## 7. Trading and loans

- **Offers:** offer to buy anyone's property; the owner accepts, refuses or counters. Payment is
  held until both agree.
- **World Bank:** loans against property, with interest and repayments. Miss repayments and the
  bank takes the property and sells it.
- **People search:** find players by name, see their public profile, message them, add friends
  (friends already exist).

## 8. Ads: sharing real revenue (later)

Only ever a share of the ad revenue the game actually earns, never new money:

1. Each area's share follows **real attention**: verified, distinct people who visited, how long
   they stayed, and how valuable the area's property is.
2. Within an area, each owner's share follows their property's value and its genuine visits.
3. **Against farming:**
   - Players must reach a set level before earning.
   - Visits only count from different, verified people. Your own visits, the same few accounts
     visiting each other, and bursts of visits don't count.
   - There's a cap per person, payments wait a while before they're released, and patterns can
     be checked.
4. **Cashing out real money** needs identity checks and tax handling, and must be cleared with a
   lawyer first. It's the item already on the to-do list, now more important than ever.

## 9. Later

- Improving, demolishing and rebuilding.
- Government roles (councillor, local government chairman, governor) and the rules they can set
  from a menu with limits.
- Government contracts: build a road, fix a bridge, rebuild after a flood.

---

## 10. Decisions to make (owner)

1. **What a mint is worth.** Today jobs pay ₥15–₥60 an hour and fees are under ₥5, so 1 mint is
   roughly like $1. Suggestion: keep that everywhere, and show the local equivalent beside prices
   (a Yaba flat for ₥35,000 ≈ ₦50 million). Prices then make sense in every country.
2. **How fast property earns.** Real property returns about 5–8% a year. With one game year per
   real month (see `docs/LIFE.md`), 6% a game year is 6% a real month: noticeable, not instant.
3. **Starting budget:** ₥5,000 (about ₦7.5m): enough for a room in most of Lagos (see section 11).
4. **Ghosts and the minigames:** ghosts go completely. Suggestion for the minigames: take them
   out of the menus but keep the code, since many can come back as things to do inside places
   (darts in a bar, cards at home).

---

## 11. The order to build it

**Step 1: buildings worth owning** — first part done:
- Lagos's map origin is fixed for good, so every building keeps its address (`lagos:<x>,<z>`)
  and every unit its id (`lagos:<x>,<z>/<n>`) as the map grows.
- 14 kinds of building (`src/lib/world/buildings.ts`, drawn by `src/app/play/city/building-kit.ts`),
  chosen by how busy and how wealthy each spot is, some left unfinished or as building sites, each
  split into units: about 22,600 properties and 107,000 units in Lagos.
- Values: land + building (`src/lib/world/value.ts`), Lagos prices in
  `src/lib/world/regions/lagos/prices.ts` and `districts.ts`; the map's bubbles show each
  property's kind and value.
- Prices today (1 mint = ₦1,500): a room from about ₥2,000–₥3,500 (₦3–5m), the middle unit about
  ₥8,600, a bungalow about ₥48,000, a top floor of an Eko Atlantic tower about ₥820,000. A starting
  budget of ₥5,000 could buy any of about 41,000 homes (mostly rooms), so ₥5,000 looks right.

Still to do in step 1:
1. Every building and unit gets a permanent identity on the real map (not tied to hourly rounds).
2. The building recipe: many kinds, floors and units, states (uncompleted and so on).
3. The value formula (land + building) and the price tables for Lagos.

**Step 2: the start of a life**
4. The search bar: places, addresses, neighbourhoods, properties; it flies the camera there.
5. Database: wallets, ownership, units, sales history, every mint movement recorded.
6. Starting budget, then buy a home, then primary residence.
7. The Assets screen (replacing houses), with growing values.
8. Earnings every minute, and entry fees; taxes into the state and country treasuries, which
   anyone can view.
9. Hide ghosts and the minigames.

**Step 3: a market**
10. Offers and sales between players; rent.
11. World Bank loans.
12. People search and messages.
13. Demand that moves values (ownership, population, visits).

**Step 4: changing the city**
14. Improve, demolish, rebuild.
15. Jobs and school tied to the new map.

**Step 5: later**
16. Ad revenue sharing, once real revenue exists and the lawyer agrees.
17. Government roles: governor (appoints, spends the state treasury), president (the country
    treasury), local government chairman; contracts.
