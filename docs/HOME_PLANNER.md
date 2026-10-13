# Planning your home

Open it from **Home → Plan my home**, or from the **Plan my home** button while you're inside your home. **Enter home** (on the Home card) takes you straight in. You draw your home flat, as a floor plan, and see it built in 3D.

## How it works

- **The grid.** The plan is laid out on half-metre squares, with a stronger line every metre. A home is Small (7 × 6 m), Medium (10 × 8 m) or Large (14 × 11 m). Changing the size starts the plan again.
- **Rooms.**
  - Pick a kind of room: living room, bedroom, kitchen, bathroom, dining room, study, hall or balcony.
  - Drag across the grid to draw it. Each room shows its size in metres.
  - Tap a room to move it or make it bigger or smaller, a square at a time, or to change what kind of room it is.
- **Furniture.**
  - There are 22 pieces, from beds and sofas to the kitchen, the bathroom and stairs.
  - Tap one to put it in. It goes in the room you picked, on free squares if there are any.
  - Drag a piece to move it.
  - Tap a piece to nudge it one square at a time, turn it (a quarter turn each time), copy it or delete it.
  - Pieces that overlap are outlined in red. Rugs can go under other things.
- **Floors.**
  - A home can have up to four floors.
  - The floor below shows faintly on the plan, with its stairs, so you can line things up.
  - You can remove the top floor.
- **3D view.**
  - Every floor is stacked up. Walls go round each room, with a doorway in each, and round the outside, and the furniture is built in plain shapes.
  - Walls are kept low on the floor you're looking at, and the floors above it are left off, so you can see in.
  - Drag to look round; pinch to zoom.
- **Undo** steps back through your changes. A whole drag counts as one change.
- **Saving.**
  - Save keeps the plan on your account, for the home you live in. If you move house, you start a fresh plan.
  - The server checks every plan before saving it, with the same rules as the editor: everything stays inside the home, at most 12 rooms and 80 pieces per floor.

## Designed for you

- **Design it for me** (at the top) lays out every floor and furnishes every room:
  - living room and kitchen downstairs;
  - bedrooms upstairs;
  - stairs in the hall, lined up between floors.

  Tap it again (**Another design**) for a different layout. Undo brings back what you had.
- With a room selected, **Furnish this room for me** fills it with what that kind of room needs.
  - Each piece goes against a wall, facing into the room.
  - The doorways are left clear.

## What it costs

Planning and rearranging are free. **Save** pays for what's new:

| What | Price (Lagos 2026) | Adds to your home's value |
| --- | --- | --- |
| A new floor | ₦180,000 per m²: Small ₦7.6M, Medium ₦14.4M, Large ₦27.7M | 90% of what you paid |
| Stairs | ₦1.5M | 90% |
| Furniture | ₦25k (plant) up to ₦650k (sofa); each piece's price shows under it | 50% |

- Your home comes with its ground floor and the starter furniture.
- What you've paid for stays yours. If you take a floor off or a sofa out, putting it back is free; the list says "You have one spare".
- The server works out the bill from the plan itself, not from what the phone says, and takes it from your savings, then your wallet.
- Only the owner can build onto a home. If you rent, you can only rearrange.
- More furniture styles are **coming soon** (marked at the end of the furniture list).

## Where the code is

| What | File |
| --- | --- |
| The rules: sizes, room kinds, furniture, the starter home, cleaning a plan, overlaps | `src/lib/home-plan.ts` (tests in `src/lib/world/tests/home-plan.test.ts`) |
| Building a plan in 3D | `src/app/play/home/home3d.ts` |
| The editor | `src/app/play/home/home-planner.tsx` |
| Loading and saving | `src/app/play/life/home-plan-actions.ts` |
| The database | `game-db/063_home_plans.sql` (table `home_plans`), `game-db/064_home_upgrades.sql` (paying, home value) |

## Walking round it

- Go in (Home → Enter home, or the building's bubble) and you see the home as planned, built with the game's own furniture, lights, curtains and decorations.
- You walk round it as your own 3D avatar, seen from behind:
  - use the joystick (bottom left), or tap the floor;
  - drag to look round, pinch to come closer;
  - tap a seat to sit, and tap the stairs to go up or down.
- Visitors see the same home.

## Next steps

1. **Walk around inside the plan.** When you go into your own home on the map, draw your plan instead of the made-up room. To do that, `city-view.tsx` would check whether the building is your `home_unit` and use `buildHome` in place of `createInterior`. It would turn the furniture into `blocks`, so you can't walk through it, and add the stairs as the way between floors.
2. **Your things in your home.** The things you own from the shop (fan, bed, fridge, solar) would show as their own pieces. Placing one would turn its effect on.
3. **Visitors** would see your home as you planned it.
4. **More looks:**
   - Wall colours, floor types and windows.
   - Furniture in the same style as the rest of the game, in place of plain shapes.

## Visiting

Going into someone else's home (game-db/066_home_visits.sql, src/app/play/life/visit-actions.ts):

- **Who walks straight in:** you (your own home), the friends of anyone who lives there, anyone while a party is on, and anyone let in during the last 45 minutes.
- **Everyone else knocks or rings.** The people who live there get a notice and a push, and a card pops up for them: Let in, or Not now. A knock waits 5 minutes.
- **Nobody answering?** The visitor can leave a note at the door. It goes into the home's guest book.
- **Inside someone's home,** the main button is "Sign the guest book".
- **Parties:** on your home card, Throw a party. Your door's open to everyone for 2 hours and your friends are told. The guest book is on the home card too.
