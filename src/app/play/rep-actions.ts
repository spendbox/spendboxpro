"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { CAUGHT_REP } from "@/lib/world/items";
import { myThings } from "./item-actions";

// Your reputation, explained (src/lib/world/items.ts reputationOf): what adds to it and what
// takes it away.

export type RepLine = { label: string; points: number; how: string };
export type RepDetails = { score: number; plus: RepLine[]; minus: RepLine[] };

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function reputationDetails(): Promise<RepDetails | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const db = createAdminClient();
  const [things, { data: fines }, { data: thefts }, { data: removed }, { data: life }] = await Promise.all([
    myThings(),
    db.from("ledger").select("note").eq("user_id", userId).eq("kind", "fine").limit(500),
    // Part 55 (nothing until it's run).
    db.from("thefts").select("caught, what").eq("thief", userId).limit(1000),
    db.from("marks").select("id").eq("author", userId).not("removed_at", "is", null).limit(500),
    db.from("lives").select("rep_penalty").eq("user_id", userId).maybeSingle(),
  ]);
  if (!things) return null;
  const p = things.reputation.parts;
  const rich = things.items.filter((i) => (i.effect.rep ?? 0) > 0).sort((a, b) => (b.effect.rep ?? 0) - (a.effect.rep ?? 0));
  const plus: RepLine[] = [
    { label: "Home and property", points: p.property, how: "5 for having a home, and more the more your property is worth." },
    { label: "Things and cars", points: p.things, how: rich.length ? `From ${rich.slice(0, 3).map((i) => i.name).join(", ")}${rich.length > 3 ? ` and ${rich.length - 3} more` : ""}.` : "Fine things (jewellery, art, a good car) add to it while you own them." },
    { label: "People liked your marks", points: p.marks, how: "1 for every 2 reactions on what you left on the map (up to 50)." },
    { label: "Taking part", points: p.engagement ?? 0, how: "Time you spend in the game, real conversations, gifts and greetings, friends and visitors. What you do lately counts most." },
    { label: "Challenges", points: p.challenges ?? 0, how: "1 for every challenge you hosted that was played, 3 for every one you won (up to 120)." },
    { label: "Events", points: p.events ?? 0, how: "3 for every event you hosted that 3 or more people came to, 1 for every two events you went to (up to 100)." },
    { label: "Out and about", points: Math.max(0, p.moments ?? 0), how: "How you handled the moments that happen round the city: kindness raises it (up to 60)." },
  ];

  // What took it away: the database keeps one total; this works out where it came from.
  let votedDown = 0;
  const ids = ((removed ?? []) as { id: number }[]).map((m) => m.id);
  if (ids.length) {
    const { data: votes } = await db.from("mark_votes").select("mark_id").in("mark_id", ids).limit(5000);
    const per = new Map<number, number>();
    for (const v of (votes ?? []) as { mark_id: number }[]) per.set(v.mark_id, (per.get(v.mark_id) ?? 0) + 1);
    votedDown = [...per.values()].filter((c) => c >= 5).length;
  }
  const shoplifting = ((fines ?? []) as { note: string | null }[]).filter((f) => (f.note ?? "").includes("shoplifting")).length;
  const caught = ((thefts ?? []) as { caught: boolean; what: string }[]).filter((t) => t.caught).length;
  const picked = ((thefts ?? []) as { caught: boolean; what: string }[]).filter((t) => !t.caught && t.what !== "nothing").length;
  const minus: RepLine[] = [
    { label: "Caught shoplifting", points: -shoplifting * CAUGHT_REP, how: `${shoplifting} time${shoplifting === 1 ? "" : "s"}, ${CAUGHT_REP} each.` },
    { label: "Caught picking pockets", points: -caught * 5, how: `${caught} time${caught === 1 ? "" : "s"}, 5 each.` },
    { label: "Pockets picked (people talk)", points: -picked, how: `${picked}, 1 each, even when nobody saw.` },
    { label: "Marks voted down", points: -votedDown * 3, how: `${votedDown}, 3 each.` },
  ];
  const known = minus.reduce((t, m) => t - m.points, 0);
  const other = Math.round(n(life?.rep_penalty) - known);
  if (other > 0) minus.push({ label: "Other", points: -other, how: "Older fines and penalties." });
  if ((p.moments ?? 0) < 0) minus.push({ label: "Out and about", points: p.moments ?? 0, how: "How you handled the moments that happen round the city: unkind choices lower it." });
  return { score: things.reputation.score, plus, minus: minus.filter((m) => m.points < 0) };
}
