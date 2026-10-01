// Run with: npm run test:match
import assert from "node:assert/strict";
import { test } from "node:test";
import { accountMatchScore, matchReceipt, nameMatchScore, type Candidate } from "./match.ts";

const mamaTee: Candidate = {
  membershipId: "m1",
  businessId: "b1",
  businessName: "Mama Tee's Kitchen",
  accounts: [
    { id: "a1", bank_name: "Moniepoint MFB", account_number: "6012344821", account_name: "MAMA TEE KITCHEN" },
    { id: "a2", bank_name: "GTBank", account_number: "0123456789", account_name: "ADEBOLA TEMITOPE" },
  ],
};
const kingz: Candidate = {
  membershipId: "m2",
  businessId: "b2",
  businessName: "Kingz Barbers",
  accounts: [{ id: "a3", bank_name: "Opay", account_number: "8099914821", account_name: "KINGSLEY OKORO" }],
};
const shoes: Candidate = { membershipId: "m3", businessId: "b3", businessName: "Ade Shoes", accounts: [] };
const candidates = [mamaTee, kingz, shoes];
const none = { recipient_account_number: null, recipient_name: null, recipient_bank: null, merchant_name: null };

test("full account numbers must match exactly", () => {
  assert.equal(accountMatchScore("6012344821", "6012344821"), 10);
  assert.equal(accountMatchScore("601 234 4821", "6012344821"), 10);
  assert.equal(accountMatchScore("6012344822", "6012344821"), 0);
});

test("masked account numbers match on the visible digits", () => {
  assert.equal(accountMatchScore("******4821", "6012344821"), 4);
  assert.equal(accountMatchScore("601****821", "6012344821"), 6);
  assert.equal(accountMatchScore("60XXXXXX21", "6012344821"), 4);
  assert.equal(accountMatchScore("•••• 4821", "6012344821"), 4);
  assert.equal(accountMatchScore("******4822", "6012344821"), 0);
  assert.equal(accountMatchScore("*******821", "6012344821"), 0, "3 visible digits is not enough");
});

test("names ignore case, punctuation and filler words", () => {
  assert.equal(nameMatchScore("MAMA TEE'S KITCHEN LTD", "Mama Tee's Kitchen"), 1);
  assert.equal(nameMatchScore("Kingz Barbers Enterprises", "kingz barbers"), 1);
  assert.equal(nameMatchScore("Ade Shoes", "Kingz Barbers"), 0);
});

test("a receipt is matched to the business that owns the account", () => {
  const m = matchReceipt(candidates, { ...none, recipient_account_number: "0123456789", recipient_name: "ADEBOLA TEMITOPE" });
  assert.equal(m?.candidate.businessId, "b1");
  assert.equal(m?.method, "account");
  assert.equal(m?.account?.id, "a2");
  assert.equal(m?.ambiguous, false);
});

test("two businesses ending in the same digits: the name decides", () => {
  const m = matchReceipt(candidates, { ...none, recipient_account_number: "******4821", recipient_name: "KINGSLEY OKORO" });
  assert.equal(m?.candidate.businessId, "b2");
  assert.equal(m?.ambiguous, false);
  const unsure = matchReceipt(candidates, { ...none, recipient_account_number: "******4821" });
  assert.equal(unsure?.ambiguous, true);
});

test("till receipts without an account match by shop name, for the business to confirm", () => {
  const m = matchReceipt(candidates, { ...none, merchant_name: "ADE SHOES LIMITED" });
  assert.equal(m?.candidate.businessId, "b3");
  assert.equal(m?.method, "name");
});

test("unknown recipients are not matched", () => {
  assert.equal(matchReceipt(candidates, { ...none, recipient_account_number: "2233445566", recipient_name: "JOHN DOE" }), null);
  assert.equal(matchReceipt(candidates, none), null);
});
