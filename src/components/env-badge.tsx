/**
 * A badge on every page of the test version of the game, so it's never mixed up with the real
 * one (docs/TESTING.md). Shown when NEXT_PUBLIC_APP_ENV is "test", or on Vercel's preview
 * deployments (one is made for every pull request); never on the live site.
 */
export function EnvBadge() {
  const env = process.env.NEXT_PUBLIC_APP_ENV ?? (process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" ? "preview" : "");
  if (env !== "test" && env !== "preview") return null;
  return (
    <div className="pointer-events-none fixed bottom-1 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-[#e03131] px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg">
      {env === "test" ? "Test version" : "Preview: not the live game"}
    </div>
  );
}
