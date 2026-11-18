import "dotenv/config";
import { createServer } from "node:http";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { SignJWT, jwtVerify } from "jose";
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

function backendEnabled() {
  const configuredSecret = process.env.JWT_SECRET ?? "";
  return process.env.LUMOS_ENABLE_BACKEND_API === "true"
    && configuredSecret.length >= 32
    && !/development-only|replace-with|change-me/i.test(configuredSecret);
}

function secret() {
  if (!backendEnabled()) throw new Error("Backend authentication not configured");
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

async function requireClinician(request, response, next) {
  if (!backendEnabled()) {
    return response.status(503).json({ error: "API clínica desativada." });
  }

  const authorization = request.headers.authorization ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return response.status(401).json({ error: "Autenticação obrigatória." });
  }

  try {
    const { payload } = await jwtVerify(authorization.slice(7), secret(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || typeof payload.tenant_id !== "string"
      || typeof payload.category !== "string") {
      return response.status(401).json({ error: "Sessão inválida." });
    }
    request.clinician = payload;
    next();
  } catch {
    return response.status(401).json({ error: "Sessão inválida ou expirada." });
  }
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
  if (!backendEnabled()) {
    return response.status(503).json({ error: "Autenticação clínica desativada." });
  }
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
  let schema = {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(fields.map((field) => [field, { type: ["string", "null"] }])),
    required: fields,
  };
  if (category === "medico") {
    const nullableString = { type: ["string", "null"] };
    schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        queixa_principal: nullableString,
        hda: nullableString,
        exame_fisico: nullableString,
        cid10_sugerido: nullableString,
        diagnostico_sugerido: nullableString,
        conduta: nullableString,
        exames_sugeridos: {
          type: "array",
          items: { type: "object", additionalProperties: false, properties: { nome: { type: "string" }, justificativa: { type: "string" } }, required: ["nome", "justificativa"] },
        },
        medicamentos_sugeridos: {
          type: "array",
          items: { type: "object", additionalProperties: false, properties: { nome: { type: "string" }, dose: nullableString, via: nullableString, frequencia: nullableString, duracao: nullableString, instrucoes: nullableString }, required: ["nome", "dose", "via", "frequencia", "duracao", "instrucoes"] },
        },
      },
      required: [...fields, "exames_sugeridos", "medicamentos_sugeridos"],
    };
  }
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
          content: "Você é o copiloto clínico da Lumos Health. A entrada é uma conversa parcial ou completa entre Médico e Paciente. Extraia fatos somente quando explícitos e nunca trate perguntas como respostas. A conduta e os exames_sugeridos podem ser sugestões prudentes para aprovação médica. Preencha medicamentos_sugeridos somente quando o médico tiver prescrito, renovado, mantido com intenção prescritiva ou alterado um medicamento na conversa; relato de uso do paciente não é receita. Não faça diagnóstico definitivo. Use null para textos ausentes e arrays vazios quando não houver exames ou medicamentos.",
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

app.post("/clinical/structure", requireClinician, async (request, response) => {
  const { transcript } = request.body ?? {};
  if (typeof transcript !== "string" || !transcript.trim() || transcript.length > 12000) {
    return response.status(400).json({ error: "Transcrição inválida ou longa demais." });
  }
  const category = request.clinician.category === "tecnico"
    ? "tecnico_enfermagem" : request.clinician.category;
  try {
    response.json({ data: await structureTranscript(transcript, category) });
  } catch {
    response.status(502).json({ error: "Falha ao estruturar transcrição." });
  }
});

const voiceServer = new WebSocketServer({ noServer: true });

