import { redirect } from "next/navigation";
import { currentUserId, loadGame } from "@/lib/game";
import { Game } from "./play/game";
import { Reconnecting } from "./play/reconnecting";

// The home page is the live city itself. Anyone can watch the hunt without an account;
// signed-in players get the full game right here.
export default async function Home() {
  const userId = await currentUserId().catch(() => null);
  // (If checking the login hiccups, they simply watch for a moment: the board refreshes every
  // few seconds and picks their account back up.)
  let state;
  try {
    state = await loadGame(userId);
  } catch (e) {
    console.error("Loading the game failed", e);
    return <Reconnecting />;
  }
  if (userId && !state.me.pinSet) redirect("/welcome");
  return <Game state={state} />;
}
