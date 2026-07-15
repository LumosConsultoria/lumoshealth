import { NextRequest, NextResponse } from "next/server";

const EMPTY_RECORD = {
  queixa_principal: null,
  hda: null,
  exame_fisico: null,
  cid10_sugerido: null,
  diagnostico_sugerido: null,
  conduta: null,
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

function outputText(result: { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  for (const item of result.output ?? []) {
    const content = item.content?.find((part) => part.type === "output_text");
    if (content?.text) return content.text;
  }
  return "";
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { transcript?: string; category?: string };
  if (!body.transcript?.trim()) {
    return NextResponse.json({ error: "A transcrição é obrigatória." }, { status: 400 });
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
          content: "Você é o copiloto clínico da Lumos Health. A entrada é uma conversa parcial ou completa entre Médico e Paciente. Atualize o registro com somente informações explicitamente presentes, em português do Brasil. Não invente dados e não trate perguntas do médico como respostas do paciente. Não faça diagnóstico definitivo; o CID é apenas uma sugestão para revisão profissional. Use null quando um dado estiver ausente.",
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
