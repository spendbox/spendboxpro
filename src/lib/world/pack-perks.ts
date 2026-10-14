import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import { shopKind } from "@/lib/world/items";
import { packById } from "@/lib/world/packs";

/**
 * A paid pack's gifts (docs/PACKS.md): the things it comes with (a phone, a car...) put in your
 * Items, and the Rich Family badge. Once only (starter_payments.perks_at, game-db/069). The
 * furnished home needs nothing here: the home planner gives it when there's no plan yet.
 */
export async function givePackPerks(userId: string) {
  const db = createAdminClient();
  const { data, error } = await db.from("starter_payments").select("reference, pack, region").eq("user_id", userId).eq("status", "paid").is("perks_at", null).limit(1);
  // Before part 69 is run (no perks_at): nothing yet.
  if (error || !data?.length) return;
  const row = data[0] as { reference: string; pack: string; region: string };
  const pack = packById(row.pack);
  if (!pack) return;
  // Claim it first, so two tabs opening at once can't both give the gifts.
  const { data: claimed } = await db.from("starter_payments").update({ perks_at: new Date().toISOString() }).eq("reference", row.reference).is("perks_at", null).select("reference");
  if (!claimed?.length) return;
  const perMint = REGIONS[row.region]?.prices.perMint ?? 1_500;
  const items = pack.gifts
    .map((id) => shopKind(id))
    .filter((k): k is NonNullable<ReturnType<typeof shopKind>> => !!k)
    .map((k) => ({ owner: userId, kind: k.id, name: k.name, category: k.category, base_value: Math.round((k.price / perMint) * 100) / 100, effect: k.effect, how: "gift" }));
  if (items.length) {
    const { error: e } = await db.from("items").insert(items);
    if (e) console.error("Pack gifts failed", row.reference, e.message);
  }
  if (pack.id === "odogwu") await db.from("badges").insert({ user_id: userId, badge: "rich_family", detail: "Rich Family pack" });
  const names = items.map((i) => i.name);
  if (names.length)
    await db.rpc("notify", {
      p_user: userId,
      p_round: null,
      p_kind: "gift",
      p_body: `Your ${pack.label} pack came with: ${names.join(", ")}. They're in your Items.${pack.furnished ? " Your first home comes furnished too." : ""}`,
    });
}
