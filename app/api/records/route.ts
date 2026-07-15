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

const demo = {
  tenantId: "demo-tenant-lumos",
  unitId: "demo-unit-jardim-esperanca",
  patientId: "demo-patient-maria",
  professionalId: "demo-professional-ana",
  encounterId: "demo-encounter-current",
};

async function ensureDemoContext() {
  const db = getDb();
  await db.insert(tenants).values({ id: demo.tenantId, name: "Lumos Saúde Municipal", slug: "lumos-demo" }).onConflictDoNothing();
  await db.insert(units).values({ id: demo.unitId, tenantId: demo.tenantId, name: "UBS Jardim Esperança", cnes: "0000001", type: "UBS" }).onConflictDoNothing();
  await db.insert(patients).values({ id: demo.patientId, tenantId: demo.tenantId, cns: "702508623840001", name: "Maria das Dores Silva", cpf: "00000000000", birthDate: "1968-02-14", sex: "F" }).onConflictDoNothing();
  await db.insert(professionals).values({ id: demo.professionalId, tenantId: demo.tenantId, unitId: demo.unitId, name: "Ana Lima", cpf: "12345678900", passwordHash: "demo-only", councilType: "CRM", councilNumber: "48291", category: "medico", specialty: "Clínica geral" }).onConflictDoNothing();
  await db.insert(encounters).values({ id: demo.encounterId, tenantId: demo.tenantId, patientId: demo.patientId, unitId: demo.unitId, startedAt: new Date().toISOString(), type: "consulta", status: "em_atendimento" }).onConflictDoNothing();
  return db;
}

export async function GET() {
  try {
    const db = await ensureDemoContext();
    const records = await db.select().from(clinicalRecords).where(and(eq(clinicalRecords.tenantId, demo.tenantId), eq(clinicalRecords.encounterId, demo.encounterId))).orderBy(desc(clinicalRecords.createdAt)).limit(20);
    return Response.json({ records });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar a timeline." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { transcript?: string; category?: string };
    if (!payload.transcript?.trim()) {
      return Response.json({ error: "A transcrição é obrigatória." }, { status: 400 });
    }

    const db = await ensureDemoContext();
    const id = crypto.randomUUID();
    const [record] = await db.insert(clinicalRecords).values({
      id,
      tenantId: demo.tenantId,
      encounterId: demo.encounterId,
      professionalId: demo.professionalId,
      category: payload.category ?? "consulta_medica",
      rawTranscript: payload.transcript,
      structuredData: {
        queixa_principal: "Cefaleia leve e aferição de pressão elevada desde ontem.",
        cid10: "I10",
        status: "reviewed",
      },
      signedAt: new Date().toISOString(),
      syncStatus: "synced",
    }).returning();
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o registro." }, { status: 500 });
  }
}
