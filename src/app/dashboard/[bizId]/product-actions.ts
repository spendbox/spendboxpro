"use server";

import { revalidatePath } from "next/cache";
import { requireOwnedBusiness } from "@/lib/auth";
import { customCategoryId, guessCategory, isKnownCategory, isPlacement, MAX_CUSTOM_CATEGORIES, type CustomCategory, type Placement } from "@/lib/product-categories";
import { IMAGE_TYPES, VIDEO_TYPES } from "@/lib/product-rules";
import { readTheme } from "@/lib/store-theme";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ProductKind, ProductMediaType } from "@/lib/types";

// Products and services. Photos and videos go straight from the browser to
// storage through one-time upload links (videos are too big to pass through
// the server); these actions hand out the links and save the product.

const BUCKET = "product-media";

export interface UploadTicket {
  path: string;
  signedUrl: string;
}

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refresh(bizId: string) {
  revalidatePath(`/dashboard/${bizId}`, "layout");
  revalidatePath("/me", "layout");
}

/** One-time upload links for a product's photo or video (and a video's still frame). */
export async function prepareProductUpload(
  bizId: string,
  mediaType: ProductMediaType,
  contentType: string,
): Promise<ActionResult<{ media: UploadTicket; poster: UploadTicket | null }>> {
  await requireOwnedBusiness(bizId);
  const ext = (mediaType === "video" ? VIDEO_TYPES : IMAGE_TYPES)[contentType];
  if (!ext) return { ok: false, error: mediaType === "video" ? "Please use an MP4 or MOV video." : "Please use a JPG, PNG or WebP photo." };
  const storage = createAdminClient().storage.from(BUCKET);
  const id = crypto.randomUUID();
  const media = await storage.createSignedUploadUrl(`${bizId}/${id}.${ext}`);
  const poster = mediaType === "video" ? await storage.createSignedUploadUrl(`${bizId}/${id}-poster.jpg`) : null;
  if (media.error || !media.data || poster?.error) return { ok: false, error: "Couldn't get ready to upload. Please try again." };
  return {
    ok: true,
    media: { path: media.data.path, signedUrl: media.data.signedUrl },
    poster: poster?.data ? { path: poster.data.path, signedUrl: poster.data.signedUrl } : null,
  };
}

/** Only files this business was given upload links for. */
const ownPath = (bizId: string, p?: string | null) => !p || (p.startsWith(`${bizId}/`) && !p.includes(".."));

async function uploaded(bizId: string, path: string) {
  const name = path.slice(bizId.length + 1);
  const { data: files } = await createAdminClient().storage.from(BUCKET).list(bizId, { search: name, limit: 5 });
  return Boolean(files?.some((f) => f.name === name));
}

const pathOf = (bizId: string, url: string | null | undefined) => {
  const p = url?.split(`/${BUCKET}/`)[1];
  return p && p.startsWith(`${bizId}/`) ? p : null;
};

export interface ProductInput {
  kind: ProductKind;
  title: string;
  description?: string | null;
  /** Naira, or empty for "ask for price". */
  price?: string | number | null;
  /** Its category's id; an unknown or missing one is guessed. */
  category?: string | null;
}

/** What a business's categories need to check a product's: its own categories and its business categories. */
interface CategoryCtx {
  custom: CustomCategory[];
  businessCategories: string[];
}
const ctxOf = (business: { store_theme?: unknown; categories?: string[] | null }): CategoryCtx => ({
  custom: readTheme(business.store_theme).categories.custom,
  businessCategories: business.categories ?? [],
})

