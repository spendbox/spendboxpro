# Buying landmarks

Every landmark on the map (the airport, the National Stadium, Eko Hotel, Balogun Market, the
cathedrals and mosques, the parks...) can be bought outright by one player, for crazy money.

## The price

Worked out by the game from the map, never from the phone (`src/lib/world/landmark-price.ts`):

- each kind of landmark has its own price at its usual size (an airport ₦1.5tn, a port ₦900bn, a
  stadium ₦400bn, a hotel ₦300bn, a market ₦200bn, a museum ₦120bn, a club ₦60bn...);
- bigger costs more: twice the ground costs about 1.4 times as much;
- a small, fixed difference between landmarks of the same kind (up to 8% either way), from the name;
- always between ₦50bn and ₦2tn, rounded to the nearest ₦1bn (₦10bn from ₦100bn up);
- your reputation level takes its usual discount off (`src/lib/world/rep-levels.ts`).

Some Lagos prices: Murtala Muhammed Airport ₦2tn, Unilag ₦2tn, Apapa Port ₦1.58tn, Lagos City Hall
₦440bn, National Stadium ₦400bn, Eko Hotel ₦290bn, Balogun Market ₦240bn, National Museum ₦110bn.

## Owning one

- One owner per landmark. Once it's bought nobody else can buy it (if the owner's account is
  deleted, it's for sale again).
- The price is burned (taken out of the game), like property bought from the city.
- It earns like property: the same share of what you paid every day (the `property_income_day`
  setting, 10% now), paid automatically with the rest of your property income.
- You get a notification when you buy one.

## Where it lives

- Database: `game-db/082_landmarks.sql`: the `landmark_owners` table, `landmark_buy`,
  `landmark_owners_list`, and `property_income_day` now counts landmarks too. Setting
  `landmark_price_max` (5bn mint) is a sanity check on prices. Test: `game-db/tests/landmarks.test.sql`.
- Server: `src/app/play/landmark-actions.ts` (`landmarkOwner`, `buyLandmark`).
- Screen: `src/app/play/life/landmark-buy.tsx`, the "Own this landmark" part of a landmark's card.
