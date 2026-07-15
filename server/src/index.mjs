import "dotenv/config";
import { createServer } from "node:http";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { SignJWT } from "jose";
import pg from "pg";
import { createClient } from "redis";
import { WebSocket, WebSocketServer } from "ws";

const { Pool } = pg;
const port = Number(process.env.PORT ?? 4000);
const app = express();
const server = createServer(app);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", (error) => console.error("redis", error.message));
redis.connect().catch(() => undefined);

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json({ limit: "1mb" }));

function secret() {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? "development-only-change-me");
}

async function issueToken(professional) {
  return new SignJWT({
    tenant_id: professional.tenant_id,
    unit_id: professional.unit_id,
    category: professional.category,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(professional.id)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
}

app.get("/health", async (_request, response) => {
  let database = "unavailable";
  try {
    await pool.query("select 1");
    database = "ok";
  } catch {}
  response.json({ status: "ok", database, deepgram: Boolean(process.env.DEEPGRAM_API_KEY) });
});

app.post("/auth/login", async (request, response) => {
  const { cpf, password, category } = request.body ?? {};
  if (!cpf || !password || !category) {
    return response.status(400).json({ error: "CPF, senha e categoria são obrigatórios." });
  }

  const result = await pool.query(
    `select id, tenant_id, unit_id, name, password_hash, category, council_type, council_number
       from professionals where cpf = $1 and category = $2 and active = true limit 1`,
    [String(cpf).replace(/\D/g, ""), category],
  );
  const professional = result.rows[0];
  if (!professional || !(await bcrypt.compare(password, professional.password_hash))) {
    return response.status(401).json({ error: "Credenciais inválidas." });
  }

  await pool.query(
    `insert into access_logs (id, tenant_id, professional_id, action, resource_type)
     values ($1, $2, $3, 'login', 'session')`,
    [crypto.randomUUID(), professional.tenant_id, professional.id],
  );

  response.json({ token: await issueToken(professional), professional: { ...professional, password_hash: undefined } });
});

const categoryInstructions = {
  medico: ["queixa_principal", "hda", "exame_fisico", "cid10_sugerido", "diagnostico_sugerido", "conduta"],
  enfermeiro: ["motivo_procura", "sinais_vitais", "evolucao", "intervencoes_sae"],
  tecnico_enfermagem: ["motivo_procura", "sinais_vitais", "procedimentos", "observacoes"],
};

async function structureTranscript(transcript, category = "medico") {
  if (!process.env.OPENAI_API_KEY) {
    return { raw_transcript: transcript, pending_structure: true };
  }

  const fields = categoryInstructions[category] ?? categoryInstructions.medico;
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(fields.map((field) => [field, { type: ["string", "null"] }])),
    required: fields,
  };
  const result = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
      store: false,
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content: "Você é o copiloto clínico da Lumos Health. Extraia somente informações presentes na transcrição em português do Brasil. Não faça diagnóstico definitivo; o CID é apenas sugestão para revisão profissional. Use null quando ausente.",
        },
        { role: "user", content: transcript },
      ],
      text: {
        format: {
          type: "json_schema",
          name: `registro_clinico_${category}`,
          strict: true,
          schema,
        },
      },
    }),
  });
  if (!result.ok) throw new Error(`OpenAI respondeu ${result.status}`);
  const body = await result.json();
  const text = body.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;
  return JSON.parse(text ?? "{}");
}

app.post("/clinical/structure", async (request, response) => {
  const { transcript, category } = request.body ?? {};
  if (!transcript) return response.status(400).json({ error: "Transcrição obrigatória." });
  try {
    response.json({ data: await structureTranscript(transcript, category) });
  } catch (error) {
    response.status(502).json({ error: error.message, fallback: { raw_transcript: transcript } });
  }
});

const voiceServer = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname !== "/voice/stream") return socket.destroy();
  voiceServer.handleUpgrade(request, socket, head, (client) => voiceServer.emit("connection", client, request));
});

voiceServer.on("connection", (client, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const category = url.searchParams.get("category") ?? "medico";
  if (!process.env.DEEPGRAM_API_KEY) {
    client.send(JSON.stringify({ type: "error", recoverable: true, message: "Transcrição indisponível. Use texto livre." }));
    return client.close();
  }

  const params = new URLSearchParams({
    model: "nova-3",
    language: "pt-BR",
    smart_format: "true",
    punctuate: "true",
    interim_results: "true",
    endpointing: "300",
    encoding: "opus",
  });
  const deepgram = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, {
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
  });
  let finalTranscript = "";

  deepgram.addEventListener("open", () => client.send(JSON.stringify({ type: "ready" })));
  deepgram.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data.toString());
    const text = payload.channel?.alternatives?.[0]?.transcript ?? "";
    if (payload.is_final && text) finalTranscript += `${text} `;
    if (text && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "transcript", text, final: Boolean(payload.is_final) }));
    }
  });
  deepgram.addEventListener("error", () => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "error", recoverable: true, message: "Conexão de voz interrompida." }));
  });

  client.on("message", (audio) => {
    if (deepgram.readyState === WebSocket.OPEN) deepgram.send(audio);
  });
  client.on("close", async () => {
    if (deepgram.readyState === WebSocket.OPEN) deepgram.close(1000, "client-complete");
    if (!finalTranscript.trim()) return;
    const jobId = crypto.randomUUID();
    await redis.lPush("clinical-structure-jobs", JSON.stringify({ jobId, category, transcript: finalTranscript })).catch(() => undefined);
  });
});

server.listen(port, () => console.log(`Lumos Health API on :${port}`));
