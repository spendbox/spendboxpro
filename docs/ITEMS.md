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
