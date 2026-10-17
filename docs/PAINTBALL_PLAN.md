# Paintball: the plan

**Built so far** (`src/app/play/paintball/`): stage 1 and most of stage 2. Team Splat, 4 v 4 on a
speedball field (inflatable bunkers, nets, a scoreboard, splats that stay), third person over the
shoulder, AIM to come in close, a mini-map, who-splatted-whom, results. Quick match, a private
match with a code, or practice against bots; bots fill the empty places. Between phones it runs on
the game's own realtime connection (Supabase broadcast, about 8 updates a second each); each phone
says who its own shots hit, and the first player in the room runs the bots. The fee is ₦5,000 a
match; nothing is paid out. Found in Games and with the Play paintball button in parks.

Still to do from below: the other arenas and modes, skins from the shop, and a real game server
(Colyseus) once there are many matches at once: realtime messages are counted on the Supabase
plan, and a full 8-person match sends a lot of them.

A team shooter you can join from the map: two teams, a proper 3D arena, fast and good-looking
on a phone. It should feel like the moment-to-moment of Call of Duty or Fortnite, but with
paint, not blood: splats, colour and laughs.

## 1. Where and how you join
- **Paintball parks on the map** in some parts of town (outdoors: a fenced field with inflatable
  bunkers, a hut and a car park), plus a big one at Lekki and one on the Mainland. A "Play
  paintball" button there, like "Shoot at the range".
- **Lobby card:** the next game starting in 0:45, the map, players in each team, Join red / Join
  blue, the entry fee (for example ₦5,000; the winners share a pot), and Invite friends.
- **Quick play** (any free match) and **Private match** (a code for your friends). Bots fill the
  empty places so a game always starts, even with 2 people online.
- **Modes:** Team Splat (first team to 30 hits), Capture the Flag, King of the Hill (hold the
  middle), and Last Team Standing (one life each, the circle shrinks: the Fortnite-like one).
- 4 to 10 players, games of about 5 minutes.

## 2. What it looks like
- **Third-person** over the shoulder (like Fortnite) by default, first-person when you aim (like
  CoD). Your own 3D avatar (the one you already have) in overalls and a mask in your team's colour.
- **Five arenas:** Speedball (inflatable bunkers on astroturf), Woodland (trees, logs, a stream),
  Urban (a half-built Lagos estate: unfinished blocks, a danfo, oil drums), Night Market (stalls,
  lanterns, tight corners) and the Rooftop (water tanks, satellite dishes, the lagoon behind).
- **Paint everywhere:** every hit leaves a splat on walls, floors and people; the arena is a mess
  of red and blue by the end. Hit sparks of paint, a squelch, a slow-motion moment on the last hit.
- **HUD:** the team scores and timer at the top, a mini-map, ammo (paint pods) and hopper, the
  crosshair that blooms when you move, hit markers, a kill feed ("Tee splatted Bayo"), and a big
  ranking screen at the end (best player, most hits, most accurate).

## 3. Controls (phone first)
- Left thumb: a joystick to move (push far to run). Right thumb: drag to look/aim.
- Buttons: Fire (big), Aim (scope in), Jump, Crouch/slide, Reload, and a Paint grenade.
- Aim assist that gently helps on a phone; auto-fire when the crosshair rests on someone (an
  option, like many mobile shooters).
- Keyboard and mouse on a computer.

## 4. Guns (markers) and gear
- Markers: Pistol, Standard, Rapid (fast), Long-range (scope), Shotgun-style (a spray of paint).
  Each with its own sound, rate of fire and paint colour trail.
- The guns from the shop (coming soon) unlock **skins** for your marker here: a gold AK-look marker,
  a desert-eagle-look pistol. Buying a gun in the shop gives you its paintball skin.
- Gear: masks, overalls and hoppers to buy with in-game money (looks only, never an advantage).

## 5. How it works underneath
- **Real-time multiplayer** needs a game server that keeps everyone in step (positions 15–20
  times a second). Options: a small Node game server (Colyseus) on Fly.io or Railway, or
  Supabase Realtime for the lobby with a game server for the match itself. Recommended: Colyseus.
- The server decides who hit whom (no cheating from the phone); the phone predicts movement so it
  feels instant.
- Bots on the server with simple AI: take cover, peek, shoot, move to the flag.
- 3D in three.js, the same as the rest of the game: low-poly arenas built from pieces, the
  splats as decals, about 60 fps on a mid-range phone.
- Money: the entry fee and the pot go through the database like other games (a new SQL file),
  with the same limits as challenges.

## 6. In stages
1. **Solo vs bots** in one arena (Speedball), Team Splat only: controls, look, paint, HUD.
   About 1–2 weeks of work. Lets you feel it before any servers.
2. **Multiplayer**: the game server, lobby, joining from the map, Quick play. About 2 weeks.
3. **More**: the other arenas and modes, private matches, skins from the shop, the entry fee and
   pot, leaderboards. About 2–3 weeks.

## For the owner to decide
- The entry fee and how the pot is shared (winners only, or everyone gets something).
- Which game server host to pay for (about $5–$20 a month to start).
- Whether paintball parks are only in some places or in every big area.

## Built so far (2026-10-17)
- **Only at parks:** a park's fun park ("Play paintball"), the big parks (bigpark landmarks: the
  paintball parks among them, drawn on the map as a netted field of inflatables) and fun parks.
  Not at army bases or "anywhere" any more.
- **Four grounds**, one per match from its seed (everyone in a match plays the same one, the next
  match is likely another): Speedball Arena (inflatables on astroturf), The Woods (trees, logs,
  hay bales and crates on a forest floor), The Yard (walls, cars, shipping containers and tyres on
  concrete among tall buildings) and Beach Camp (palms, drums, sandbags, boats and huts on sand by
  the sea). Each is laid out from the seed, so no two matches are the same. Its name shows over
  the countdown. (`src/app/play/paintball/world.ts` ARENAS and layout, `scene.ts` Kit and
  surroundings.)
- **Tap to shoot:** a quick tap on the right side of the screen fires one ball; hold FIRE for a
  stream.
- **Invite during a match:** the INVITE button (top left) lists everyone in the place (or with
  Games open in town): Invite sends them a pop-up that brings them into your room (they play the
  next match), or Share sends the room's code. From a practice game it makes a private room for
  you, and you go there when the practice game ends.
