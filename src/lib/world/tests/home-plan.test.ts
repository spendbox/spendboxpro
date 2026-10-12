import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZES, cleanPlan, clashes, itemSize, roomAt, starterPlan } from "../../home-plan.ts";

test("the starter home fits, with no furniture on top of other furniture", () => {
  for (const size of ["small", "medium", "large"] as const) {
    const p = starterPlan(size);
    const { w, d } = SIZES[size];
    assert.equal(p.floors.length, 1);
    for (const i of p.floors[0].items) {
      const s = itemSize(i);
      assert.ok(i.x >= 0 && i.y >= 0 && i.x + s.w <= w && i.y + s.d <= d, `${size}: ${i.kind} inside`);
    }
    assert.equal(clashes(p.floors[0]).size, 0, `${size}: no clashes`);
    assert.deepEqual(cleanPlan(p), p);
  }
});

test("turning swaps width and depth", () => {
  assert.deepEqual(itemSize({ kind: "sofa", rot: 0 }), { w: 4, d: 2 });
  assert.deepEqual(itemSize({ kind: "sofa", rot: 1 }), { w: 2, d: 4 });
});

test("a plan from outside is made safe", () => {
  assert.equal(cleanPlan(null), null);
  assert.equal(cleanPlan({ floors: [] }), null);
  const p = cleanPlan({
    size: "huge",
    floors: [
      { rooms: [{ kind: "bedroom", x: 99, y: -5, w: 50, d: 1 }, { kind: "dungeon", x: 0, y: 0, w: 2, d: 2 }], items: [{ kind: "sofa", x: 100, y: 100, rot: 7 }, { kind: "rocket" }] },
      {}, {}, {}, {}, {},
    ],
  })!;
  assert.equal(p.size, "medium");
  assert.equal(p.floors.length, 4);
  const [room] = p.floors[0].rooms;
  assert.equal(p.floors[0].rooms.length, 1);
  assert.ok(room.x + room.w <= SIZES.medium.w && room.d >= 2);
  const [sofa] = p.floors[0].items;
  assert.equal(p.floors[0].items.length, 1);
  assert.equal(sofa.rot, 3);
  const s = itemSize(sofa);
  assert.ok(sofa.x + s.w <= SIZES.medium.w && sofa.y + s.d <= SIZES.medium.d);
});

test("rooms and clashes", () => {
  const p = starterPlan("medium");
  assert.equal(roomAt(p.floors[0], 1, 1)?.kind, "bedroom");
  const f = { rooms: [], items: [{ id: 1, kind: "bed" as const, x: 0, y: 0, rot: 0 }, { id: 2, kind: "chair" as const, x: 3, y: 3, rot: 0 }, { id: 3, kind: "rug" as const, x: 0, y: 0, rot: 0 }] };
  assert.deepEqual([...clashes(f)].sort(), [1, 2]);
});
