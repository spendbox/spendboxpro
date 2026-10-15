// Password rules for signing up. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { passwordProblem, passwordScore } from "../password.ts";

test("easy passwords are refused, with a reason", () => {
  for (const pw of ["short1", "password1", "12345678", "aaaaaaaaaa", "qwerty123456", "Lagos2024", "ilovelagos", "Password1!"]) {
    assert.ok(passwordProblem(pw), pw);
  }
  assert.match(passwordProblem("adaobi_rocks99", { email: "adaobi@x.com" }) ?? "", /email/);
  assert.match(passwordProblem("NightOwl#77zz", { name: "NightOwl" }) ?? "", /name/);
  assert.match(passwordProblem(" spaced-out-password ") ?? "", /spaces/);
  assert.match(passwordProblem("x".repeat(80)) ?? "", /too long/);
});

test("good passwords pass, and the meter climbs with them", () => {
  for (const pw of ["jollof-rice-on-sunday", "Tr0ub4dor&3", "kQ9#vLp2!xZ", "Ikoyi#Bridge77"]) assert.equal(passwordProblem(pw), null, pw);
  assert.ok(passwordScore("kQ9#vLp2!xZ") > passwordScore("Lagos2024"));
  assert.equal(passwordScore("correct horse battery staple"), 4);
});
