import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const src = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("record route denies requests before database access", async () => {
  const code = await src("app/api/records/route.ts");
  assert.match(code, /isLocalDemoRequest\(request\)/);
  assert.match(code, /demoApiDeniedResponse\(\)/);
  assert.ok(code.indexOf("if (!isLocalDemoRequest(request))") < code.indexOf("await ensureDemoContext()"));
  assert.match(code, /signedAt:\s*null/);
  assert.doesNotMatch(code, /db\.insert\((?:prescriptions|examRequests)\)/);
});

test("external AI and voice token endpoints also require the local gate", async () => {
  for (const path of ["app/api/structure/route.ts", "app/api/deepgram/token/route.ts"]) {
    const code = await src(path);
    assert.match(code, /if \(!isLocalDemoRequest\(request\)\) return demoApiDeniedResponse\(\);/);
  }
});

test("browser does not store clinical transcripts in localStorage", async () => {
  const code = await src("app/LumosHealthApp.tsx");
  assert.doesNotMatch(code, /localStorage\.(?:setItem|removeItem)\(/);
  assert.match(code, /DEMONSTRAÇÃO EXPERIMENTAL/);
  assert.doesNotMatch(code, /Ambiente seguro e auditado/);
});

test("backend protects clinical model calls and disables anonymous websockets", async () => {
  const code = await src("server/src/index.mjs");
  assert.match(code, /app\.post\("\/clinical\/structure", requireClinician/);
  assert.match(code, /await jwtVerify\(/);
  assert.match(code, /server\.on\("upgrade", \(_request, socket\)/);
  assert.match(code, /socket\.destroy\(\);/);
});
