import type { Metadata } from "next";
import { CopsLabLoader as CopsLab } from "./lab-loader";

// Test page for Police & Thieves (src/app/play/cops): the lobby with made-up numbers, or a
// practice match against bots, without signing in or a database. Not linked from anywhere, and
// kept out of search results. ?view=lobby|ring|match|watch, ?tod=day|dusk|night, ?side=0|1 (police or
// thieves), ?secs=<match length> (a short one shows the end screen), ?at=<seconds into the match>.

export const metadata: Metadata = {
  title: "Police & Thieves lab",
  robots: { index: false, follow: false },
};

export default async function Page({ searchParams }: PageProps<"/cops-lab">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <CopsLab view={one(q.view) ?? "match"} tod={one(q.tod) ?? "day"} side={Number(one(q.side) ?? 0) ? 1 : 0} secs={Number(one(q.secs)) || 300} />;
}
