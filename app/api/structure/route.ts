import { demoApiDeniedResponse, isLocalDemoRequest, MAX_DEMO_TRANSCRIPT } from "../../../lib/demo-security.mjs";
import { NextRequest, NextResponse } from "next/server";

const EMPTY_RECORD = {
  queixa_principal: null,
  hda: null,
  exame_fisico: null,
  cid10_sugerido: null,
  diagnostico_sugerido: null,
  conduta: null,
  exames_sugeridos: [],
  medicamentos_sugeridos: [],
};

const nullableString = { type: ["string", "null"] };
const schemas: Record<string, { fields: string[]; schema: Record<string, unknown> }> = {
  medico: {
    fields: ["queixa_principal", "hda", "exame_fisico", "cid10_sugerido", "diagnostico_sugerido", "conduta"],
    schema: {},
  },
  enfermeiro: {
    fields: ["motivo_procura", "sinais_vitais", "evolucao", "intervencoes_sae"],
    schema: {},
  },
  tecnico_enfermagem: {
    fields: ["motivo_procura", "sinais_vitais", "procedimentos", "observacoes"],
    schema: {},
  },
};

for (const definition of Object.values(schemas)) {
  definition.schema = {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(definition.fields.map((field) => [field, nullableString])),
    required: definition.fields,
  };
}

schemas.medico.schema = {
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
      items: {
        type: "object",
        additionalProperties: false,
        properties: { nome: { type: "string" }, justificativa: { type: "string" } },
        required: ["nome", "justificativa"],
      },
    },
    medicamentos_sugeridos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nome: { type: "string" },
          dose: nullableString,
          via: nullableString,
          frequencia: nullableString,
          duracao: nullableString,
          instrucoes: nullableString,
        },
        required: ["nome", "dose", "via", "frequencia", "duracao", "instrucoes"],
      },
    },
  },
  required: ["queixa_principal", "hda", "exame_fisico", "cid10_sugerido", "diagnostico_sugerido", "conduta", "exames_sugeridos", "medicamentos_sugeridos"],
};

function outputText(result: { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  for (const item of result.output ?? []) {
    const content = item.content?.find((part) => part.type === "output_text");
    if (content?.text) return content.text;
  }
  return "";
}

export async function POST(request: NextRequest) {
  if (!isLocalDemoRequest(request)) return demoApiDeniedResponse();
  let body: { transcript?: string; category?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (typeof body?.transcript !== "string" || !body.transcript.trim()
      || body.transcript.length > MAX_DEMO_TRANSCRIPT) {
    return NextResponse.json({ error: "Transcrição inválida ou longa demais." }, { status: 400 });
  }
  if (body.category && !Object.hasOwn(schemas, body.category)) {
    return NextResponse.json({ error: "Categoria profissional inválida." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ data: EMPTY_RECORD, mode: "unavailable" });
  }

  const category = body.category ?? "medico";
  const definition = schemas[category] ?? schemas.medico;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
      store: false,
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content: "Você é o copiloto clínico da Lumos Health. A entrada é uma conversa parcial ou completa entre Médico e Paciente. Extraia fatos somente quando estiverem explícitos e nunca trate perguntas como respostas. A conduta e os exames_sugeridos podem ser sugestões clínicas prudentes baseadas no contexto, sempre sujeitas à aprovação médica. Preencha medicamentos_sugeridos somente quando o médico tiver prescrito, renovado, mantido com intenção prescritiva ou alterado um medicamento na conversa; nunca transforme apenas o relato de uso do paciente em receita. Não faça diagnóstico definitivo; o CID é apenas sugestão. Use null quando um texto estiver ausente e arrays vazios quando não houver exames ou medicamentos.",
        },
        { role: "user", content: body.transcript },
      ],
      text: {
        format: {
          type: "json_schema",
          name: `registro_clinico_${category}`,
          strict: true,
          schema: definition.schema,
        },
      },
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ data: EMPTY_RECORD, mode: "unavailable" });
  }

  const result = (await response.json()) as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  try {
    return NextResponse.json({ data: JSON.parse(outputText(result)), mode: "openai" });
  } catch {
    return NextResponse.json({ data: EMPTY_RECORD, mode: "unavailable" });
  }
}
