# Things, the market, crafting, cars and reputation

Rules: `src/lib/world/items.ts`. Game: `src/app/play/item-actions.ts`, screens in
`src/app/play/life/things-sheet.tsx` (opened from the phone: My things, Shops, Cars, Market, Craft).
Database: `game-db/050_economy_items.sql`.

## Things
- Every kind has a shop price, a category, and an effect on its owner: Mind and Body every 2 hours
  (all your things together count up to +2 Mind and +1.5 Body), and reputation.
- Worth moves: art (+2.5% a month) and jewellery (+1%) gain value; gadgets (−3%), clothes, home
  goods, fitness gear and cars lose it. Once a kind has sold on the market, its worth is pulled
  halfway towards what people paid lately (the average of its last 10 sales), but that price only
  counts between half and one and a half times what the thing was worth when it was made: selling
  back and forth at silly prices can't push up what the shops pay. (A month is 2½ real days.)
- Ways to get them: buy from the shops (from Savings, then the wallet); find one now and then
  when you go somewhere (8%); get a gift from a player; or swipe something under ₦50,000 from a
  stall: 40% of the time you're caught (a fine of three times its price, reputation −10, Mind −5).

## The market
- Put anything of yours up at your price: listing costs 2% of the price. When it sells you get the
  price less 5% tax (to the state), shared out by your budget. At most 20 listings each.
- Or sell to a shop at once for 60% of what it's worth (never more than twice what it was worth
  when it was made).

## Crafting (inventing)
- Name it, pick the kind of thing (jewellery, clothing, a book, a gadget, home, art, fitness), how
  big (Small ×5, Medium ×3, Big ×2, Masterpiece ×1) and what it does (Mind, Body or reputation).
- Materials (55% of the size's worth for each copy) are paid at the start. It goes through market
  research, design, making and testing over real time: 1 hour (Small) to 24 (Masterpiece), faster
  the more you've made (down to a third).
- Your skill at it comes from your education (finished courses), your know-how in the matching job
  skills (a book: education and office work; a gadget: tech repairs and industry...) and how many
  things you've made. Skill decides the quality: how strong the effect is and what it's worth.
  Each copy is worth 0.82 to 1.17 times the size's worth (₦20,000 Small, ₦100,000 Medium,
  ₦500,000 Big, ₦3m Masterpiece), from the lowest quality to the best.
- Selling every copy straight to a shop: at the lowest quality you get back about 90% of the
  materials, at about half quality you break even, at the best about 1.28 times. A modest reward
  for skill, not a money machine; the real gains are selling to people on the market, the
  reputation, and the effects. (Until part 65 materials were 30% and copies 0.7 to 1.7 times, so
  every craft made 1.4 to 3.4 times its cost.)
- When it's done it becomes a new kind of thing in the game, made by you; the copies are yours to
  keep, give or sell. Every one people buy adds to your reputation. Two crafts at a time.

## Cars
- From a keke to a G-Wagon at the car dealers (Shops → Cars). They lose value each month and can be
  sold on the market or to a dealer. Own one and "My car" is a way to get to work (fuel only).

## Reputation
- Shown at the top (the star). Property (by what you paid, plus having a home), the reputation of
  your things, and inventions people bought; being caught swiping takes it down.

## Luxury

The shop's Luxury ✨ tab has the things Lagos's richest own, at roughly their real prices there:
a Cartier Love bracelet (₦12m), Rolex Submariner (₦28m), Hermès Birkin (₦60m), Rolex Daytona
(₦65m), Audemars Piguet Royal Oak (₦95m), Rolex Day-Date Platinum (₦120m), a diamond necklace
(₦180m), Patek Philippe Nautilus (₦250m), a Ben Enwonwu painting (₦300m), Bentley Bentayga (₦450m),
Richard Mille RM 11 (₦500m), Lamborghini Urus (₦550m), Rolls-Royce Cullinan (₦950m) and a Patek
Philippe Grandmaster Chime (₦1.5bn). Reputation is on the same scale as the cars (a G-Wagon, ₦250m,
gives 30): from +6 to +60, for as long as you own it. Watches, jewellery and art gain value over
time. game-db/104 raises the dearest single thing from ₦300m to ₦3bn.

## More things

Twenty-six more kinds join the shop at real Lagos prices: gold earrings and a signet ring; a gele,
designer sunglasses, an aso-oke set and a tailored suit; a Nigerian cookbook; wireless earbuds, a
party speaker, a tablet, a camera drone and a pro camera; a blender, a gas cooker, a sofa set, an
air conditioner, an inverter and batteries; a talking drum, an adire hanging and a Nok-style
terracotta head; a football, boxing gloves and a treadmill; a danfo bus, a Toyota Sienna and a
Toyota Hilux. Every thing also has its own moment in the story (docs/MOMENTS.md, "Your things").

## Pictures

Every kind in the shop has its own drawing (`src/app/play/life/item-art.tsx` and `art/`): watches
from one carefully drawn watch, varied by case, metal, dial, bezel and strap (`art/watches.tsx`);
things you wear (`art/wear.tsx`); books, gadgets, home, art and fitness (`art/home.tsx`); and the
cars, each from its own profile, plus the keke and the motorbike (`art/cars.tsx`). A kind that
isn't drawn (an invention) shows its category's drawing on the category's colour. A new kind in
the shop needs a drawing added to one of these, with its id as the key.

## At the market and the museum

- **Markets** (`src/app/play/city/market-kit.ts`) are drawn as a real Nigerian market at any size:
  dusty ground, rows of stalls between narrow aisles (rusty zinc sheds, big umbrellas, blue
  tarpaulins on poles, traders' mats), heaps of tomatoes, pepper, yam, plantain, onions, fabric and
  pots, lock-up shops with coloured shutters along two edges. Inside, traders sit at their stalls.
  **Shop at the stalls** opens the market's own goods (`MARKET_GOODS`): a bag of rice, palm oil,
  yam, tomatoes and pepper, stockfish, pots, a mortar and pestle, lace, okrika jeans, a charger,
  and the cheaper fabric, beads, crafts and kitchen things.
- **Museums** sell art (`MUSEUM_ART`, **Buy art** in their galleries): from a talking drum up to
  Nigeria's modern masters (Aina Onabolu, Uche Okeke, Twins Seven-Seven, Erhabor Emokpae, Yusuf
  Grillo, Ben Enwonwu) and a museum cast of an Ife bronze head, up to ₦1.2bn. Art gains value over
  time, and the masters bring a lot of reputation. Each new thing has its own moment.
