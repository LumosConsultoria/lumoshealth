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
  assert.match(app, /Atenda normalmente\. A Lumos acompanha\./);
  assert.match(app, /REGISTRO SENDO ESTRUTURADO/);
  assert.match(app, /NEXT_PUBLIC_VOICE_WS_URL/);
  assert.match(app, /UBS Jardim Esperança/);
  assert.match(app, /Ctrl Space/);
  assert.match(css, /--teal:\s*#0d6c68/);
  assert.doesNotMatch(`${page}\n${layout}`, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("exposes PWA and OpenAI structured-output integration", async () => {
  const [layout, manifest, serviceWorker, structureRoute, deepgramTokenRoute, voiceServer] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("public/manifest.webmanifest", root), "utf8"),
    readFile(new URL("public/sw.js", root), "utf8"),
    readFile(new URL("app/api/structure/route.ts", root), "utf8"),
    readFile(new URL("app/api/deepgram/token/route.ts", root), "utf8"),
    readFile(new URL("server/src/index.mjs", root), "utf8"),
  ]);

  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.equal(JSON.parse(manifest).lang, "pt-BR");
  assert.match(serviceWorker, /lumos-health-shell-v1/);
  assert.match(structureRoute, /api\.openai\.com\/v1\/responses/);
  assert.match(structureRoute, /type:\s*"json_schema"/);
  assert.doesNotMatch(structureRoute, /Cefaleia leve|Hipertensão arterial sistêmica/);
  assert.doesNotMatch(structureRoute, /anthropic|claude/i);
  assert.match(deepgramTokenRoute, /auth\/grant/);
  assert.match(deepgramTokenRoute, /ttl_seconds:\s*30/);
  assert.match(voiceServer, /diarize_model/);
  assert.match(voiceServer, /publishStructure/);
});
