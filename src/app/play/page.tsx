import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUserId, hasLoginCookie, loadGame } from "@/lib/game";
import { welcomeNeeds } from "@/lib/welcome";
import { Reconnecting } from "./reconnecting";
import { Game } from "./game";

export const metadata: Metadata = { title: "Play" };

export default async function PlayPage() {
  const userId = await currentUserId();
  if (!userId) {
    // Still has a login cookie: the check failed for some other reason, so try again shortly
    // instead of asking them to sign in.
    if (await hasLoginCookie()) return <Reconnecting />;
    redirect("/?signin=1");
  }
  let state;
  try {
    state = await loadGame(userId);
  } catch (e) {
    console.error("Loading the game failed", e);
    return <Reconnecting />;
  }
  // A name and PIN still to pick, or a date of birth to give (18+): the pop-up over the town asks.
  return <Game state={state} welcome={await welcomeNeeds(userId, state.me.pinSet)} />;
}
