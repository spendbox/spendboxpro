# The 3D avatar

The new player avatar: a 3D person built from a short list of choices, with a skeleton and moves,
in four levels of detail. This document explains what it is, how it works, the rules it follows,
how to try it, and what is left before every player gets it.

The look to match is the reference studio in `avatar-reference/newtown-avatar-studio/`.

---

## In plain words

- **A recipe, not a model.** A player's avatar is saved as a recipe: one small number for each
  choice (skin, face shape, hairstyle, top, shoes...). Written out it is about 40 characters, like
  `NT1001401021000003010000000000000000000`. Every device builds the 3D person from the recipe, so
  nothing heavy is ever stored or sent.
- **Old avatars keep working.** Players who designed a flat 2D face before get a 3D look worked
  out from it (skin, hair, beard, glasses, earrings, top and its colour). Things the old avatar
  never had (body type, height, face shape) start at average, and the player should be invited
  to check their new look.
- **Built in the background.** The 3D person is built away from the screen's work (in a "worker"),
  then kept, so the game never stutters and each look is built once.
- **Mix and match.** Tops, bottoms, a jacket over them, and shoes are chosen separately; one-piece
  outfits (dresses, abaya, jalabiya, agbada, kaftan, suits, swimwear) are still there.
- **It moves.** A real skeleton: idle, walk, run, wave, dance, jump, talk. Clothes move with the
  body; dresses swing with the legs; feet plant on the ground.
- **Four levels of detail.** Your own avatar is the most detailed; players further away are drawn
  with fewer and fewer polygons (never blurry), so a busy town stays smooth on a cheap phone.

---

## Where things are

| Part | File |
| --- | --- |
| Option lists (append only) | `src/lib/avatar3d/catalog.ts` |
| The recipe: saving, reading, old avatars | `recipe.ts`, `legacy.ts` |
| Head and face | `head-shape.ts`, `face.ts`, `eyes.ts`, `ears.ts`, `head.ts` |
| Hair, facial hair, headwear | `hair.ts`, `facial-hair.ts`, `headwear.ts`, `shells.ts` |
| Body | `body.ts` |
| Clothes | `clothing.ts` (outfits, sleeves, robes), `tops.ts`, `bottoms.ts`, `layers.ts`, `shoes.ts`, `wardrobe.ts` (what is worn) |
| Jewellery | `jewellery.ts` (chains, watches; earrings are with the ears) |
| The whole avatar | `avatar.ts` |
| Skeleton and skin weights | `rig.ts` |
| Moves | `moves.ts` |
| Levels of detail | `lod.ts` |
| Colours and fabrics | `materials.ts` |
| Drawing it on the page | `scene.ts`, `viewer.ts`, `client.ts` (worker and cache), `worker.ts` |
| The players' studio | `src/app/play/avatar-studio.tsx` |
| The test page | `src/app/avatar-lab/` (hidden, not linked, not indexed) |
| Tests | `src/lib/avatar3d/tests/` |

No file is over about 550 lines.

---

## The recipe

- Each choice is an index into a list in `catalog.ts`. The text form is `NT` + version + one
  character per choice.
- **The lists are append only.** Never reorder, rename the id of, or delete an entry: saved
  recipes point at entries by position. New entries go at the end.
  `tests/catalog-lock.ts` holds the frozen order; the tests fail if anything moves.
- **New choices go at the end, with option 0 as a safe default**, so every recipe saved before
  the choice existed still means the same avatar. (The wardrobe choices were added this way:
  option 0 is "from the outfit".)
- **Retiring an option**: mark it `retired: { use: n }`. It disappears from the menus and recipes
  that used it load as option `n` (the bodybuilder body type loads as athletic).
- **Version**: `RECIPE_VERSION` only goes up if existing values change meaning; every older
  version must keep loading. `tests/fixtures.ts` holds frozen saved avatars that must load forever.

### Where it is saved

Inside the profile's existing `avatar` data, as the field `r3` (`lib/avatar.ts`). No database
change is needed, and everything that already copies a player's avatar around (chat, duels,
notifications) carries it. When the studio saves, it also sets the old 2D fields to their nearest
match (`legacyFromRecipe`), so places that still draw the flat portrait stay close.
`recipeOf(avatar)` gives the recipe for any avatar, old or new.

---

## Levels of detail

All four levels share one skeleton, so every move plays the same at every level.

| Level | Who | Triangles | What is left out |
| --- | --- | --- | --- |
| Own | your avatar | up to 70,000 | nothing; the face moves (blinks, talks, smiles) |
| Near | players close by | up to 20,000 | finer details (buttons, nails, seams, braid beads) |
| Far | players further off | about 2,600 (max 3,500), one mesh | fingers (mittens), ears, teeth, jewellery, collars, trims; the face is simple and still |
| Farthest | far away, and everyone beyond the nearest 30 | about 1,200 (max 1,500), one mesh | also the face, facial hair and glasses |

`pickLevels(distances)` in `lod.ts` chooses: near within 4 avatar heights, far within 18,
farthest beyond, and only the nearest 30 get near or far.

---

## Moves

A move gives joint angles over time (`moves.ts`). The legs are then solved so the feet reach the
ground where they should (no sliding or sinking). The walk follows measured human gait: the pelvis
rises and falls, shifts over the standing leg, turns with the forward leg and drops on the swing
side; the chest turns against it; arms swing opposite the legs; the ankle and knee stay within
what real joints do. Narrow long garments (a wrapper, a pencil skirt) shorten the stride.

**Adding moves.** A new move is a list of joint angles over time; most are a few lines. For
hundreds of moves the plan is to import motion-capture recordings (BVH/FBX) through one converter
onto this skeleton. Every move is checked by the same tests.

---

## Rules the code keeps (and the tests check)

- Only the recipe is stored or sent, never meshes.
- Every option builds without broken numbers, at every level of detail.
- Surfaces face outward; no folded triangles.
- Layers never touch what they cover (no flicker): clothes, jewellery, facial hair, headwear.
- Legs stay inside skirts, dresses and robes through walk, run and jump.
- Every move runs 7 seconds without broken numbers; standing moves keep feet on the ground.
- Old recipe fixtures still load exactly; old 2D avatars convert.
- Triangle budgets for every level, with the heaviest looks.

Run them with `npm test`.

---

## Trying it

- **The test page**: `/avatar-lab` (every option, expressions, moves, detail levels).
  `?view=body`, `?move=walk`, `?lod=far`, `?studio=1` (the players' studio).
- **In the game, for you only**: open the game with `?avatar3d=1` (for example
  `https://<the site>/play?avatar3d=1`). That browser then opens the new 3D studio from "Your look"
  instead of the old editor. `?avatar3d=0` switches it off. Nobody else is affected.

---

## Before every player gets it

1. **Try the studio in the game** with `?avatar3d=1`, on a real phone, and save a look.
2. **Pictures of the 3D avatar** (`avatar2d`): a portrait for chat, the scoreboard and
   notifications, and selfie pictures, drawn from the 3D avatar, so the 2D places match.
3. **The 3D avatar in the city**: players drawn with it, at the right level of detail.
4. **Switch the studio on for everyone**, with a one-time "Check your new look" prompt for players
   whose 3D look was worked out from their old avatar.
5. **Hand fingers** that bend; sitting; more moves.

There is no staging site, so new things are switched on for one browser first (as above). If the
Vercel project is connected to GitHub, each pull request also gets its own preview address to check
before merging (it shows under the pull request).
