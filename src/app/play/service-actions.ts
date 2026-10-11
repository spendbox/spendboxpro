"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PropertyResult } from "@/lib/world/property-api";
import { checkServiceForm, gameService, type ServiceBoard, type ServiceForm } from "@/lib/world/services";

// Services between people (docs/SERVICES.md; the database part is game-db/044_services.sql).

function say(message: string | undefined): PropertyResult {
  const [code, arg] = (message ?? "").split(":");
  const words: Record<string, string> = {
    no_life: "Start your life first.",
    not_owner: "Only people who own property can offer services. Buy a property first.",
    too_many: "You have as many open as you can. Close one first.",
    bad_price: "That price is too high.",
    gone: "That isn't available any more.",
    own: "That's your own.",
    not_enough: `You need ₥${arg} for that.`,
    their_funds: "They don't have the money for that right now.",
    not_now: "That can't be done now.",
  };
  if (words[code]) return { ok: false, error: words[code] };
  console.error("Service action failed", message);
  return { ok: false, error: "That didn't work just now. Try again." };
}

const effectOf = (category: string) => {
  const s = gameService(category);
  return s && (s.body || s.mind) ? { body: s.body ?? 0, mind: s.mind ?? 0 } : null;
};

export async function serviceBoard(): Promise<ServiceBoard | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await createAdminClient().rpc("service_board", { p_user: userId });
  if (error) return null;
  return data as ServiceBoard;
}

async function post(fn: "service_offer" | "service_request", f: ServiceForm): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const bad = checkServiceForm(f);
  if (bad) return { ok: false, error: bad };
  const { error } = await createAdminClient().rpc(fn, {
    p_user: userId,
    p_kind: f.kind,
    p_category: f.category,
    p_title: f.title,
    p_about: f.about,
    [fn === "service_offer" ? "p_price" : "p_budget"]: Math.round(Number(f.price) * 100) / 100,
    p_area: f.area,
    p_phone: f.phone ?? null,
    p_whatsapp: f.whatsapp ?? null,
  });
  return error ? say(error.message) : { ok: true };
}

export async function serviceOffer(f: ServiceForm) {
  return post("service_offer", f);
}

export async function serviceRequest(f: ServiceForm) {
  return post("service_request", f);
}

export async function serviceClose(id: string): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { error } = await createAdminClient().rpc("service_close", { p_user: userId, p_id: id });
  return error ? say(error.message) : { ok: true };
}

export async function serviceBook(offerId: string): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { data: o } = await db.from("service_offers").select("category").eq("id", offerId).maybeSingle();
  const { error } = await db.rpc("service_book", { p_user: userId, p_offer: offerId, p_effect: effectOf(String(o?.category ?? "")) });
  return error ? say(error.message) : { ok: true };
}

export async function serviceTake(requestId: string): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { data: r } = await db.from("service_requests").select("category").eq("id", requestId).maybeSingle();
  const { error } = await db.rpc("service_take", { p_user: userId, p_request: requestId, p_effect: effectOf(String(r?.category ?? "")) });
  return error ? say(error.message) : { ok: true };
}

export async function serviceJob(jobId: string, action: "done" | "confirm" | "decline" | "cancel"): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { error } = await createAdminClient().rpc("service_job", { p_user: userId, p_job: jobId, p_action: action });
  return error ? say(error.message) : { ok: true };
}
