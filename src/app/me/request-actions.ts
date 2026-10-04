"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CATEGORIES } from "@/lib/constants";
import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { normalizePhone } from "@/lib/phone";
import { MAX_IMAGE_BYTES, MAX_REQUEST_IMAGES } from "@/lib/requests";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Customers' requests: post (with photos), close, delete and post again.

export interface RequestResult {
  ok?: boolean;
  error?: string;
}

const BUCKET = "request-images";
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function money(value: FormDataEntryValue | null) {
  const n = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function pathFromUrl(url: string) {
  return url.split(`/${BUCKET}/`)[1] ?? null;
}

export async function postRequest(_prev: RequestResult, formData: FormData): Promise<RequestResult> {
  const user = await requireUser("/me/new");
  const body = String(formData.get("body") ?? "").replace(/\s+\n/g, "\n").trim();
  const budgetMax = money(formData.get("budget_max"));
  const budgetMin = money(formData.get("budget_min"));
  const category = String(formData.get("category") ?? "");
  const area = String(formData.get("area") ?? "").trim().slice(0, 80);
  const whatsapp = formData.get("contact_whatsapp") === "on";
  const call = formData.get("contact_call") === "on";
  const email = formData.get("contact_email") === "on";
  const repostOf = String(formData.get("reposted_from") ?? "") || null;
  const kept = formData.getAll("keep_image").map(String).filter((u) => u.includes(`/${BUCKET}/`));
  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);

  if (body.length < 5) return { error: "Tell businesses what you need in a few words." };
  if (body.length > 500) return { error: "Please keep it under 500 characters." };
  if (!budgetMax) return { error: "Add your budget, so businesses know what to offer." };
  if (budgetMin && budgetMin > budgetMax) return { error: "The lowest amount should be less than the highest." };
  if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) return { error: "Pick a category from the list." };
  if (!whatsapp && !call && !email) return { error: "Choose at least one way businesses can reach you." };
  if (kept.length + files.length > MAX_REQUEST_IMAGES) return { error: `Add up to ${MAX_REQUEST_IMAGES} photos.` };
  for (const f of files) {
    if (!IMAGE_TYPES[f.type]) return { error: "Photos must be JPG, PNG or WebP." };
    if (f.size > MAX_IMAGE_BYTES) return { error: "One of the photos is too big. Please try another." };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("phone, email").eq("id", user.id).maybeSingle();
  // WhatsApp and calls need a number: save one typed here.
  if ((whatsapp || call) && !profile?.phone) {
    const digits = normalizePhone(String(formData.get("phone_country") || DEFAULT_COUNTRY_CODE), String(formData.get("phone") ?? ""));
    if (!digits) return { error: "Add your phone number so businesses can WhatsApp or call you." };
    const { data: taken } = await admin.from("profiles").select("id").eq("phone", digits).neq("id", user.id).maybeSingle();
    if (taken) return { error: "That number is already on another Spendbox account." };
    const { error } = await admin.auth.admin.updateUserById(user.id, { phone: digits, phone_confirm: true });
    if (error) return { error: "Couldn't save your phone number. Please try again." };
  }
  if (email && !profile?.email) return { error: "Add your email in Profile first, or choose WhatsApp or call." };

  const uploaded: string[] = [];
  for (const f of files) {
    const path = `${user.id}/${crypto.randomUUID()}.${IMAGE_TYPES[f.type]}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type, cacheControl: "31536000" });
    if (error) {
      if (uploaded.length) await admin.storage.from(BUCKET).remove(uploaded.map((u) => pathFromUrl(u)!).filter(Boolean));
      return { error: "Couldn't upload your photos. Please try again." };
    }
    uploaded.push(admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("post_request", {
    p_body: body,
    p_budget_max: budgetMax,
    p_budget_min: budgetMin,
    p_category: category || null,
    p_area: area || null,
    p_images: [...kept, ...uploaded],
    p_whatsapp: whatsapp,
    p_call: call,
    p_email: email,
    p_reposted_from: repostOf,
  });
  if (error) {
    if (uploaded.length) await admin.storage.from(BUCKET).remove(uploaded.map((u) => pathFromUrl(u)!).filter(Boolean));
    return { error: error.message.replace(/^.*?: /, "") || "Couldn't post your request. Please try again." };
  }
  revalidatePath("/me", "layout");
  redirect("/me/ask?posted=1");
}

export async function closeRequest(id: string, found: boolean): Promise<RequestResult> {
  await requireUser("/me");
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_request", { p_request_id: id, p_found: found });
  if (error) return { error: "Couldn't update it. Please try again." };
  revalidatePath("/me");
  return { ok: true };
}

export async function deleteRequest(id: string): Promise<RequestResult> {
  const user = await requireUser("/me");
  const supabase = await createClient();
  const { data } = await supabase.from("requests").select("images, reposted_from").eq("id", id).eq("customer_id", user.id).maybeSingle();
  if (!data) return { error: "That request is already gone." };
  const { error } = await supabase.from("requests").delete().eq("id", id);
  if (error) return { error: "Couldn't delete it. Please try again." };
  // Remove photos no other request of theirs still uses.
  const { data: others } = await supabase.from("requests").select("images").eq("customer_id", user.id);
  const inUse = new Set((others ?? []).flatMap((r) => r.images as string[]));
  const orphans = (data.images as string[]).filter((u) => !inUse.has(u)).map(pathFromUrl).filter((p): p is string => Boolean(p));
  if (orphans.length) await createAdminClient().storage.from(BUCKET).remove(orphans);
  revalidatePath("/me");
  return { ok: true };
}
