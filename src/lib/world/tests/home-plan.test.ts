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

test("designed for you: every floor has rooms, furniture, no clashes, and it all fits", async () => {
  const { autoDesign, cleanPlan: clean } = await import("../../home-plan.ts");
  for (const size of ["small", "medium", "large"] as const)
    for (let floors = 1; floors <= 4; floors++)
      for (let seed = 1; seed <= 5; seed++) {
        const p = autoDesign(size, floors, seed);
        assert.equal(p.floors.length, floors);
        p.floors.forEach((f, level) => {
          assert.ok(f.rooms.length >= 2, `${size} ${floors} ${seed}: rooms`);
          assert.ok(f.items.length >= 4, `${size} ${floors} ${seed} L${level}: furnished (${f.items.length})`);
          assert.equal(clashes(f).size, 0, `${size} ${floors} ${seed} L${level}: no clashes`);
          if (level < floors - 1) assert.ok(f.items.some((i) => i.kind === "stairs"), "stairs up");
        });
        assert.deepEqual(clean(p), p, `${size} ${floors} ${seed}: survives cleaning`);
      }
});

test("the bill: new floors and new furniture only, and what's paid for stays paid", async () => {
  const { planBill, startPaid, floorNaira, FURNITURE } = await import("../../home-plan.ts");
  const p = starterPlan("medium");
  const paid = startPaid();
  assert.equal(planBill(p, paid).naira, 0);
  p.floors.push({ rooms: [], items: [] });
  p.floors[0].items.push({ id: 99, kind: "sofa", x: 10, y: 12, rot: 0 });
  const bill = planBill(p, paid);
  assert.equal(bill.naira, floorNaira("medium") + FURNITURE.sofa.naira);
  assert.ok(bill.valueNaira > 0 && bill.valueNaira < bill.naira);
  // Paid; take them away and put them back: free.
  p.floors.pop();
  p.floors[0].items.pop();
  assert.equal(planBill(p, bill.paid).naira, 0);
  p.floors.push({ rooms: [], items: [] });
  assert.equal(planBill(p, bill.paid).naira, 0);
});

test("starter furniture is credited for the plan's own size", async () => {
  const { planBill, startPaid } = await import("../../home-plan.ts");
  for (const size of ["small", "medium", "large"] as const) {
    const p = starterPlan(size);
    const counts: Record<string, number> = {};
    for (const i of p.floors[0].items) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
    assert.deepEqual(startPaid(size).items, counts, size);
    // Nothing paid for yet: the starter home of that size is still free.
    assert.equal(planBill(p, { floors: 1, items: {} }).naira, 0, size);
  }
});

test("special rooms: a dance hall gets its dance floor, DJ booth, speakers and disco ball", async () => {
  const { furnishRoom, homeHasDanceHall, danceFloorOf, SPECIAL_ROOMS, ROOM_MIN } = await import("../../home-plan.ts");
  type Floor = Parameters<typeof furnishRoom>[0];
  for (const size of ["small", "medium", "large"] as const) {
    const { w, d } = SIZES[size];
    const f: Floor = { rooms: [{ id: 1, kind: "dancehall", x: 0, y: 0, w, d }], items: [] };
    furnishRoom(f, f.rooms[0], 3, size);
    const kinds = f.items.map((i) => i.kind);
    for (const k of ["djbooth", "dancefloor", "speaker", "discoball"] as const) assert.ok(kinds.includes(k), `${size}: has a ${k}`);
    assert.equal(clashes(f).size, 0, `${size}: no clashes`);
    // Nothing stands on the dance floor.
    const df = danceFloorOf(f)!;
    for (const i of f.items) {
      if (["dancefloor", "discoball", "rug"].includes(i.kind)) continue;
      const s = itemSize(i);
      assert.ok(!(i.x < df.x + df.w && df.x < i.x + s.w && i.y < df.y + df.d && df.y < i.y + s.d), `${size}: ${i.kind} off the dance floor`);
    }
    assert.ok(homeHasDanceHall({ v: 1, size, floors: [f] }));
  }
  assert.equal(homeHasDanceHall(starterPlan("medium")), false);
  assert.equal(homeHasDanceHall(null), false);
  // Every special room, drawn at its smallest and at full size, gets furnished without clashes.
  for (const kind of SPECIAL_ROOMS)
    for (const big of [false, true]) {
      const m = ROOM_MIN[kind]!;
      const f: Floor = { rooms: [{ id: 1, kind, x: 0, y: 0, w: big ? SIZES.large.w : m, d: big ? SIZES.large.d : m }], items: [] };
      const n = furnishRoom(f, f.rooms[0], 7, "large");
      assert.ok(n >= 3, `${kind} ${big ? "large" : "smallest"}: furnished (${n})`);
      assert.equal(clashes(f).size, 0, `${kind}: no clashes`);
    }
});

