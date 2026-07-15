import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const units = sqliteTable("units", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  cnes: text("cnes").notNull(),
  type: text("type").notNull(),
  ...timestamps,
});

export const patients = sqliteTable("patients", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  cns: text("cns").notNull(),
  name: text("name").notNull(),
  cpf: text("cpf"),
  birthDate: text("birth_date").notNull(),
  sex: text("sex").notNull(),
  ...timestamps,
});

export const professionals = sqliteTable("professionals", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  unitId: text("unit_id").notNull().references(() => units.id),
  name: text("name").notNull(),
  cpf: text("cpf").notNull(),
  passwordHash: text("password_hash").notNull(),
  councilType: text("council_type").notNull(),
  councilNumber: text("council_number").notNull(),
  category: text("category").notNull(),
  specialty: text("specialty"),
  ...timestamps,
});

export const encounters = sqliteTable("encounters", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  patientId: text("patient_id").notNull().references(() => patients.id),
  unitId: text("unit_id").notNull().references(() => units.id),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  type: text("type").notNull(),
  status: text("status").notNull(),
  ...timestamps,
});

export const clinicalRecords = sqliteTable("clinical_records", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  encounterId: text("encounter_id").notNull().references(() => encounters.id),
  professionalId: text("professional_id").notNull().references(() => professionals.id),
  category: text("category").notNull(),
  rawTranscript: text("raw_transcript"),
  structuredData: text("structured_data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  signedAt: text("signed_at"),
  syncStatus: text("sync_status").notNull().default("synced"),
  ...timestamps,
});

export const diagnoses = sqliteTable("diagnoses", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  encounterId: text("encounter_id").notNull().references(() => encounters.id),
  cid10Code: text("cid10_code").notNull(),
  description: text("description").notNull(),
  primary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const carePlans = sqliteTable("care_plans", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  encounterId: text("encounter_id").notNull().references(() => encounters.id),
  clinicalRecordId: text("clinical_record_id").notNull().references(() => clinicalRecords.id),
  description: text("description").notNull(),
  type: text("type").notNull(),
  ...timestamps,
});

export const prescriptions = sqliteTable("prescriptions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  encounterId: text("encounter_id").notNull().references(() => encounters.id),
  professionalId: text("professional_id").notNull().references(() => professionals.id),
  medication: text("medication").notNull(),
  dosage: text("dosage").notNull(),
  instructions: text("instructions").notNull(),
  duration: text("duration").notNull(),
  ...timestamps,
});

export const examRequests = sqliteTable("exam_requests", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  encounterId: text("encounter_id").notNull().references(() => encounters.id),
  professionalId: text("professional_id").notNull().references(() => professionals.id),
  examType: text("exam_type").notNull(),
  urgent: integer("urgent", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const allergies = sqliteTable("allergies", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  patientId: text("patient_id").notNull().references(() => patients.id),
  substance: text("substance").notNull(),
  severity: text("severity").notNull(),
  ...timestamps,
});

export const ongoingMedications = sqliteTable("ongoing_medications", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  patientId: text("patient_id").notNull().references(() => patients.id),
  medication: text("medication").notNull(),
  dosage: text("dosage").notNull(),
  since: text("since"),
  ...timestamps,
});

export const comorbidities = sqliteTable("comorbidities", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  patientId: text("patient_id").notNull().references(() => patients.id),
  cid10Code: text("cid10_code").notNull(),
  since: text("since"),
  ...timestamps,
});

export const vaccines = sqliteTable("vaccines", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  patientId: text("patient_id").notNull().references(() => patients.id),
  immunobiological: text("immunobiological").notNull(),
  appliedAt: text("applied_at").notNull(),
  ...timestamps,
});

export const categoryPermissions = sqliteTable("category_permissions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  professionalCategory: text("professional_category").notNull(),
  action: text("action").notNull(),
  allowed: integer("allowed", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const accessLogs = sqliteTable("access_logs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  professionalId: text("professional_id").notNull().references(() => professionals.id),
  encounterId: text("encounter_id").references(() => encounters.id),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  occurredAt: text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  ipHash: text("ip_hash"),
});
