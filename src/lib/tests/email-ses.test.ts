// The SES request signing, against AWS's own published example (Signature Version 4 test suite,
// "get-vanilla"). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { sigV4 } from "../email-ses.ts";

test("requests to SES are signed the way AWS's own example is", () => {
  const auth = sigV4({
    method: "GET",
    path: "/",
    headers: { host: "example.amazonaws.com", "x-amz-date": "20150830T123600Z" },
    body: "",
    service: "service",
    region: "us-east-1",
    amzDate: "20150830T123600Z",
    accessKey: "AKIDEXAMPLE",
    secretKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  });
  assert.equal(
    auth,
    "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
  );
});
