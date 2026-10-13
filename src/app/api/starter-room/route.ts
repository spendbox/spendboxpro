import { NextResponse, type NextRequest } from "next/server";
import { makePlan, type CityPlan } from "@/lib/city/layout";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { shuffled, starterBuildings, type StarterBuilding } from "@/lib/world/starter-rooms";

// Free starter rooms (docs/STARTER_ROOMS.md, game-db/074_simple_life.sql).
//   GET  /api/starter-room            → your free room (if you have one), whether you can still move,
//                                       and a few neighbourhoods with free rooms to move to.
//   POST /api/starter-room            → a free room now, if you have no home (the game calls it).
//   POST /api/starter-room {area}     → your one free move, to a free room in that neighbourhood.

const plans = new Map<string, CityPlan>();
function planFor(region: string) {
  const map = regionMap(region);
  if (!map) return null;
  let plan = plans.get(region);
  if (!plan) {
    plan = makePlan(map.region.seed, map);
    plans.set(region, plan);
  }
  return { map, plan };
}

type Db = ReturnType<typeof createAdminClient>;

/** A free room: buildings in random order, 40 at a time, the first room nobody has. */
async function freeRoom(db: Db, list: StarterBuilding[]) {
  const order = shuffled(list);
  for (let i = 0; i < Math.min(order.length, 400); i += 40) {
    const batch = order.slice(i, i + 40);
    const { data } = await db.from("property_units").select("unit_id").in("building_id", batch.map((b) => b.building.id));
    const taken = new Set(((data ?? []) as { unit_id: string }[]).map((r) => r.unit_id));
    for (const b of batch)
      for (const k of b.rooms) {
        const unit = `${b.building.id}/${k}`;
        if (!taken.has(unit)) return { b, k, unit };
      }
  }
  return null;
}

const words: Record<string, string> = {
  no_life: "Start your life first.",
  has_home: "You have a home already.",
  moved: "You've used your free move.",
  no_room: "You don't have a free room to move from.",
  taken: "Someone just took that room. Try again.",
};

export async function GET() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json(null);
  const db = createAdminClient();
  const [{ data: life }, { data: room }] = await Promise.all([
    db.from("lives").select("region, starter_moves").eq("user_id", userId).maybeSingle(),
    db.from("property_units").select("unit_id, label").eq("owner_id", userId).eq("starter", true).maybeSingle(),
  ]);
  if (!life) return NextResponse.json(null);
  const p = planFor(String(life.region));
  if (!p) return NextResponse.json(null);
  // A handful of neighbourhoods to move to (different ones each time).
  const list = starterBuildings(p.map, p.plan);
  const areas = [...new Set(shuffled(list).map((b) => b.area).filter(Boolean))].slice(0, 8);
  return NextResponse.json(
    { room: room ? { unit: String(room.unit_id), label: String(room.label) } : null, canMove: !!room && Number(life.starter_moves ?? 0) < 1, areas },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ error: "Sign in first." });
  const body = (await req.json().catch(() => ({}))) as { area?: unknown };
  const area = typeof body.area === "string" ? body.area.slice(0, 80) : null;
  const db = createAdminClient();
  const { data: life } = await db.from("lives").select("region").eq("user_id", userId).maybeSingle();
  if (!life) return NextResponse.json({ error: words.no_life });
  const p = planFor(String(life.region));
  if (!p) return NextResponse.json({ error: "Unknown place." });
  // Renting a home (game-db/077): no free room as well.
  if (!area) {
    const { data: rented } = await db.from("home_rentals").select("unit_id").eq("user_id", userId).maybeSingle();
    if (rented) return NextResponse.json({ error: words.has_home });
  }
  // Rooms of players away for 60 days go back first.
  await db.rpc("starter_rooms_sweep");
  let list = starterBuildings(p.map, p.plan);
  if (area) list = list.filter((b) => b.area === area);
  for (let tries = 0; tries < 3; tries++) {
    const free = await freeRoom(db, list);
    if (!free) return NextResponse.json({ error: area ? `No free rooms in ${area} right now. Try another area.` : "No free rooms right now. Try again soon." });
    const unit = free.b.building.units[free.k];
    const { data, error } = await db.rpc("starter_room_give", {
      p_user: userId,
      p_region: String(life.region),
      p_unit: free.unit,
      p_snapshot: free.b.building,
      p_label: unit?.label ?? "Room",
      p_area: unit?.area ?? 12,
      p_move: !!area,
    });
    if (error) {
      const code = error.message.split(":")[0];
      if (code === "taken") continue;
      if (/does not exist|starter_room_give/.test(error.message)) return NextResponse.json({ error: "Free rooms are switched on soon." });
      return NextResponse.json({ error: words[code] ?? "That didn't work just now. Try again." });
    }
    const d = data as { unit: string; already?: boolean };
    return NextResponse.json({ unit: d.unit, already: !!d.already, area: free.b.area, x: free.b.x, z: free.b.z });
  }
  return NextResponse.json({ error: words.taken });
}
