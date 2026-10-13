import { currentUserId, hasLoginCookie, loadGame } from "@/lib/game";
import { welcomeNeeds } from "@/lib/welcome";
import { Game } from "./play/game";
import { Reconnecting } from "./play/reconnecting";

// The home page is the live city itself. Anyone can watch the hunt without an account;
// signed-in players get the full game right here. Signing in and signing up happen in a pop-up
// over the town (?signin=1 opens it straight away).
export default async function Home({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  const userId = await currentUserId().catch(() => null);
  // Signed in (the login cookie is there) but checking it failed: try again, rather than showing
  // the signed-out city (with its sign-in box) to someone who is signed in.
  if (!userId && (await hasLoginCookie())) return <Reconnecting />;
  let state;
  try {
    state = await loadGame(userId);
  } catch (e) {
    console.error("Loading the game failed", e);
    return <Reconnecting />;
  }
  // New players still to pick a name and PIN, and anyone without a date of birth (18+): the
  // pop-up asks, over the town.
  const [welcome, params] = await Promise.all([userId ? welcomeNeeds(userId, state.me.pinSet) : null, searchParams]);
  return <Game state={state} welcome={welcome} openSignIn={params.signin === "1"} />;
}
