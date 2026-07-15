import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("builds the Lumos Health clinical workspace", async () => {
  const [page, app, layout, css] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/LumosHealthApp.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    access(new URL("dist/server/index.js", root)),
  ]);

  assert.match(page, /Atendimento \| Lumos Health/);
  assert.match(app, /Maria das Dores Silva/);
  assert.match(app, /Converse\. A Lumos organiza\./);
  assert.match(app, /UBS Jardim Esperança/);
  assert.match(app, /Ctrl Space/);
  assert.match(css, /--teal:\s*#0d6c68/);
  assert.doesNotMatch(`${page}\n${layout}`, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("exposes PWA and OpenAI structured-output integration", async () => {
  const [layout, manifest, serviceWorker, structureRoute] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("public/manifest.webmanifest", root), "utf8"),
    readFile(new URL("public/sw.js", root), "utf8"),
    readFile(new URL("app/api/structure/route.ts", root), "utf8"),
  ]);

  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.equal(JSON.parse(manifest).lang, "pt-BR");
  assert.match(serviceWorker, /lumos-health-shell-v1/);
  assert.match(structureRoute, /api\.openai\.com\/v1\/responses/);
  assert.match(structureRoute, /type:\s*"json_schema"/);
  assert.doesNotMatch(structureRoute, /anthropic|claude/i);
});
