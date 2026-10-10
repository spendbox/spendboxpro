import type { Metadata } from "next";
import { AvatarLab } from "./avatar-lab";

// Test page for the new 3D avatar, built step by step (currently: head, body and clothes).
// Not linked from anywhere, and kept out of search results.

export const metadata: Metadata = {
  title: "Avatar lab",
  robots: { index: false, follow: false },
};

// ?r=<recipe text> opens a given avatar, ?e=<number> picks an expression, ?view=body shows the whole body, ?move=walk plays a move (?mt=<s> freezes it), ?lod=far|picture picks the level of detail (used for screenshots).
export default async function Page({ searchParams }: PageProps<"/avatar-lab">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <AvatarLab initialRecipe={one(q.r)} initialExpr={Number(one(q.e)) || 0} initialView={one(q.view)} initialMove={one(q.move)} initialLod={one(q.lod)} />;
}
