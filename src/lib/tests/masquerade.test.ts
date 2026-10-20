// Tests for Masquerade's questions and message rules. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { masqBlocked, masqQuestion, masqSpiceOf, MASQ_QUESTIONS, type MasqSpice } from "../masquerade.ts";

/** How many of the first few questions of many masquerades come at each heat. */
function heats(spice: MasqSpice) {
  const n = [0, 0, 0];
  for (let s = 1; s <= 400; s++) for (let k = 1; k <= 5; k++) n[masqQuestion(s, k, spice).heat]++;
  return n.map((x) => x / 2000);
}

test("The questions follow the average of both picks", () => {
  assert.equal(masqSpiceOf(0, 3), 2);
  assert.equal(masqSpiceOf(0, 1), 1);
  assert.equal(masqSpiceOf(0, 0), 0);
  assert.equal(masqSpiceOf(3, 3), 3);
  assert.deepEqual(heats(0), [1, 0, 0]);
  const one = heats(1);
  assert.ok(one[1] > 0.17 && one[1] < 0.33 && one[2] === 0, `a little: ${one}`);
  const two = heats(2);
  assert.ok(two[1] > 0.45 && two[1] < 0.65 && two[2] === 0, `spicy: ${two}`);
  const three = heats(3);
  assert.ok(three[2] > 0.35 && three[1] > 0.3 && three[0] < 0.25, `extra: ${three}`);
});

test("Questions are the same on both phones, and start easy unless you both want heat", () => {
  assert.deepEqual(masqQuestion(42, 3, 2), masqQuestion(42, 3, 2));
  for (let s = 1; s <= 200; s++) {
    assert.equal(masqQuestion(s, 0, 0).heat, 0);
    assert.equal(masqQuestion(s, 0, 1).heat, 0);
  }
});

test("Never the same question twice in a row", () => {
  for (let s = 1; s <= 300; s++) for (let n = 1; n <= 8; n++) assert.notEqual(masqQuestion(s, n, 3).text, masqQuestion(s, n - 1, 3).text);
});

test("Every question is in the list, with no repeats", () => {
  const texts = MASQ_QUESTIONS.map((q) => q.text);
  assert.equal(new Set(texts).size, texts.length);
  for (let s = 1; s <= 50; s++) assert.ok(texts.includes(masqQuestion(s, s % 4, 3).text));
});

test("Numbers, links and socials are kept off before unmasking", () => {
  assert.ok(masqBlocked("call me 0803 123 4567"));
  assert.ok(masqBlocked("08031234567"));
  assert.ok(masqBlocked("see www.mysite.com"));
  assert.ok(masqBlocked("follow me @lagosbabe"));
  assert.ok(masqBlocked("add me on insta"));
  assert.equal(masqBlocked("My mum's jollof, bottom of the pot 😂"), null);
  assert.equal(masqBlocked("I was born in 1998"), null);
});
