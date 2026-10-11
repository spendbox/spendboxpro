import type { Metadata } from "next";
import { WorldLab } from "./world-lab";

// Test page for the real-world map (src/lib/world), built step by step: shows a region on its
// own, without signing in or a game running. Not linked from anywhere, and kept out of search
// results. ?region=lagos (the default) picks the region.

export const metadata: Metadata = {
  title: "World lab",
  robots: { index: false, follow: false },
};

export default async function Page({ searchParams }: PageProps<"/world-lab">) {
  const q = await searchParams;
  const region = Array.isArray(q.region) ? q.region[0] : q.region;
  return <WorldLab region={region ?? "lagos"} />;
}
