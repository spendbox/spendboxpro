# Masquerade

Five minutes of chat with someone new, both masked. Names and faces show only if both unmask.
Newtown's own way to meet people: no blank first message (a question starts it), a little
urgency (the clock), and nobody exposed (unmasking takes two yeses, and nobody learns who said no).

Code: rules and questions `src/lib/masquerade.ts`; server `src/app/api/masquerade/route.ts`;
screens `src/app/play/masquerade.tsx`; database `game-db/131_masquerade.sql` (tests:
`game-db/tests/masquerade.test.sql`, `src/lib/tests/masquerade.test.ts`).

## Where

- **The map**: the mask button, top right beside Play (the games).
- **Lite**: the Masquerade card at the top of Chats (how many are masked right now).
- **Everywhere**: Masquerade in the menu (your face, People).
- **The walkthrough** has a card on it (and players who'd finished it see it once as what's new).

## How it goes

1. **Before the masks go on** (remembered on the phone):
   - **I'm here for**: **Friends**, **Dating**, or a **Spicy link-up 🔥** (no-strings fun between
     adults). Dating and link-ups are only for people who've switched on Open to dating, and each
     only meets people there for the same thing. Picking a link-up turns the spice up to extra
     spicy (still their choice).
   - **I'd like to meet**: women, men or anyone, **aged** from and to (18 to 80+).
   - **How spicy should the questions be?** Mild, a little spicy 🌶️, spicy 🌶️🌶️ or extra spicy 🌶️🌶️🌶️.
   - **I am** a woman or a man, asked once if they haven't said (until then they only meet people
     looking for anyone).
   Then **Put on your mask**.
2. **Finding someone**: the server matches you with the nearest person waiting in the same state
   who's there for the same thing, **both ways**: they fit who you asked for (sex and age) and you
   fit who they asked for. Not someone either of you blocked, not someone you met in a masquerade
   in the last day, never someone either of you reported in one. Waiting phones ask every 3
   seconds (that keeps their place and tries again); a place unused for 2 minutes goes.
3. **The masked chat (5 minutes)**: "Masked guest", their area, and why they're here. A question
   to start; **Another question** for a new one (both phones show it). Before unmasking, no phone
   numbers, links or social handles (`masqBlocked`). The flag: **Leave**, or **Report and leave**.
4. **Time's up**: **Unmask**, **2 more minutes** (once, if both ask) or **Pass**. A minute to
   decide; nobody deciding ends it.
5. **Both unmasked**: both faces, their name, **Keep chatting** (the ordinary chat), **Add friend**,
   **Go again**. Otherwise: "Not a match this time" (a pass never says who).

## Questions and spice

`MASQ_QUESTIONS`: easy ones, spicy ones and extra spicy ones (flirty, cheeky, bolder; never
explicit; every player is 18+). Each of you picks a level; the questions follow the **average of
the two picks** (`masqSpiceOf`, a half rounds up). In the chat you see the level they picked
("They picked 🌶️ A little spicy") and your own.

| Average | Questions |
|---|---|
| Mild | easy ones only |
| A little spicy | about 1 in 4 spicy; the first is always easy |
| Spicy | about 1 in 2 spicy |
| Extra spicy | mostly spicy and extra spicy |

Marked 🌶️ SPICY QUESTION or 🌶️🌶️🌶️ EXTRA SPICY. Never the same question twice in a row. Both
phones work out the same question from the masquerade, its number and the level.

## Rules (src/lib/masquerade.ts)

| | |
|---|---|
| Length | 5 minutes (`MASQ_MINUTES`), plus 2 once if both ask |
| Time to decide | 60 seconds |
| A day | 10 masquerades each (`MASQ_PER_DAY`) |
| Messages | 300 letters, one a second at most |

## Privacy and safety

- Phones talk on the masquerade's own live channel (`masq:<id>:<secret>`, the secret told only to
  the two of them), as "a" and "b". The server says who the other is only once both unmasked.
- What's said is kept 7 days, for reports. A report goes to the reports list (Masquerade #id, with
  what they said), ends it, and they're never matched again.

## Switching it on

Run `game-db/131_masquerade.sql` once in the Supabase SQL Editor, then `game-db/128_lock_down.sql`
again. Until then the Masquerade card doesn't show and the menu's Masquerade says it's switched on soon.
