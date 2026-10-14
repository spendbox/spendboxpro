# Living on the real map

Money pots and a budget, bills, health, school and treats, and essential services paid from tax.
The rules are in `src/lib/world/living.ts`; the database part is `game-db/040_living.sql`; the
screens are **Money** and **Life** at the top of the map. A game day is 2 real hours (`docs/LIFE.md`).

## Money: pots and a budget

Everything you earn (pay, rent) is shared out by itself, by your budget:

| Pot | What it pays for | Balanced budget |
| --- | --- | --- |
| Essentials | Electricity, waste collection, check-ups | 25% |
| Travel | Fares to work and back | 15% |
| Savings | School fees; tops up your wallet when you buy property | 20% |
| Treats | Looks and other treats | 10% |
| Wallet | Anything (the rest) | 30% |

Presets: Balanced, Big saver, Treat myself, No pots. When a pot runs dry, the wallet pays. Tap a
pot to move money between pots any time. Nothing to micromanage: set it once.

**Money → Overview** shows what you're worth (wallet + pots + property), the pots, your bills and
anything the state owes you. **Spending** shows money in and out for a game day, today or this
week, by kind (pay, rent, tax, bills, travel, health, school, looks, property), with the tax you
paid and where it goes. **Property** is what you own.

## Bills

| Bill | Price (Lagos) | Goes to |
| --- | --- | --- |
| Electricity | ₦400 a m² a month (about 2 kWh a m² at ₦200), at least ₦4,000 | The power company (leaves the game) |
| Waste collection | ₦30 a m² a month, at least ₦1,500 | Lagos State |
| Food | ₦7,500 a game month, about ₦3,000 a real day (₥2 in Lagos) | The market sellers (leaves the game) |

A room of 14 m² is about ₦5,600 + ₦1,500 a month; a 90 m² flat ₦36,000 + ₦2,700. Bills build up by
the game day and are paid by themselves from Essentials, then the wallet. What can't be paid is
owed, and paid as soon as money comes in. Owing more than a game week of electricity cuts the power
(a red dot on Money) until it's paid.

Food (`FOOD_MONTH` in `src/lib/world/living.ts`) is paid the same way, by the game day from
Essentials then the wallet, whether you have a home or not: everyone eats. Food you can't pay for
isn't owed: you go hungry instead, and lose 1 health a game day. Money → Spending shows it with
the bills ("Bills and food").

## Health

Health starts at 80 and drops 1.5 a game day. Below 50, a check-up at a public clinic happens by
itself (₦5,000, +25 health, from Essentials). Below 30 you're unwell: half pay. Below 10: no work.

| Care | Price | Health |
| --- | --- | --- |
| Public clinic check-up | ₦5,000 (to the state) | +25 |
| Private hospital visit | ₦35,000 + VAT | +45 |
| Full medical (private) | ₦150,000 + VAT | back to 100 |

## Looks

At a private clinic, plus 7.5% VAT, from Treats then Savings. Recovery is game days off work.

| Procedure | Price | Recovery |
| --- | --- | --- |
| Teeth whitening | ₦150,000 | none |
| Veneers | ₦1.2m | 2 game days |
| Hair transplant | ₦2m | 7 |
| Liposuction | ₦2m | 10 |
| Nose job | ₦2.5m | 10 |
| BBL | ₦3.5m | 14 |

They're recorded, ready to show on 3D avatars when those arrive.

## School

One course at a time, paid up front from Savings, while you keep working. It finishes by itself,
counts as experience in its skill, and some give the certificate a better job needs.

| Course | Fee | Game days | Opens |
| --- | --- | --- | --- |
| Sales and customer service | ₦30,000 | 5 | Selling level 2 |
| Computer skills | ₦50,000 | 10 | Office work level 2 |
| Catering and hotel management (public) | ₦120,000 | 30 | Hospitality level 3 |
| Teacher training, NCE (public) | ₦150,000 | 60 | Teacher |
| Chartered accountancy, ICAN | ₦400,000 | 60 | Accountant |
| Nursing diploma (public) | ₦300,000 | 90 | Nurse |
| Master's degree (public) | ₦600,000 | 120 | Lecturer |
| Medicine, MBBS (public) | ₦1.5m | 360 (a game year: 30 real days) | Doctor |
| Pilot licence | ₦30m | 180 | Pilot |

Public fees go to the state; private ones leave the game. No VAT on school.

## Essential services are paid from tax

Jobs at public hospitals, universities, schools and government offices (and waste collectors) are
paid by Lagos State's treasury, then Nigeria's, out of the taxes everyone pays (income tax, rent
tax, property tax, VAT, waste bills, public fees). Income tax is kept back at source. When the
treasuries can't pay, the pay is owed and paid when they can. The Lagos treasury opens with
₥500,000 (`living_treasury_opening`). Other jobs are paid by businesses.

## Taxes, all together

| Tax | Rate | When |
| --- | --- | --- |
| Income tax | 7% | Pay |
| Rent tax | 10% | Rent |
| Property tax | 3% | Buying property |
| VAT | 7.5% | Private health care and treats; event tickets (inside the price) |
| Income tax on ticket sales | 7% | When an event you hosted is over (docs/EVENTS.md) |
| Event permit | ₦100,000 an hour and up | Hosting a party (docs/EVENTS.md) |

All of it goes 70% to Lagos State and 30% to Nigeria.

## To change

Prices, courses, care and procedures: `src/lib/world/living.ts`. Rates and limits: `game_settings`
(`living_*`, `work_*`, `property_*`).