// Fail closed: an authenticated, CSRF-resistant voice WebSocket handshake is
// not implemented. Keep this proxy unreachable until that boundary is tested.
server.on("upgrade", (_request, socket) => {
  socket.destroy();
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
    endpointing: "450",
    utterances: "true",
    vad_events: "true",
    diarize_model: "latest",
  });
  const deepgram = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, {
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
  });
  const finalSegments = [];
  let structureTimer;
  let structureBusy = false;
  let structurePending = false;
  let structureRevision = 0;

  const sendClient = (message) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
  };

  const roleForSpeaker = (speaker) => Number(speaker ?? 0) === 0 ? "medico" : "paciente";
  const transcriptForStructure = () => finalSegments
    .map((segment) => `${segment.speaker === "medico" ? "Médico" : "Paciente"}: ${segment.text}`)
    .join("\n");

  async function publishStructure() {
    const transcript = transcriptForStructure();
    if (transcript.length < 45) return;
    if (structureBusy) {
      structurePending = true;
      return;
    }
    structureBusy = true;
    structurePending = false;
    try {
      const data = await structureTranscript(transcript, category);
      structureRevision += 1;
      sendClient({ type: "structure", data, revision: structureRevision });
    } catch (error) {
      sendClient({ type: "structure_error", recoverable: true, message: error.message });
    } finally {
      structureBusy = false;
      if (structurePending) {
        structureTimer = setTimeout(publishStructure, 250);
      }
    }
  }

  function scheduleStructure(delay = 1200) {
    clearTimeout(structureTimer);
    structureTimer = setTimeout(publishStructure, delay);
  }

  function segmentsFromAlternative(alternative, fallbackText) {
    const words = alternative?.words ?? [];
    if (!words.length) return fallbackText ? [{ speaker: "medico", text: fallbackText }] : [];
    const grouped = [];
    for (const word of words) {
      const speaker = roleForSpeaker(word.speaker);
      const text = word.punctuated_word ?? word.word ?? "";
      const last = grouped.at(-1);
      if (!last || last.speaker !== speaker) grouped.push({ speaker, words: [text] });
      else last.words.push(text);
    }
    return grouped.map((group) => ({ speaker: group.speaker, text: group.words.filter(Boolean).join(" ") }));
  }

  deepgram.addEventListener("open", () => sendClient({ type: "ready", diarization: true }));
  deepgram.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data.toString());
    } catch {
      return;
    }
    const alternative = payload.channel?.alternatives?.[0];
    const text = alternative?.transcript ?? "";
    if (!text) return;
    const speakerSegments = segmentsFromAlternative(alternative, text);
    for (const [index, segment] of speakerSegments.entries()) {
      const normalized = { ...segment, text: segment.text.trim() };
      if (!normalized.text) continue;
      const id = `${payload.start ?? Date.now()}-${index}-${normalized.speaker}`;
      if (payload.is_final) finalSegments.push({ id, ...normalized });
      sendClient({ type: "transcript", id, ...normalized, final: Boolean(payload.is_final), speechFinal: Boolean(payload.speech_final) });
    }
    if (payload.is_final) scheduleStructure(payload.speech_final ? 500 : 1200);
  });
  deepgram.addEventListener("error", () => {
    sendClient({ type: "error", recoverable: true, message: "Conexão de voz interrompida." });
  });

  client.on("message", (audio, isBinary) => {
    if (!isBinary) {
      try {
        const command = JSON.parse(audio.toString());
        if (command.type === "finalize" && deepgram.readyState === WebSocket.OPEN) {
          deepgram.send(JSON.stringify({ type: "Finalize" }));
          scheduleStructure(150);
        }
      } catch {}
      return;
    }
    if (deepgram.readyState === WebSocket.OPEN) deepgram.send(audio);
  });
  client.on("close", async () => {
    clearTimeout(structureTimer);
    if (deepgram.readyState === WebSocket.OPEN) deepgram.close(1000, "client-complete");
    const finalTranscript = transcriptForStructure();
    if (!finalTranscript.trim()) return;
    const jobId = crypto.randomUUID();
    await redis.lPush("clinical-structure-jobs", JSON.stringify({ jobId, category, transcript: finalTranscript })).catch(() => undefined);
  });
});

server.listen(port, () => console.log(`Lumos Health API on :${port}`));
