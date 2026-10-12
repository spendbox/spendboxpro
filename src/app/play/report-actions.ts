"use server";

import { makePlan, type CityPlan } from "@/lib/city/layout";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { toLatLon } from "@/lib/world/geo";
import type { PropertyResult } from "@/lib/world/property-api";
import { PERSON_REPORT_KINDS, REPORT_KINDS, whatThere, type PersonReportKind, type ReportKind } from "@/lib/world/reports";

// Players report problems with the map (docs/MAP_REPORTS.md; the database part is
// game-db/045_map_reports.sql). Where it is in the real world and what the map shows there are
// worked out here.

const plans = new Map<string, CityPlan>();
function planFor(region: string) {
  const map = regionMap(region);
  if (!map) return null;
  let p = plans.get(region);
  if (!p) {
    p = makePlan(map.region.seed, map);
    plans.set(region, p);
  }
  return p;
}

export async function reportMap(r: { region: string; x: number; z: number; kind: ReportKind; note: string }): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to report a problem." };
  const map = regionMap(r.region);
  const plan = planFor(r.region);
  const x = Math.round(Number(r.x));
  const z = Math.round(Number(r.z));
  if (!map || !plan || !map.inside(x, z)) return { ok: false, error: "That spot isn't on the map." };
  if (!REPORT_KINDS.some((k) => k.kind === r.kind)) return { ok: false, error: "Pick what's wrong." };
  const note = String(r.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const at = toLatLon(map.frame, x, z);
  const { error } = await createAdminClient().rpc("map_report", {
    p_user: userId,
    p_region: r.region,
    p_x: x,
    p_z: z,
    p_lat: Math.round(at.lat * 1e6) / 1e6,
    p_lon: Math.round(at.lon * 1e6) / 1e6,
    p_kind: r.kind,
    p_note: note,
    p_what: whatThere(plan, x, z),
  });
  if (error) {
    const code = error.message.split(":")[0];
    if (code === "too_many") return { ok: false, error: "That's all the reports for today. Thank you!" };
    if (code === "already") return { ok: false, error: "You've reported that already. We'll look at it." };
    return { ok: false, error: "That didn't send. Try again." };
  }
  return { ok: true };
}

/**
 * Report a person: a player (their account id) or a character (an "npc:" id), with what's wrong
 * and where it happened. Run game-db/049_reports_and_work.sql for this to work.
 */
export async function reportPerson(r: { id: string; name: string; kind: PersonReportKind; note: string; place?: string }): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to report someone." };
  if (!PERSON_REPORT_KINDS.some((k) => k.kind === r.kind)) return { ok: false, error: "Pick what's wrong." };
  const id = String(r.id ?? "");
  const npc = id.startsWith("npc:") ? id.slice(0, 60) : null;
  const player = npc ? null : /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  if (!npc && !player) return { ok: false, error: "We couldn't tell who that is." };
  const { error } = await createAdminClient().rpc("person_report", {
    p_user: userId,
    p_about_user: player,
    p_about_npc: npc,
    p_name: String(r.name ?? "Someone").slice(0, 60) || "Someone",
    p_kind: r.kind,
    p_note: String(r.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
    p_place: String(r.place ?? "").slice(0, 120),
  });
  if (error) {
    const code = error.message.split(":")[0];
    if (code === "self") return { ok: false, error: "You can't report yourself." };
    if (code === "too_many") return { ok: false, error: "That's all the reports for today. Thank you!" };
    if (code === "already") return { ok: false, error: "You've reported them already. We'll look at it." };
    return { ok: false, error: "That didn't send. Try again." };
  }
  return { ok: true };
}