function clean(input: ProductInput, ctx: CategoryCtx): ActionResult<{ values: { kind: ProductKind; title: string; description: string | null; price: number | null; category: string } }> {
  const title = input.title?.trim() ?? "";
  if (title.length < 2) return { ok: false, error: "Please give it a name." };
  if (title.length > 80) return { ok: false, error: "Please keep the name under 80 characters." };
  const description = input.description?.trim().slice(0, 500) || null;
  const raw = String(input.price ?? "").replace(/[^\d.]/g, "");
  const price = raw ? Math.round(Number(raw)) : null;
  if (price !== null && !(price >= 0 && price <= 1_000_000_000)) return { ok: false, error: "Please check the price." };
  const kind = input.kind === "service" ? "service" : "product";
  const picked = typeof input.category === "string" ? input.category : "";
  const category = isKnownCategory(picked, ctx.custom) ? picked : guessCategory({ title, description, kind }, ctx);
  return { ok: true, values: { kind, title, description, price, category } };
}

/** Saves a new product once its photo or video is uploaded. */
export async function createProduct(
  bizId: string,
  input: ProductInput & { mediaType: ProductMediaType; mediaPath: string; posterPath?: string | null; aspect?: number | null },
): Promise<ActionResult<{ id: string; mediaUrl: string }>> {
  const { business } = await requireOwnedBusiness(bizId);
  const checked = clean(input, ctxOf(business));
  if (!checked.ok) return checked;
  if (!input.mediaPath || !ownPath(bizId, input.mediaPath) || !ownPath(bizId, input.posterPath)) return { ok: false, error: "Please add a photo or video again." };
  const storage = createAdminClient().storage.from(BUCKET);
  if (!(await uploaded(bizId, input.mediaPath))) return { ok: false, error: "The upload didn't finish. Please try again." };

  const mediaUrl = storage.getPublicUrl(input.mediaPath).data.publicUrl;
  const posterUrl = input.posterPath ? storage.getPublicUrl(input.posterPath).data.publicUrl : null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      business_id: bizId,
      ...checked.values,
      currency: business.currency ?? "NGN",
      media_type: input.mediaType === "video" ? "video" : "image",
      media_url: mediaUrl,
      poster_url: posterUrl,
      media_aspect: typeof input.aspect === "number" && input.aspect >= 0.2 && input.aspect <= 5 ? input.aspect : null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: /200/.test(error?.message ?? "") ? error!.message : "Couldn't save it. Please try again." };
  refresh(bizId);
  return { ok: true, id: data.id as string, mediaUrl };
}

export async function updateProduct(bizId: string, productId: string, input: ProductInput): Promise<ActionResult> {
  const { business } = await requireOwnedBusiness(bizId);
  const checked = clean(input, ctxOf(business));
  if (!checked.ok) return checked;
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ ...checked.values, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("business_id", bizId);
  if (error) return { ok: false, error: "Couldn't save. Please try again." };
  refresh(bizId);
  return { ok: true };
}

export async function setProductActive(bizId: string, productId: string, active: boolean) {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  await supabase.from("products").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", productId).eq("business_id", bizId);
  refresh(bizId);
}

/** Deletes a product and its photo or video. */
export async function deleteProduct(bizId: string, productId: string): Promise<ActionResult> {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { data: product } = await supabase.from("products").select("*").eq("id", productId).eq("business_id", bizId).maybeSingle();
  if (!product) return { ok: false, error: "Not found." };
  const { error } = await supabase.from("products").delete().eq("id", productId).eq("business_id", bizId);
  if (error) return { ok: false, error: "Couldn't delete. Please try again." };
  const paths = [product.media_url, product.poster_url, product.cutout_url].map((u) => pathOf(bizId, u as string | null)).filter((p): p is string => Boolean(p));
  if (paths.length) await createAdminClient().storage.from(BUCKET).remove(paths);
  refresh(bizId);
  return { ok: true };
}

// ---------------------------------------------------------------- Many at once

