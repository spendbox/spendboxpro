// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { decideMatch, namesMatch, parseNarration, senderKey, type MemberCandidate } from "./match.ts";

test("reads the sender from common bank narrations", () => {
  const cases: [string, string | null][] = [
    ["NIP/ADEBAYO TOLULOPE G/GTB/Rice and stew", "ADEBAYO TOLULOPE G"],
    ["TRANSFER FROM ADEBAYO TOLULOPE TO MAMA PUT LTD", "ADEBAYO TOLULOPE"],
    ["MOB TRF FRM JOHN DOE 0123456789 REF:1234", "JOHN DOE"],
    ["NIP CR/MOB/CHIOMA OKAFOR/UBA/090405231001", "CHIOMA OKAFOR"],
    ["Transfer from Mr. Emeka Obi", "EMEKA OBI"],
    ["FIP:ZIB/IBRAHIM MUSA/Payment for shoes", "IBRAHIM MUSA"],
    ["Opay Transfer - Kemi Adeyemi", "KEMI ADEYEMI"],
    ["TRF FROM MAMA PUT LTD", "MAMA PUT"],
    ["NIP CR/GTB TRANSFER/APP", null],
    ["POS SETTLEMENT 2039434", null],
    ["Reversal 23928392", null],
  ];
  for (const [narration, name] of cases) {
    assert.equal(parseNarration(narration).name, name, narration);
  }
});

test("picks up the sender's account number, not the business's own", () => {
  assert.equal(parseNarration("TRF FRM JOHN DOE 0123456789", "9999999999").account, "0123456789");
  assert.equal(parseNarration("TRF FRM JOHN DOE TO 9999999999", "9999999999").account, null);
  assert.equal(parseNarration("NIP/JOHN DOE/0123456789/1111111111").account, null);
});

test("sender keys ignore order, titles and initials", () => {
  assert.equal(senderKey("ADEBAYO TOLULOPE G"), "ADEBAYO TOLULOPE");
  assert.equal(senderKey("Mrs Tolulope Adebayo"), "ADEBAYO TOLULOPE");
  assert.equal(senderKey("ADEBAYO"), null);
  assert.equal(senderKey("MAMA PUT LTD"), "MAMA PUT");
});

test("matches profile names to bank names", () => {
  assert.ok(namesMatch("Tolu Adebayo", "ADEBAYO TOLULOPE GRACE"));
  assert.ok(namesMatch("Adebayo Tolulope Grace", "ADEBAYO TOLULOPE"));
  assert.ok(namesMatch("Chioma Okafor", "OKAFOR CHIOMA N"));
  assert.ok(!namesMatch("Chioma Okafor", "OKAFOR EMEKA"));
  assert.ok(!namesMatch("Tolu", "TOLULOPE ADEBAYO"), "one word is not enough");
  assert.ok(!namesMatch("Tolu Ade", "TOLULOPE ADEBAYO"), "two shortened words are not enough");
  assert.ok(!namesMatch(null, "TOLULOPE ADEBAYO"));
});

const now = "2026-10-02T12:00:00.000Z";
const member = (id: string, fullName: string | null, payers: MemberCandidate["payers"] = []): MemberCandidate => ({
  membershipId: id,
  joinedAt: "2026-09-01T00:00:00.000Z",
  fullName,
  payers,
});
const pay = (senderName: string | null, extra: Partial<{ senderAccount: string; amount: number; paidAt: string }> = {}) => ({
  amount: extra.amount ?? 5000,
  paidAt: extra.paidAt ?? now,
  senderName,
  senderKey: senderKey(senderName),
  senderAccount: extra.senderAccount ?? null,
});

test("a recognised sender counts for that member", () => {
  const members = [member("a", null, [{ senderKey: "ADEBAYO TOLULOPE", senderAccount: null, senderName: "ADEBAYO TOLULOPE" }]), member("b", "Ada Obi")];
  assert.deepEqual(decideMatch(pay("TOLULOPE ADEBAYO"), members, []), { kind: "member", membershipId: "a", method: "payer" });
});

