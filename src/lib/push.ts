import "server-only";

import { createPrivateKey, createSign } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Web push (docs/PEOPLE.md): a tap on a player's phone or browser when something happens to them
// (someone's at their door, a gift, a sale). The push carries nothing: the phone's service worker
// (public/sw.js) asks /api/push/latest what to show, signed in as the player. So only the VAPID
// signature is needed (no message encryption), with Node's own crypto.
//
// Keys (once, see scripts/vapid-keys.mjs): NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
// VAPID_SUBJECT (a mailto: address) in Vercel. Without them nothing is sent.

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function vapidKey() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  const raw = fromB64url(pub);
  if (raw.length !== 65 || raw[0] !== 4) return null;
  const key = createPrivateKey({ key: { kty: "EC", crv: "P-256", x: b64url(raw.subarray(1, 33)), y: b64url(raw.subarray(33, 65)), d: priv }, format: "jwk" });
  return { pub, key };
}

/** The signed token a push service wants: for this endpoint's origin, good for 12 hours. */
function vapidToken(endpoint: string, key: ReturnType<typeof createPrivateKey>) {
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT ?? "mailto:hello@newtown.world" })));
  const sign = createSign("SHA256");
  sign.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(sign.sign({ key, dsaEncoding: "ieee-p1363" }))}`;
}

/** Tap every phone and browser a player has turned notifications on for. Never throws. */
export async function pushTo(userId: string | null | undefined) {
  if (!userId) return;
  try {
    const keys = vapidKey();
    if (!keys) return;
    const db = createAdminClient();
    const { data } = await db.from("push_subscriptions").select("endpoint").eq("user_id", userId).limit(10);
    await Promise.all(
      (data ?? []).map(async ({ endpoint }) => {
        const res = await fetch(endpoint as string, {
          method: "POST",
          headers: { Authorization: `vapid t=${vapidToken(endpoint as string, keys.key)}, k=${keys.pub}`, TTL: "3600", Urgency: "normal", "Content-Length": "0" },
        }).catch(() => null);
        // Gone (unsubscribed, uninstalled): forget it.
        if (res && (res.status === 404 || res.status === 410)) await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
      }),
    );
  } catch (e) {
    console.error("Push failed", e);
  }
}

/**
 * Tap many players at once (an event told to thousands): their phones looked up a few hundred
 * players at a time, one signature per push service, and at most 50 sent at once. Never throws.
 */
export async function pushToMany(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    const keys = vapidKey();
    if (!keys) return;
    const db = createAdminClient();
    const tokens = new Map<string, string>();
    const tokenFor = (endpoint: string) => {
      const origin = new URL(endpoint).origin;
      let t = tokens.get(origin);
      if (!t) tokens.set(origin, (t = vapidToken(endpoint, keys.key)));
      return t;
    };
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await db.from("push_subscriptions").select("endpoint").in("user_id", ids.slice(i, i + 300)).limit(3000);
      const ends = (data ?? []).map((r) => String(r.endpoint));
      for (let j = 0; j < ends.length; j += 50) {
        await Promise.all(
          ends.slice(j, j + 50).map(async (endpoint) => {
            const res = await fetch(endpoint, {
              method: "POST",
              headers: { Authorization: `vapid t=${tokenFor(endpoint)}, k=${keys.pub}`, TTL: "3600", Urgency: "normal", "Content-Length": "0" },
              signal: AbortSignal.timeout(8000),
            }).catch(() => null);
            if (res && (res.status === 404 || res.status === 410)) await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
          }),
        );
      }
    }
  } catch (e) {
    console.error("Push failed", e);
  }
}
