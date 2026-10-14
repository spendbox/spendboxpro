// Tests for locations sent in chat (docs/CHAT.md). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { locationBody, locationIn, withoutTag } from "../chat-location.ts";

test("a location goes into a message and comes back out", () => {
  const body = locationBody("Ada House, Yaba", "lagos", 12.4, -40.6);
  assert.equal(body, "📍 Ada House, Yaba [[at:lagos:12,-41]]");
  assert.deepEqual(locationIn(body), { region: "lagos", x: 12, z: -41, label: "Ada House, Yaba" });
  assert.equal(withoutTag(body), "📍 Ada House, Yaba");
});

test("ordinary messages aren't locations, and a name can't fake a tag", () => {
  assert.equal(locationIn("see you at [[the market]]"), null);
  assert.equal(locationIn(null), null);
  assert.equal(locationIn("[[at:lagos:1,2]] at the start isn't one either"), null);
  const sneaky = locationBody("Nice [[at:lagos:999,999]] place", "lagos", 3, 4);
  assert.deepEqual(locationIn(sneaky), { region: "lagos", x: 3, z: 4, label: "Nice at:lagos:999,999 place" });
});
