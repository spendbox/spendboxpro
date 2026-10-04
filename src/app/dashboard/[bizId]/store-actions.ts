"use server";

import { revalidatePath } from "next/cache";
import { requireOwnedBusiness } from "@/lib/auth";
import { readTheme, themeImages } from "@/lib/store-theme";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ART_FOLDER = (bizId: string) => `${bizId}/store/`;

/** Saves how the business's 3D store looks (anything unknown is reset to the defaults). */
export async function saveStoreTheme(bizId: string, theme: unknown): Promise<{ ok: boolean; error?: string }> {
  const { business } = await requireOwnedBusiness(bizId);
  const clean = readTheme(theme);
  // Only pictures this business uploaded can hang in its store.
  clean.art = clean.art.map((a, i) => (a.kind === "image" && !a.url.includes(`/logos/${ART_FOLDER(bizId)}`) ? readTheme({}).art[i]! : a)) as typeof clean.art;
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").update({ store_theme: clean }).eq("id", bizId);
  if (error) return { ok: false, error: "Couldn't save. Please try again." };

  // Delete pictures that were replaced.
  const kept = new Set(themeImages(clean));
  const old = themeImages(readTheme(business.store_theme)).filter((url) => !kept.has(url));
  const paths = old.map((url) => url.split("/logos/")[1]).filter((p): p is string => Boolean(p?.startsWith(ART_FOLDER(bizId))));
  if (paths.length) await createAdminClient().storage.from("logos").remove(paths);

  revalidatePath(`/dashboard/${bizId}`, "layout");
  revalidatePath("/me", "layout");
  revalidatePath(`/s/${business.slug}`);
  return { ok: true };
}

/** Uploads a picture for the store's wall art (already resized in the browser). */
export async function uploadStoreArt(bizId: string, formData: FormData): Promise<{ url?: string; error?: string }> {
  await requireOwnedBusiness(bizId);
  const file = formData.get("art");
  if (!(file instanceof File) || file.size === 0) return { error: "Please choose a picture." };
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return { error: "Please use a PNG or JPG picture." };
  if (file.size > 1_500_000) return { error: "That picture is too big. Please try a smaller one." };
  const admin = createAdminClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${ART_FOLDER(bizId)}${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("logos").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: "31536000" });
  if (error) return { error: "Couldn't upload the picture. Please try again." };
  return { url: admin.storage.from("logos").getPublicUrl(path).data.publicUrl };
}
