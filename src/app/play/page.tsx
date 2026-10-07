import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUserId, loadGame } from "@/lib/game";
import { Game } from "./game";

export const metadata: Metadata = { title: "Play" };

export default async function PlayPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/login");
  const state = await loadGame(userId);
  return <Game state={state} />;
}