/** Saves changes to several products together. Returns the first problem, naming the product. */
export async function updateProducts(bizId: string, items: (ProductInput & { id: string })[]): Promise<ActionResult<{ saved: number }>> {
  const { business } = await requireOwnedBusiness(bizId);
  const ctx = ctxOf(business);
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "Nothing to save." };
  if (items.length > 100) return { ok: false, error: "Please save up to 100 at a time." };
  const checked = [];
  for (const [n, item] of items.entries()) {
    const c = clean(item, ctx);
    if (!c.ok) return { ok: false, error: `${item.title?.trim() || `Product ${n + 1}`}: ${c.error}` };
    checked.push({ id: String(item.id), values: c.values });
  }
  const supabase = await createClient();
  const now = new Date().toISOString();
  const results = await Promise.all(checked.map((c) => supabase.from("products").update({ ...c.values, updated_at: now }).eq("id", c.id).eq("business_id", bizId)));
  if (results.some((r) => r.error)) return { ok: false, error: "Some changes didn't save. Please try again." };
  refresh(bizId);
  return { ok: true, saved: checked.length };
}

/** Shows or hides several products. */
export async function setProductsActive(bizId: string, ids: string[], active: boolean): Promise<ActionResult> {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ is_active: active, updated_at: new Date().toISOString() }).in("id", ids.slice(0, 200)).eq("business_id", bizId);
  if (error) return { ok: false, error: "Couldn't save. Please try again." };
  refresh(bizId);
  return { ok: true };
}

/** Deletes several products and their files. */
export async function deleteProducts(bizId: string, ids: string[]): Promise<ActionResult> {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { data: products } = await supabase.from("products").select("*").in("id", ids.slice(0, 200)).eq("business_id", bizId);
  if (!products?.length) return { ok: false, error: "Not found." };
  const { error } = await supabase.from("products").delete().in("id", products.map((p) => p.id)).eq("business_id", bizId);
  if (error) return { ok: false, error: "Couldn't delete. Please try again." };
  const paths = products.flatMap((p) => [p.media_url, p.poster_url, p.cutout_url].map((u) => pathOf(bizId, u as string | null))).filter((p): p is string => Boolean(p));
  if (paths.length) await createAdminClient().storage.from(BUCKET).remove(paths);
  refresh(bizId);
  return { ok: true };
}

// ---------------------------------------------------------------- Categories

/** Moves one product to another category (from the shop editor). */
export async function setProductCategory(bizId: string, productId: string, category: string): Promise<ActionResult> {
  const { business } = await requireOwnedBusiness(bizId);
  if (!isKnownCategory(category, ctxOf(business).custom)) return { ok: false, error: "Please pick a category." };
  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ category, updated_at: new Date().toISOString() }).eq("id", productId).eq("business_id", bizId);
  if (error) return { ok: false, error: "Couldn't save. Please try again." };
  refresh(bizId);
  return { ok: true };
}

/** Adds a category of the business's own (or finds the one with that name). Kept in the shop design. */
export async function addProductCategory(bizId: string, name: string, placement: Placement): Promise<ActionResult<{ category: CustomCategory }>> {
  const { business } = await requireOwnedBusiness(bizId);
  const clean = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 32);
  if (clean.length < 2) return { ok: false, error: "Please give the category a name." };
  const theme = readTheme(business.store_theme);
  const id = customCategoryId(clean);
  const existing = theme.categories.custom.find((c) => c.id === id);
  if (existing) return { ok: true, category: existing };
  if (theme.categories.custom.length >= MAX_CUSTOM_CATEGORIES) return { ok: false, error: `You can add up to ${MAX_CUSTOM_CATEGORIES} categories of your own.` };
  const category: CustomCategory = { id, name: clean, placement: isPlacement(placement) ? placement : "shelf" };
  // Only the categories change; the rest of the stored design stays as it was.
  const stored = business.store_theme && typeof business.store_theme === "object" ? (business.store_theme as Record<string, unknown>) : {};
  const next = { ...stored, categories: { ...theme.categories, custom: [...theme.categories.custom, category] } };
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").update({ store_theme: next }).eq("id", bizId);
  if (error) return { ok: false, error: "Couldn't add it. Please try again." };
  refresh(bizId);
  return { ok: true, category };
}
