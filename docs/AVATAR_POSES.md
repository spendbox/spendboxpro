# The 3D characters: poses

## Built (src/lib/avatar3d/moves.ts)

- Standing about, walking, running, waving, dancing, jumping, talking.
- Sitting: still, talking, sipping a drink (with a cup in the hand), eating, typing at a desk. Sitting fits any seat height: a sofa, a chair or a high stool, with the feet dangling.
- Leaning (hands in pockets, one foot crossed).
- Sipping and eating standing up.
- Cooking at the cooker.
- DJing: one hand on the decks, headphones to the ear.
- Working at a counter.
- Clapping, cheering.
- A handshake, a hug.
- The club's eight dances (Groove, Hands up, Shaku shaku, Disco point, Body wave, Gwara gwara, Legwork, Spin), on the club's beat, the move each player picks.
- You on the street (walk mode) and inside homes: your own 3D avatar, walking, running, standing.

Every NPC, every player in a place, the dancers and the passengers on rides now use the new 3D avatars in all these poses (src/app/play/city/npc3d.ts). Up to 16 people per place are switched over; the old figure stays only while an avatar is still loading, or on a phone that can't build them. You can try every move in the avatar lab (/avatar-lab).

## Still to build (the list below, minus what's above)

The new 3D avatars (`src/lib/avatar3d`, moves in `moves.ts`) can so far: stand (idle), walk, run,
wave, dance, jump and talk. Inside places, characters standing about already use them
(`src/app/play/city/npc3d.ts`); everyone sitting, working at something or touching someone else
still uses the old figures (`src/app/play/city/figures.ts`) until their pose exists.

Each pose is one entry in `MOVES` (a looping move, or a one-off with an end), built on the same
skeleton, so every avatar can do every pose. The old figures' acts (talk, sip, eat, work, dj, cook,
idle, wave, dance) and poses (stand, sit, lean) map onto these.

## First (they unlock the most)
So every seated character, every table and every hug or handshake can switch to the new design:
1. Sit on a chair
2. Sit on a stool / at a bar
3. Sip a drink
4. Eat at a table
5. Type at a desk
6. Hug (two people)
7. Handshake (two people)

## Everyday
- Sit on the ground or a step
- Lie down (sleeping, the beach, a hospital bed)
- Lean on a wall or counter
- Arms crossed
- Hands in pockets
- Look at a phone
- Phone call
- Take a selfie
- Point
- Clap
- Cheer
- Laugh
- Shrug
- Nod
- Shake head

## Eating and drinking
- Eat standing up
- Toast with a glass

## Work
- Cook
- Serve behind a counter
- Carry a tray
- Sweep
- Stand guard
- Teach at a board
- Treat a patient
- DJ at the decks
- Drive (car, bus, danfo)
- Ride an okada
- Fix or build something

## With other people
- Kiss on the cheek
- Slow dance with a partner
- High five
- Argue (angry hands)
- Whisper / gossip
- Spray money on dancers

## Games and activities
- Play pool
- Throw darts
- Shoot an arrow (archery)
- Play the piano
- Sing karaoke
- Hold cards
- Play an arcade machine
- Kick a football
- Shoot a basketball
- Box
- Wrestle
- Lift weights
- Jog
- Swim
- Go down a water slide

## Street life
- Throw an egg (prank)
- Pick a pocket
- Caught, hands up
- In a jail cell
- Pay a bribe
- Sell at a market stall
- Haggle
- Carry a load on the head
- Wait at a bus stop
- Hold a sign (protest, rally)

## Rides
- Seated in a train or bus
- Standing, holding the grab rail
- In a balloon basket
- Helicopter passenger
- At a boat's rail

## Feelings (the whole body, with the face)
- Happy
- Sad
- Angry
- Scared
- Tired / yawning
- Shocked

## After the poses
- Your own 3D avatar on the street (On foot) and inside places, instead of the little figure.
- Other players in places drawn as their 3D avatars (their saved look).
- Characters walking between spots in a place, not only standing at one.
