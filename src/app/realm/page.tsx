import type { Metadata } from "next";
import { Realm } from "./realm";

// The Spirit Realm (docs/REALM.md): a battle at the top of every hour. Anyone can watch; signing
// in lets you fight.

export const metadata: Metadata = {
  title: "Spirit Realm",
  description: "A battle every hour: buy angels, devils, ghosts and soldiers, march on the middle, and win the pool.",
};

export default function RealmPage() {
  return <Realm />;
}
