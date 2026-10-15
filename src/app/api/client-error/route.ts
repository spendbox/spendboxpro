import { NextResponse, type NextRequest } from "next/server";

/**
 * POST /api/client-error: a player's page broke (src/components/recovering.tsx). Written to the
 * server log, so it shows in Vercel's logs (search "Client error") with the page and the reason.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text().catch(() => "");
  let d: Record<string, unknown> = {};
  try {
    d = JSON.parse(raw.slice(0, 4000)) as Record<string, unknown>;
  } catch {
    // Not JSON: log what came.
  }
  const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  console.error("Client error", { where: s(d.where, 40), name: s(d.name, 80), message: s(d.message, 500), digest: s(d.digest, 40), url: s(d.url, 200), online: d.online === true, agent: s(req.headers.get("user-agent"), 200) });
  return new NextResponse(null, { status: 204 });
}
