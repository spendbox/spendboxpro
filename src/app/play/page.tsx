import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { needsBirthDate } from "@/lib/age";
import { currentUserId, hasLoginCookie, loadGame } from "@/lib/game";
import { Reconnecting } from "./reconnecting";
import { Game } from "./game";

export const metadata: Metadata = { title: "Play" };

export default async function PlayPage() {
  const userId = await currentUserId();
  if (!userId) {
    // Still has a login cookie: the check failed for some other reason, so try again shortly
    // instead of sending them to the sign-in page.
    if (await hasLoginCookie()) return <Reconnecting />;
    redirect("/login");
  }
  let state;
  try {
    state = await loadGame(userId);
  } catch (e) {
    console.error("Loading the game failed", e);
    return <Reconnecting />;
  }
  if (!state.me.pinSet) redirect("/welcome");
  // 18+: players without a date of birth add it once (skipped if the check hiccups).
  if (await needsBirthDate(userId)) redirect("/welcome");
  return <Game state={state} />;
}
