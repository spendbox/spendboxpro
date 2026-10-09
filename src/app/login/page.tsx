import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/game";

export const metadata: Metadata = { title: "Enter Newtown" };

// Signing in happens in a pop-up over the town now: this old address opens it there.
export default async function LoginPage() {
  if (await currentUserId()) redirect("/play");
  redirect("/?signin=1");
}
