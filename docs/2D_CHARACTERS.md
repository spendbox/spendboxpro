# 2D characters, and mixing 2D with the 3D city

This is an assessment, written before building anything, as asked. It checks how 2D characters do on speed, playing together, looks and phones, against what the game already has.

## What's already there

Much of a hybrid game exists already. It's worth building on, not rebuilding.

- **The city is 3D** (three.js, `city-view.tsx`).
  - The new 3D characters (`src/lib/avatar3d`) stand about inside places.
  - The old simple figures do everything else.
  - The 3D characters' moves still to make are listed in `docs/AVATAR_POSES.md`.
- **Activities are already 2D screens laid over the 3D world.**
  - The club's dance-off (`activities/dance.tsx`), with falling arrows.
  - Spraying money on dancers.
  - Pool, darts, archery, karaoke, cards and more.
- **Playing together already works** (`activities/hub.ts`).
  - Everyone in the same place shares a live room channel: who's there, scores, challenges, sprays, songs.
  - The server checks anything involving money.
- **Football, basketball, boxing and wrestling are already drawn in 2D on a canvas** (`sports/draw.ts`) for the live match view.
  - Players move about a pitch, court or ring.
  - There's a cached background, and moving parts are blended between keyframes.
  - The same drawing could be made playable.
- **Every player has a flat 2D look** (`AvatarFace`, `src/lib/avatar.ts`) as well as the 3D one.

## How 2D characters compare

| | 2D characters (activity screens) | 3D characters (in the city) |
| --- | --- | --- |
| **Speed on phones** | Very light. One canvas, a few flat shapes, 60 fps even on cheap phones, almost no battery cost. | Each character is a skinned 3D model. Fine for a handful nearby, heavy for a crowd or a full pitch. |
| **Faces and feelings** | Easy and clear: eyes, eyebrows and mouth drawn big, swapped instantly (happy, angry, shocked, talking). Reads well on a small screen. | Possible (the 3D face has a smile and brows), but small on screen and costly to animate for many people. |
| **New moves** | Quick to make: a move is a few key positions blended together, like the sports view already does. | Each pose is built on the skeleton (`docs/AVATAR_POSES.md`). Slower to make, but used everywhere. |
| **Playing together** | Easy: only a few numbers per player are sent (position, move, score) over the room channel that's already there. | The same, but the 3D scene has to show everyone too. |
| **Looks** | Clean, bold, cartoon. Matches the flat avatars and the activity screens. | Matches the city. |
| **Risk** | Two looks for the same person, unless the 2D character is clearly drawn from the same avatar (same skin, hair, clothes colours). | None new. |

## Recommendation

Use **both**, each for what it's good at:

- **The city stays 3D.** That covers walking, rides, buildings, and people standing, sitting and dancing in places, using the 3D characters as their poses get made.
- **Activities open as 2D screens** over the city, as they do now, with **animated 2D characters drawn from each player's own avatar**. They use the same colours, hair and clothes, so the person always looks like themselves.

Build it in this order. Each step is small and works on its own:

1. **One 2D character, drawn from your avatar,** with a face that can show feelings and talk. Use it first in conversations: NPC and player chat cards, with a talking mouth and expressions that follow the message's mood. It's cheap, and it's seen all the time.
2. **The dance hall.** Your character dances on the dance-off screen in time with the arrows, and everyone in the club sees each other dancing. Dance-offs are head to head, using the room channel's challenge messages that already exist.
3. **Boxing.** Two characters face each other, side on. Tap to jab, hold to block, swipe to dodge. It's a turn-based exchange over the room channel, like the existing duels, so it's fair even on a slow connection. The server settles any stake.
4. **Basketball** (shooting first, then one-on-one), on the court the sports view already draws.
5. **Football,** seen from above on the pitch the sports view already draws. Start with penalties and five-a-side against computer players, then let real players take positions. It needs the most back-and-forth, so it comes last.

## Things to watch

- Keep the 2D screens to one canvas each. Draw the characters as flat shapes, not pictures, so they recolour to any avatar for free.
- Send small, infrequent updates (a few a second). Let each phone smooth the movement in between, as the match view already does.
- Anything with money is settled on the server, never by a phone.
- Test on a cheap Android phone at each step, before adding the next.
