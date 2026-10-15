# Voice calls

Players in the same room can talk to each other out loud: up to **6 people per call**, free to
run, and never recorded.

The code lives in `src/app/play/call/`:

- `group-call.ts`: the `useGroupCall(room, me, { max })` hook that does all the work.
- `call-bar.tsx`: `<CallBar room={...} me={...} title="..." />`, the little pill players see.
  It shows a **Join voice** button; once you're in, everyone's face (with a green glow while they
  talk), a mute button, a hang-up button and how full the call is (e.g. "3/6").

To put a call somewhere, drop in `<CallBar room={someRoomName} me={{ id, name, avatar }} />`.
Everyone whose screen uses the same `room` string is in the same call (for example
`` `${roundId}:${roomId}` `` for "everyone in this place"). Use one `CallBar` per room on a screen.

## How it works

Think of it as a phone call where everyone dials everyone else directly.

1. **Nothing happens until you tap "Join voice".** Phones only allow the microphone and sound
   after a tap, so the call never starts on its own. Your phone then asks for the microphone
   (with echo cancelling and background-noise reduction switched on).
2. **Introductions.** Your phone says "I'm in the call" on a Supabase Realtime channel named
   `voice:<room>`, the same live system the game already uses for duels, trivia and so on.
3. **Direct links.** For each other person in the call, the two phones swap the details they
   need to find each other over the internet (a few short text messages through that channel),
   then connect **directly, phone to phone** (this is WebRTC, the same tech as video calling in
   the browser). Your voice travels along those direct links, not through us.
4. With 4 people, each phone has 3 links. That's why it's called a "mesh".

Little things it handles:

- **Who calls whom:** for each pair, the player with the "smaller" user id makes the call and the
  other answers, so two phones never ring each other at the same moment.
- **People leaving:** hanging up, closing the tab or losing signal removes them for everyone
  (straight away if they hang up, within about 30 seconds if their phone just vanishes).
- **Bad links:** if a link drops (e.g. switching from wifi to mobile data) it waits a few seconds
  and then reconnects by itself.
- **Switching apps / locking the screen:** the call carries on if the phone allows it. When you
  come back, sound is restarted and your phone re-announces itself.
- **Microphone blocked:** you get a friendly message telling you to allow the microphone in the
  browser settings and tap Join again. No microphone, or one busy in another app, also get
  their own message.
- **Full call:** when 6 people are in, the button says "Full" and nobody else can join. If two
  people join at exactly the same moment and it goes over, the last one in gets a "Sorry, the
  call just filled up" message.
- **iPhone (Safari):** sound only plays after a tap, which "Join voice" is. If sound is ever
  paused by the phone, the next tap anywhere restarts it.

## Limits

- **About 6 people.** Every phone sends its voice separately to every other phone, so each extra
  person costs everyone more upload and battery. Six is comfortable on a normal phone; much
  beyond 8 it gets choppy. Bigger calls would need a paid "media server" (a different design).
- **Voice only.** No video and no screen sharing.
- **One device per player.** If the same account joins from two tabs, they'll clash.

## Privacy

- **Nothing passes through or is stored on our servers.** Voices go phone to phone, encrypted
  (WebRTC always encrypts audio). Nobody, including us, can listen in or record it.
- Our servers (Supabase) only carry the short "introduction" messages: who's in the call, their
  name and avatar, whether they're muted, and the technical connection details. These are not
  saved anywhere; they disappear as soon as people leave.
- Like any direct connection, the other people in the call could in principle see your
  internet address (IP address), the same as in any peer-to-peer game. A TURN relay (below)
  hides it if that ever matters.
- Your microphone is only on while you're in the call. Hanging up, or leaving the room, turns
  it off.

## Cost

**Free.** The voice itself never touches anything we pay for. The introduction messages are tiny
and go through Supabase Realtime, which the game already uses.

The one catch: about **1 in 5 people on mobile data or strict work/school networks** can't
connect directly (their network blocks it). For them, the call shows their face greyed out with
a spinner, and they won't be heard. The fix is a **TURN relay**: a server that passes the audio
along for just those people (still encrypted, still not recorded). It costs a little money only
for the traffic it actually relays.

### Adding a TURN relay (recommended): Cloudflare, with a login per player

Best: **Cloudflare Realtime TURN**. The first 1,000 GB relayed a month are free, then about $0.05 a
GB (a voice call is about 30 MB an hour per person relayed). Each player gets their own login
that runs out after a day (from `/api/turn`, signed-in players only), so nobody can copy it out of
the page and use the relay for something else.

1. Cloudflare dashboard → Realtime → TURN Server → Create. It gives a **Turn Token ID** and an
   **API Token**.
2. In Vercel add `CLOUDFLARE_TURN_KEY_ID` (the Turn Token ID) and `CLOUDFLARE_TURN_API_TOKEN`
   (the API Token), and redeploy. Nothing else to change.

### Or: a fixed TURN login (any provider)

Set these three environment variables in Vercel (Project, Settings, Environment Variables) and
redeploy. No code changes needed.

| Variable | What to put in it |
|---|---|
| `NEXT_PUBLIC_TURN_URL` | The TURN address(es), separated by commas, e.g. `turn:turn.example.com:3478,turns:turn.example.com:443?transport=tcp` |
| `NEXT_PUBLIC_TURN_USERNAME` | The username they give you |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | The password / credential they give you |

Good options:

- **Metered.ca "Open Relay" / free tier:** sign up, and their dashboard shows the URLs, username
  and password to copy in. The free tier includes a monthly allowance (enough for a small game).
- **Cloudflare Calls TURN:** very cheap and fast worldwide, with a free monthly allowance.
  Cloudflare gives you a key you exchange for short-lived credentials; for a quick start you can
  create one long-lived credential in their dashboard and paste it in.

Note: anything starting `NEXT_PUBLIC_` is visible to players' browsers. That's normal for TURN
(phones need the credentials), but use a TURN account with a spending cap so nobody can run up
a bill with it.

If the variables aren't set, calls still work using free public "STUN" servers from Google,
which only help phones find each other and never carry audio.

## What to test

Use at least two real phones (ideally an iPhone and an Android) plus a laptop.

1. Tap **Join voice** on one phone: it should ask for the microphone. Allow it. Your face shows
   with "1/6".
2. Join on a second phone in the same room. Both should show two faces within a few seconds, and
   each should hear the other. Talk: the speaker's face glows green on both screens.
3. **Mute** on one phone: the button turns red, a small red mic badge appears on that face for
   everyone, and the others stop hearing it. Unmute and it comes back.
4. **Hang up** on one phone: it disappears from the other phone's bar straight away.
5. **Block the microphone** (deny the permission) and tap Join: a friendly message explains how to
   allow it.
6. **Switch apps / lock the screen** for 10 seconds with the call on, then come back: sound
   should still work (on iPhone, tap the screen once if it's silent).
7. **Leave the room** (walk out / change place) while in a call: you should drop out of the call
   and your mic light should go off.
8. **Mobile data:** turn wifi off on one phone and try again. If it stays greyed out with a
   spinner, that network needs a TURN relay (see above).
9. **Full call:** with 6 people in, a 7th sees "Full" and can't join.
10. **Echo:** two phones in the same physical room will feed back. Use headphones or stand apart
    (that's normal for any call).
