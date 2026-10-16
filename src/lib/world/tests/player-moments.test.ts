// Tests for other players in your story (docs/LIFE_WHEEL.md, phase 6). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOMENTS, MOMENT_BY_ID, pickMoment } from "../moments.ts";
import { LIFE_BADGES, lifeFacts } from "../standing.ts";

const player = MOMENTS.filter((m) => m.player);

test("every thread starts somewhere and every next part exists, is sent to the other player and never comes by itself", () => {
  assert.ok(player.filter((m) => m.player?.start).length >= 4);
  const sent = new Set<string>();
  for (const m of player) {
    if (!m.player?.start) assert.ok(m.followOnly, `${m.id}: a reply must never be picked by itself`);
    for (const c of m.choices)
      for (const o of c.outcomes) {
        if (o.link) {
          const next = MOMENT_BY_ID.get(o.link.send);
          assert.ok(next?.player && next.followOnly, `${m.id} sends ${o.link.send}`);
          sent.add(o.link.send);
        }
        assert.ok(Math.abs(o.feel ?? 0) <= 3, `${m.id}: feel`);
        assert.ok((o.give ?? 0) <= 1.5, `${m.id}: give`);
        if (o.give || o.link || o.feel) assert.ok(m.player, `${m.id}: another player outside a player moment`);
      }
  }
  // Every reply is reached from somewhere.
  for (const m of player.filter((x) => !x.player?.start)) assert.ok(sent.has(m.id), `${m.id} is never sent`);
});

test("nobody can be made to pay by another player's choice: every reply has an answer that costs nothing", () => {
  for (const m of player.filter((x) => !x.player?.start)) {
    assert.ok(
      m.choices.some((c) => c.outcomes.every((o) => !o.pay && !o.give)),
      `${m.id}: every answer costs money`,
    );
  }
});

test("the wallet dilemma: the two replies read exactly the same, so you can't tell what the other did", () => {
  const h = MOMENT_BY_ID.get("p_wallet_h")!;
  const k = MOMENT_BY_ID.get("p_wallet_k")!;
  assert.deepEqual(h.text, k.text);
  assert.equal(h.title, k.title);
  assert.deepEqual(h.choices.map((c) => c.label), k.choices.map((c) => c.label));
});

test("a thread with another player starts only when there's someone to be in it", () => {
  for (let i = 0; i < 400; i++) assert.ok(!pickMoment({ spot: "street", day: true, level: 1, recent: [], rand: Math.random })?.player);
  let seen = 0;
  for (let i = 0; i < 3000; i++) if (pickMoment({ spot: "street", day: true, level: 1, recent: [], partner: true, rand: Math.random })?.player?.start) seen++;
  assert.ok(seen > 0, "never started one");
});

test("people badges: Ride or Die and Main Character", () => {
  const now = Date.now();
  const none = lifeFacts([], [], now);
  assert.ok(!LIFE_BADGES.some((b) => (b.id === "ride_or_die" || b.id === "main_character") && b.earned(none)));
  const loyal = lifeFacts([], [], now, [], { links: 60, people: 12, stood: 5, allies: 2 });
  const got = new Set(LIFE_BADGES.filter((b) => b.earned(loyal)).map((b) => b.id));
  assert.ok(got.has("ride_or_die") && got.has("main_character"));
  assert.ok(loyal.legacy >= 180);
});
