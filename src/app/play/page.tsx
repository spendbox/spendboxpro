import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUserId, hasLoginCookie, loadGame } from "@/lib/game";
import { welcomeNeeds } from "@/lib/welcome";
import { Reconnecting } from "./reconnecting";
import { Game } from "./game";

export const metadata: Metadata = { title: "Play" };

/** Test versions (previews, the test site) are told why the city didn't load; the live game never sends it. */
const testing = () => process.env.VERCEL_ENV === "preview" || process.env.NEXT_PUBLIC_APP_ENV === "test";

export default async function PlayPage() {
  const userId = await currentUserId();
  if (!userId) {
    // Still has a login cookie: the check failed for some other reason, so try again shortly
    // instead of asking them to sign in.
    if (await hasLoginCookie()) return <Reconnecting why={testing() ? "Couldn't confirm the sign-in (the login check failed)." : undefined} />;
    redirect("/?signin=1");
  }
  let state;
  try {
    state = await loadGame(userId);
  } catch (e) {
    console.error("Loading the game failed", e);
    return <Reconnecting why={testing() ? `Loading the game failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) : undefined} />;
  }
  // A name and PIN still to pick, or a date of birth to give (18+): the pop-up over the town asks.
  return <Game state={state} welcome={await welcomeNeeds(userId, state.me.pinSet)} />;
}
