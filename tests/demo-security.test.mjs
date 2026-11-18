import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_HEADER,
  MAX_DEMO_TRANSCRIPT,
  demoApiDeniedResponse,
  isLocalDemoRequest,
} from "../lib/demo-security.mjs";

const environment = { NODE_ENV: "development", LUMOS_ENABLE_LOCAL_DEMO_API: "true" };

function request(url = "http://localhost:3000/api/structure", extraHeaders = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      [DEMO_HEADER]: "local-only",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      ...extraHeaders,
    },
  });
}

test("local demo requires an explicit opt-in; never enabled in production", () => {
  assert.equal(isLocalDemoRequest(request(), {}), false);
  assert.equal(isLocalDemoRequest(request(), { NODE_ENV: "production", LUMOS_ENABLE_LOCAL_DEMO_API: "true" }), false);
  assert.equal(isLocalDemoRequest(request(), environment), true);
});

test("rejects a missing custom header and all non-loopback hosts", () => {
  assert.equal(isLocalDemoRequest(request(undefined, { [DEMO_HEADER]: "" }), environment), false);
  assert.equal(isLocalDemoRequest(request("https://my-public-demo.example/api/structure"), environment), false);
});

test("rejects cross-origin browser calls and malformed origins", () => {
  assert.equal(isLocalDemoRequest(request(undefined, { origin: "https://evil.example" }), environment), false);
  assert.equal(isLocalDemoRequest(request(undefined, { origin: "not-a-url" }), environment), false);
  assert.equal(isLocalDemoRequest(request(undefined, { "sec-fetch-site": "cross-site" }), environment), false);
});

test("rejects a forged custom header without local-demo opt in", () => {
  assert.equal(isLocalDemoRequest(request(undefined, { [DEMO_HEADER]: "local-only" }),
    { NODE_ENV: "development" }), false);
});

test("denied responses never permit persistence", async () => {
  const response = demoApiDeniedResponse();
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match((await response.json()).error, /desabilitada/);
  assert.equal(MAX_DEMO_TRANSCRIPT, 12000);
});