test("special rooms: old plans still load, and new ones survive cleaning", async () => {
  const { autoDesign, SPECIAL_ROOMS, ROOM_KINDS } = await import("../../home-plan.ts");
  for (const k of SPECIAL_ROOMS) assert.ok(ROOM_KINDS.includes(k));
  // A plan saved before special rooms existed is unchanged.
  const old = { v: 1, size: "medium", floors: [{ rooms: [{ id: 1, kind: "living", x: 0, y: 0, w: 10, d: 8 }], items: [{ id: 1, kind: "sofa", x: 1, y: 1, rot: 0 }] }] };
  assert.deepEqual(cleanPlan(old), old);
  for (const size of ["medium", "large"] as const)
    for (let seed = 1; seed <= 6; seed++) {
      const p = autoDesign(size, 2, seed, ["dancehall", "cinema"]);
      const top = p.floors[1];
      assert.ok(top.rooms.some((r) => r.kind === "dancehall"), `${size} ${seed}: dance hall on top`);
      for (const r of top.rooms.filter((r) => r.kind === "dancehall")) assert.ok(r.w >= 8 && r.d >= 8, "big enough");
      assert.ok(top.items.some((i) => i.kind === "dancefloor"), `${size} ${seed}: a dance floor`);
      p.floors.forEach((f, l) => assert.equal(clashes(f).size, 0, `${size} ${seed} L${l}: no clashes`));
      assert.deepEqual(cleanPlan(p), p);
    }
});

test("the bill: a special room costs its fit-out once, and adds to the home's value", async () => {
  const { planBill, startPaid, cleanPaid, ROOM_NAIRA, FURNITURE } = await import("../../home-plan.ts");
  const p = starterPlan("medium");
  p.floors[0].rooms.push({ id: 9, kind: "dancehall", x: 0, y: 0, w: 8, d: 8 });
  p.floors[0].items.push({ id: 99, kind: "djbooth", x: 0, y: 0, rot: 0 });
  // Records saved before special rooms existed have no "rooms".
  const paid = cleanPaid({ floors: 1, items: startPaid().items });
  const bill = planBill(p, paid);
  assert.equal(bill.naira, ROOM_NAIRA.dancehall! + FURNITURE.djbooth.naira);
  assert.ok(bill.lines.some((l) => l.label === "Dance hall fit-out"));
  assert.ok(bill.valueNaira > FURNITURE.djbooth.naira * 0.5);
  // Paid for: it stays paid (also after a trip through the database), even taken out and put back.
  const again = cleanPaid(JSON.parse(JSON.stringify(bill.paid)));
  assert.equal(again.rooms?.dancehall, 1);
  p.floors[0].rooms.pop();
  assert.equal(planBill(p, again).naira, 0);
  p.floors[0].rooms.push({ id: 9, kind: "dancehall", x: 0, y: 0, w: 8, d: 8 });
  assert.equal(planBill(p, again).naira, 0);
  // A second one costs again.
  p.floors[0].rooms.push({ id: 10, kind: "dancehall", x: 10, y: 0, w: 8, d: 8 });
  assert.equal(planBill(p, again).naira, ROOM_NAIRA.dancehall);
  assert.deepEqual(cleanPaid({ rooms: { dancehall: "x", dungeon: 3, cinema: -2, gym: 2 } }).rooms, { gym: 2 });
});

test("a pack's furnished home costs nothing to save, and is the same every time", async () => {
  const { packHomePlan, paidFor, planBill, cleanPaid, mergePaid } = await import("../../home-plan.ts");
  for (const gift of ["home", "dancehall"] as const) {
    const plan = packHomePlan(gift, 12345);
    assert.deepEqual(plan, packHomePlan(gift, 12345));
    const bill = planBill(plan, mergePaid(cleanPaid(null, plan.size), paidFor(plan)));
    assert.equal(bill.naira, 0);
    if (gift === "dancehall") {
      assert.equal(plan.floors.length, 2);
      assert.ok(plan.floors.some((f) => f.rooms.some((r) => r.kind === "dancehall")));
    }
    // Something in every room.
    assert.ok(plan.floors.every((f) => f.items.length > 0));
  }
});
