import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "@/components/icons";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { isOwner } from "./actions";
import { ReportList, type Group, type Report } from "./report-list";

export const metadata: Metadata = { title: "Map reports", robots: { index: false } };

/** The owner's list of map problems players reported (docs/MAP_REPORTS.md). */
export default async function MapReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  if (!(await isOwner())) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-4 text-center">
        <h1 className="font-display text-2xl font-bold">Map reports</h1>
        <p className="text-muted">Sign in to the game with the owner&apos;s email (ADMIN_EMAIL) to see this page.</p>
        <Link href="/play" className="underline">
          Go to the game
        </Link>
      </main>
    );
  }
  const sp = await searchParams;
  const all = sp.show === "all";
  const { data } = await createAdminClient().rpc("map_reports_list", { p_status: all ? "all" : "open" });
  const reports = (Array.isArray(data) ? data : []) as Report[];
  // Group reports about the same spot (within about 300 m), busiest first.
  const groups = new Map<string, Group>();
  for (const r of reports) {
    const key = `${r.region}:${Math.round(r.x / 3)},${Math.round(r.z / 3)}`;
    let g = groups.get(key);
    if (!g) {
      const map = regionMap(r.region);
      g = { key, area: map?.areaAt(r.x, r.z) ?? r.region, region: r.region, x: r.x, z: r.z, lat: Number(r.lat), lon: Number(r.lon), reports: [] };
      groups.set(key, g);
    }
    g.reports.push({ ...r, lat: Number(r.lat), lon: Number(r.lon) });
  }
  const list = [...groups.values()].sort((a, b) => b.reports.length - a.reports.length);
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 py-8">
      <div>
        <Link href="/play?world=lagos" className="inline-flex items-center gap-1 text-sm font-medium text-muted">
          <ArrowLeft className="size-4" /> Back to the map
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold">Map reports</h1>
        <p className="mt-1 text-sm text-muted">
          {reports.length} {all ? "in all" : "open"} ·{" "}
          <Link href={all ? "/map-reports" : "/map-reports?show=all"} className="underline">
            {all ? "Show open only" : "Show all"}
          </Link>
        </p>
        <p className="mt-2 text-sm text-muted">
          Check each against the real map. Send the ones to fix to Claude (the button copies them), and mark them Fixed once they&apos;re live: the player who reported it
          gets a thank-you.
        </p>
      </div>
      {list.length === 0 ? <p className="text-muted">Nothing to look at right now.</p> : <ReportList groups={list} />}
    </main>
  );
}
