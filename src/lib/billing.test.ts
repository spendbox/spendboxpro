import assert from "node:assert/strict";
import { test } from "node:test";
import { billingState, GRACE_DAYS } from "./billing.ts";

const DAY = 86_400_000;
const now = Date.parse("2026-10-10T12:00:00Z");
const iso = (days: number) => new Date(now + days * DAY).toISOString();

test("a new business is on its free trial with everything Plus has", () => {
  const s = billingState({ created_at: iso(-1), trial_ends_at: iso(13) }, now);
  assert.equal(s.status, "trial");
  assert.equal(s.daysLeft, 13);
  assert.equal(s.partnerRequests, true);
});

test("after the trial, payment is due, and it's paused 14 days later", () => {
  const s = billingState({ created_at: iso(-20), trial_ends_at: iso(-6) }, now);
  assert.equal(s.status, "due");
  assert.equal(s.suspendOn.toISOString(), iso(-6 + GRACE_DAYS));
});

test("only Plus sees requests from partners' customers", () => {
  assert.equal(billingState({ created_at: iso(-40), trial_ends_at: iso(-26), paid_until: iso(4), plan: "starter" }, now).partnerRequests, false);
  const plus = billingState({ created_at: iso(-40), trial_ends_at: iso(-26), paid_until: iso(4), plan: "plus" }, now);
  assert.equal(plus.status, "active");
  assert.equal(plus.partnerRequests, true);
  assert.equal(billingState({ created_at: iso(-20), trial_ends_at: iso(-6), plan: "plus" }, now).partnerRequests, false);
});

test("paused for not paying, or by an admin", () => {
  assert.equal(billingState({ created_at: iso(-60), trial_ends_at: iso(-46), suspended_at: iso(-1), suspended_reason: "billing" }, now).status, "suspended");
  const admin = billingState({ created_at: iso(-1), trial_ends_at: iso(13), suspended_at: iso(0), suspended_reason: "admin" }, now);
  assert.equal(admin.status, "trial");
  assert.ok(admin.adminPaused);
});
