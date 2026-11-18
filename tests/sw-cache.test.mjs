import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function listeners() {
  const handlers = {};
  const code = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const sandbox = {
    self: {
      location: { origin: "http://localhost:3000" },
      addEventListener: (kind, handler) => { handlers[kind] = handler; },
      skipWaiting: () => undefined,
      clients: { claim: () => undefined },
    },
    caches: { open: async () => ({ addAll: async () => undefined, put: async () => undefined }),
              match: async () => undefined, keys: async () => [] },
    fetch: async () => new Response("public shell"),
    URL, Request, Response, Promise,
  };
  vm.runInNewContext(code, sandbox);
  return handlers;
}

test("service worker never intercepts clinical API, auth or third-party GET requests", async () => {
  const { fetch: handle } = await listeners();
  for (const url of [
    "http://localhost:3000/api/records",
    "http://localhost:3000/api/structure",
    "http://localhost:3000/api/deepgram/token",
    "http://localhost:3000/auth/login",
    "http://localhost:3000/?patient=123",
    "https://third-party.example/",
  ]) {
    let intercepted = false;
    handle({ request: new Request(url), respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, url);
  }
});

test("service worker caches only explicitly allowlisted public shell resources", async () => {
  const { fetch: handle } = await listeners();
  for (const path of ["/", "/manifest.webmanifest"]) {
    let responsePromise;
    handle({
      request: new Request("http://localhost:3000" + path),
      respondWith: (promise) => { responsePromise = promise; },
      waitUntil: () => undefined,
    });
    assert.ok(responsePromise, path);
    assert.equal((await responsePromise).status, 200);
  }
});
