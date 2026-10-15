# The house builder

Open it from your **Home** card: **Upgrade**. Five steps, with your home in 3D at the top the whole
way, turning slowly while you choose (drag it to look round, pinch to zoom).

## The steps

1. **House**: what kind of house it is. It sets the shape and how many floors it starts with.
2. **Size**: how big it is inside. Only the inside grows; the building on the map stays as it is.
3. **Floors**: add or take away floors, up to the house's most. The stairs go in for you.
4. **Rooms**: one floor at a time.
   - **Rooms on this floor**: − and +. The floor is laid out again and every room furnished.
   - **Try another layout**: the same number of rooms, cut up differently.
   - Tap a room (on the 3D or in the list) to change it:
     - **This room is a…**: living room, bedroom, kitchen, bathroom, dining room, study, balcony, or
       a special room (dance hall, cinema, gym, games room, bar, indoor pool). A kind the room is
       too small for is greyed out.
     - **Style**: Classic, Modern, Luxury or Cosy.
     - **Rearrange**: the same room furnished another way.
     - **Split in two**: rooms at least 7 m across, into two of the same kind.
     - **Join**: knock through to the room next door (when the two share a whole wall).
   - **Move furniture yourself (optional)** opens the hand-drawn planner (docs/HOME_PLANNER.md) with
     the design, to move, add or remove pieces one by one.
5. **Build**: the bill, line by line, and **Build it**. Undo (top right) steps back through every change.

Every floor has a hall down one side with the stairs at the back (the same spot on every floor),
so the floors always join up. The hall can't be split, joined or changed.

## The kinds of house

| House | Shape | Floors (most) | Design fee | Starts with |
| --- | --- | --- | --- | --- |
| Bungalow | Square | 1 (2) | none | |
| Duplex | Square | 2 (3) | ₦8m | |
| Townhouse | Slim, a garden each side | 3 (5) | ₦12m | |
| L-shaped villa | Two wings round a garden | 2 (4) | ₦25m | an indoor pool |
| Courtyard mansion | Three wings round a courtyard with a pool | 2 (4) | ₦60m | an indoor pool, a games room |
| Grand mansion | Square | 3 (6) | ₦120m | an indoor pool, a cinema, a bar |

- The design fee is paid once for each kind. Going back to one you've had before is free.
- Grand homes start with Luxury rooms, villas and townhouses Modern ones (some bedrooms Cosy).
- Where a shaped house meets its garden, the inside has a low wall with tall windows looking out on
  it (a terrace upstairs). The courtyard mansion's courtyard has its own pool.

## Sizes

| Size | Inside | Each floor | Rooms a floor (most) |
| --- | --- | --- | --- |
| Comfy | 10 × 8 m | 80 m² | 3 (4) |
| Spacious | 14 × 11 m | 154 m² | 4 (9) |
| Grand | 18 × 14 m | 252 m² | 5 (12) |
| Estate | 24 × 18 m | 432 m² | 6 (12) |
| Palace | 30 × 22 m | 660 m² | 8 (12) |

(For the square house; the shaped ones are a little less.) No room is laid out narrower than 3.5 m.
The slim and L-shaped houses need Comfy or bigger, the courtyard Spacious or bigger.

## Pools

- **Indoor pool** is a special room (at least 5 × 5 m, ₦15m to fit out). It gets the biggest pool
  that fits with a walkway round it: a plunge pool (4 × 2 m, ₦6m), a swimming pool (6 × 3 m,
  ₦12m) or a big pool (8 × 4 m, ₦20m), with sun loungers along the side and plants.
- Inside, the water shimmers, there's a ladder and a lane line, and nobody walks through it.

## Styles

| Style | Furniture | Colours and floor |
| --- | --- | --- |
| Classic | as the room needs | the home's own |
| Modern | no clutter (one plant, no clock) | greys and black, polished concrete |
| Luxury | a chandelier (living, dining, bedroom, hall, bar), a grand piano in a big living room, art | cream and gold, marble |
| Cosy | more lamps, plants and a rug | terracotta and warm wood, carpet |

## What it costs

Paid when you build, from your savings then your wallet (the server works it out from the plan):

- the design fee (once per kind of house);
- **space**: ₦180,000 for every square metre more than you've built before (more floors, or a
  bigger inside), 90% of it added to the home's value;
- fitting out special rooms and pools, and new furniture (as in the hand-drawn planner).

A home you rent can be rearranged but not built onto.

## Where the code is

| What | File |
| --- | --- |
| Kinds of house, shapes, sizes, laying out floors, splitting and joining rooms, the bill | `src/lib/home-plan.ts` (tests in `src/lib/world/tests/home-plan.test.ts`) |
| The builder | `src/app/play/home/home-builder.tsx` |
| The 3D model | `src/app/play/home/home3d.ts` |
| Walking round inside (garden windows, pools, styles) | `src/app/play/city/interiors.ts` (`plannedHome`) |
| The database | `game-db/108_home_builder.sql` (bigger saves and plans) |
