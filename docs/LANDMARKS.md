# Buying landmarks

Every landmark on the map (the airport, the National Stadium, Eko Hotel, Balogun Market, the
cathedrals and mosques, the parks...) can be bought outright by one player, for crazy money.

## The price

Worked out by the game from the map, never from the phone (`src/lib/world/landmark-price.ts`):

- each kind of landmark has its own price at its usual size (an airport ₦1.5tn, a port ₦900bn, a
  stadium ₦400bn, a hotel ₦300bn, a market ₦200bn, a museum ₦120bn, a club ₦60bn...);
- bigger costs more: twice the ground costs about 1.4 times as much;
- a small, fixed difference between landmarks of the same kind (up to 8% either way), from the name;
- never under ₦50bn, with no top (the biggest cost the most), rounded to the nearest ₦1bn (₦10bn from ₦100bn up);
- your reputation level takes its usual discount off (`src/lib/world/rep-levels.ts`).

Some Lagos prices (at their real sizes): Apapa Port ₦3.81tn, Tin Can Island Port ₦3.51tn, Unilag
₦2.4tn, Murtala Muhammed Airport ₦2.1tn, Yabatech ₦1.61tn, LUTH ₦800bn, Eko Hotel ₦790bn. Out in
the rest of the state: Dangote Petroleum Refinery ₦6.44tn, Lekki Deep Sea Port ₦4.87tn, LASUSTECH
₦2.68tn, Pan-Atlantic University ₦2.63tn, Alaba International Market ₦590bn.

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

## Fun parks, water parks and paintball (2026-10-17)
On the real map, Ferris wheels and water slides are only at Lagos's real fun parks and water parks
(landmarks), and in a few big parks (a wheel deep in parkland, about 20 in all of Lagos State):
made-up funfairs and water parks (about 800 of each) are no longer put on the real map, so their
lots are ordinary lots again. The new landmarks: Apapa Amusement Park (4 × 3) and Ikorodu Fun Park
(4 × 4), Hakuna Matata Theme Park by Eko Hotels (a water park), and three paintball parks:
Leisure Sports Paintball at Landmark Beach, Lakowe, and Omu Resort (6 × 5). Apapa, Ikorodu and
Hakuna Matata are from OpenStreetMap; the paintball parks aren't in its data yet, so they're
placed from their listings (approx) and a bake moves them if they turn up. Hi-Impact Planet
(Magboro) is just over the border in Ogun State, off the map. Each footprint was checked: no
rooming house (free starter rooms) under any of them, and owned property always stands as bought.
