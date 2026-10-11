// Reporting problems with the map (docs/MAP_REPORTS.md): the kinds of problem, and what the map shows
// at a spot (saved with the report, so whoever fixes it knows what was there).

import { addressOf, spiralIndex, tileAt, type CityPlan } from "../city/layout.ts";
import { BUILDING_LABEL } from "./buildings.ts";

export type ReportKind = "road" | "bridge" | "building" | "place" | "name" | "water" | "other";

export const REPORT_KINDS: { kind: ReportKind; label: string }[] = [
  { kind: "road", label: "A road is missing or stops short" },
  { kind: "bridge", label: "A bridge or flyover looks wrong" },
  { kind: "building", label: "A building is wrong" },
  { kind: "place", label: "A place is missing or in the wrong spot" },
  { kind: "name", label: "A name is wrong" },
  { kind: "water", label: "Water or land is wrong" },
  { kind: "other", label: "Something else" },
];

/** What the map shows at a tile, in a few words ("Road: Herbert Macaulay Way", "Block of flats, 12 Allen Avenue"). */
export function whatThere(plan: CityPlan, x: number, z: number): string {
  const t = tileAt(plan, spiralIndex(x, z));
  const at = addressOf(plan, t);
  if (t.kind === "road" || t.kind === "bridge") return `${t.kind === "bridge" ? "Bridge" : "Road"}: ${at}`;
  if (t.kind === "structure" && t.structure) return `Landmark: ${t.structure.name}`;
  if (t.building) return `${BUILDING_LABEL[t.building.kind]}, ${at}`;
  if (t.name) return `${t.name} (${t.kind})`;
  return `${t.kind}, ${at}`.slice(0, 200);
}