test("a recognised account number wins even if the name is written differently", () => {
  const members = [member("a", null, [{ senderKey: null, senderAccount: "0123456789", senderName: "ADEBAYO TOLULOPE" }])];
  assert.deepEqual(decideMatch(pay("ADEBAYO TOLULOPE G", { senderAccount: "0123456789" }), members, []), {
    kind: "member",
    membershipId: "a",
    method: "payer",
  });
});

test("matches by profile name the first time", () => {
  const members = [member("a", "Tolu Adebayo"), member("b", "Ada Obi")];
  assert.deepEqual(decideMatch(pay("ADEBAYO TOLULOPE"), members, []), { kind: "member", membershipId: "a", method: "name" });
});

test("two members who look the same are left for the business", () => {
  const members = [member("a", "John Okafor"), member("b", "John Okafor")];
  assert.deepEqual(decideMatch(pay("OKAFOR JOHN"), members, []), { kind: "none", reason: "ambiguous" });
});

test("a name learned for one member isn't used when another member has the same name", () => {
  const learned = { senderKey: "JOHN OKAFOR", senderAccount: null, senderName: "OKAFOR JOHN" };
  const members = [member("a", "John Okafor", [learned]), member("b", "John Okafor")];
  assert.deepEqual(decideMatch(pay("OKAFOR JOHN"), members, []), { kind: "none", reason: "ambiguous" });
  // An account number still tells them apart.
  const withAccount = [member("a", "John Okafor", [{ ...learned, senderAccount: "1111111111" }]), member("b", "John Okafor", [{ senderKey: null, senderAccount: "2222222222", senderName: "OKAFOR JOHN" }])];
  assert.deepEqual(decideMatch(pay("OKAFOR JOHN", { senderAccount: "2222222222" }), withAccount, []), { kind: "member", membershipId: "b", method: "payer" });
});

test("strangers are left for the business", () => {
  assert.deepEqual(decideMatch(pay("SOMEONE ELSE"), [member("a", "Ada Obi")], []), { kind: "none", reason: "unknown" });
});

test("payments well before someone joined don't count for them", () => {
  const late = { ...member("a", "Tolu Adebayo"), joinedAt: "2026-10-03T12:00:00.000Z" };
  assert.equal(decideMatch(pay("ADEBAYO TOLULOPE"), [late], []).kind, "none");
  const justAfter = { ...member("a", "Tolu Adebayo"), joinedAt: "2026-10-02T12:20:00.000Z" };
  assert.equal(decideMatch(pay("ADEBAYO TOLULOPE"), [justAfter], []).kind, "member");
});

test("links to a purchase the business already typed in", () => {
  const members = [member("a", "Ada Obi"), member("b", null)];
  const recorded = [{ id: "p1", membershipId: "b", amount: 5000, paidAt: "2026-10-02T11:30:00.000Z" }];
  assert.deepEqual(decideMatch(pay("STRANGER NAME"), members, recorded), { kind: "recorded", membershipId: "b", purchaseId: "p1" });
  // A known member's typed-in purchase is linked, not doubled.
  assert.deepEqual(decideMatch(pay("ADA OBI"), [member("a", "Ada Obi")], [{ ...recorded[0], membershipId: "a" }]), {
    kind: "member",
    membershipId: "a",
    method: "name",
    purchaseId: "p1",
  });
  // Different amount or hours apart: not the same purchase.
  assert.equal(decideMatch(pay("STRANGER NAME", { amount: 4000 }), members, recorded).kind, "none");
  assert.equal(decideMatch(pay("STRANGER NAME", { paidAt: "2026-10-02T18:00:00.000Z" }), members, recorded).kind, "none");
  // Bank gave only the day.
  assert.equal(decideMatch(pay("STRANGER NAME", { paidAt: "2026-10-02T00:00:00.000Z" }), members, recorded).kind, "recorded");
});

test("a sender the business said is someone else isn't matched to them again", () => {
  const members = [{ ...member("a", "Tolu Adebayo"), notSenders: ["ADEBAYO TOLULOPE"] }];
  assert.deepEqual(decideMatch(pay("ADEBAYO TOLULOPE"), members, []), { kind: "none", reason: "unknown" });
});
