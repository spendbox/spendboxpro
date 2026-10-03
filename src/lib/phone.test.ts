// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeWhatsapp } from "./phone.ts";

test("WhatsApp numbers get a country code however they're typed", () => {
  const cases: [string, string | null][] = [
    ["0703 123 4567", "2347031234567"],
    ["703 123 4567", "2347031234567"],
    ["7031234567", "2347031234567"],
    ["+234 703 123 4567", "2347031234567"],
    ["2347031234567", "2347031234567"],
    ["+234 0703 123 4567", "2347031234567"],
    ["+233 24 123 4567", "233241234567"],
    ["", null],
    ["not a number", null],
  ];
  for (const [input, want] of cases) assert.equal(normalizeWhatsapp(input, "234"), want, input);
});
