import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  clinicalRecords,
  encounters,
  patients,
  professionals,
  tenants,
  units,
} from "../../../db/schema";
import {
  demoApiDeniedResponse,
  isLocalDemoRequest,
  MAX_DEMO_TRANSCRIPT,
} from "../../../lib/demo-security.mjs";

/**
 * LOCAL SYNTHETIC DEMO ONLY. This route is disabled by default, and always
 * disabled in production. It never issues prescriptions, exam orders or
 * clinically signed records. Do not extend it for real patient data.
 */
export const runtime = "nodejs";

const demo = {
  tenantId: "demo-tenant-lumos",
  unitId: "demo-unit-jardim-esperanca",
  patientId: "demo-patient-maria",
  professionalId: "demo-professional-ana",
  encounterId: "demo-encounter-current",
};

async function ensureDemoContext() {
  const db = getDb();
  await db.insert(tenants).values({
    id: demo.tenantId, name: "Lumos Saúde Municipal (fictício)", slug: "lumos-demo",
  }).onConflictDoNothing();
  await db.insert(units).values({
    id: demo.unitId, tenantId: demo.tenantId, name: "UBS Jardim Esperança (fictícia)",
    cnes: "0000001", type: "UBS",
  }).onConflictDoNothing();
  await db.insert(patients).values({
    id: demo.patientId, tenantId: demo.tenantId, cns: "702508623840001",
    name: "Maria das Dores Silva (fictícia)", cpf: "00000000000",
    birthDate: "1968-02-14", sex: "F",
  }).onConflictDoNothing();
  await db.insert(professionals).values({
    id: demo.professionalId, tenantId: demo.tenantId, unitId: demo.unitId,
    name: "Ana Lima (fictícia)", cpf: "12345678900", passwordHash: "no-login-demo",
    councilType: "CRM", councilNumber: "00000", category: "medico", specialty: "Clínica geral",
  }).onConflictDoNothing();
  await db.insert(encounters).values({
    id: demo.encounterId, tenantId: demo.tenantId, patientId: demo.patientId,
    unitId: demo.unitId, startedAt: new Date().toISOString(),
    type: "consulta", status: "em_atendimento",
  }).onConflictDoNothing();
  return db;
}

export async function GET(request: Request) {
  if (!isLocalDemoRequest(request)) return demoApiDeniedResponse();

  try {
    const db = await ensureDemoContext();
    const records = await db.select().from(clinicalRecords)
      .where(and(
        eq(clinicalRecords.tenantId, demo.tenantId),
        eq(clinicalRecords.encounterId, demo.encounterId),
      ))
      .orderBy(desc(clinicalRecords.createdAt))
      .limit(20);
    return Response.json(
      { records, mode: "local-demo", signed: false },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Falha ao carregar dados de demonstração." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isLocalDemoRequest(request)) return demoApiDeniedResponse();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return Response.json({ error: "Objeto de demonstração obrigatório." }, { status: 400 });
  }
  const input = payload as Record<string, unknown>;
  const transcript = input.transcript;
  if (typeof transcript !== "string" || !transcript.trim()
      || transcript.length > MAX_DEMO_TRANSCRIPT) {
    return Response.json({ error: "Transcrição inválida ou longa demais." }, { status: 400 });
  }

  const structuredData = input.structuredData;
  if (!structuredData || typeof structuredData !== "object" || Array.isArray(structuredData)) {
    return Response.json({ error: "Dados estruturados inválidos." }, { status: 400 });
  }
  if (JSON.stringify(structuredData).length > 20000) {
    return Response.json({ error: "Dados de demonstração longos demais." }, { status: 413 });
  }

  try {
    const db = await ensureDemoContext();
    const [record] = await db.insert(clinicalRecords).values({
      id: crypto.randomUUID(),
      tenantId: demo.tenantId,
      encounterId: demo.encounterId,
      professionalId: demo.professionalId,
      category: "consulta_medica",
      rawTranscript: transcript,
      structuredData: {
        ...(structuredData as Record<string, unknown>),
        status: "draft",
        approvalStatus: "not_clinically_signed",
      },
      signedAt: null,
      syncStatus: "synced",
    }).returning();

    // Deliberately DO NOT persist suggested medication as a prescription or
    // suggested exam as a real order. Only an unsigned demo draft is stored.
    return Response.json(
      { record, mode: "local-demo", signed: false },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Falha ao salvar rascunho de demonstração." }, { status: 500 });
  }
}
