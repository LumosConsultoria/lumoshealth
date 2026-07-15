create extension if not exists pgcrypto;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  cnes text not null,
  type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, cnes)
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  cns text not null,
  name text not null,
  cpf text,
  birth_date date not null,
  sex text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, cns)
);

create table professionals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  unit_id uuid not null references units(id),
  name text not null,
  cpf text not null,
  password_hash text not null,
  council_type text not null,
  council_number text not null,
  category text not null check (category in ('medico','enfermeiro','tecnico_enfermagem','outro')),
  specialty text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, cpf)
);

create table encounters (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  patient_id uuid not null references patients(id), unit_id uuid not null references units(id),
  started_at timestamptz not null, finished_at timestamptz,
  type text not null check (type in ('consulta','retorno','urgencia','triagem')),
  status text not null check (status in ('aguardando','em_atendimento','finalizado','cancelado')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table clinical_records (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  encounter_id uuid not null references encounters(id), professional_id uuid not null references professionals(id),
  category text not null, raw_transcript text, structured_data jsonb not null default '{}'::jsonb,
  signed_at timestamptz, sync_status text not null default 'synced',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table diagnoses (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  encounter_id uuid not null references encounters(id), cid10_code text not null,
  description text not null, is_primary boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table care_plans (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  encounter_id uuid not null references encounters(id), clinical_record_id uuid not null references clinical_records(id),
  description text not null, type text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table prescriptions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  encounter_id uuid not null references encounters(id), professional_id uuid not null references professionals(id),
  medication text not null, dosage text not null, instructions text not null, duration text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table exam_requests (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  encounter_id uuid not null references encounters(id), professional_id uuid not null references professionals(id),
  exam_type text not null, urgent boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table allergies (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  patient_id uuid not null references patients(id), substance text not null, severity text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table ongoing_medications (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  patient_id uuid not null references patients(id), medication text not null, dosage text not null, since date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table comorbidities (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  patient_id uuid not null references patients(id), cid10_code text not null, since date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table vaccines (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  patient_id uuid not null references patients(id), immunobiological text not null, applied_at date not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table category_permissions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  professional_category text not null, action text not null, allowed boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, professional_category, action)
);

create table access_logs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  professional_id uuid not null references professionals(id), encounter_id uuid references encounters(id),
  action text not null, resource_type text not null, resource_id uuid,
  occurred_at timestamptz not null default now(), ip_hash text
);

create index encounters_patient_timeline_idx on encounters (tenant_id, patient_id, started_at desc);
create index clinical_records_encounter_idx on clinical_records (tenant_id, encounter_id, created_at);
create index access_logs_audit_idx on access_logs (tenant_id, professional_id, occurred_at desc);

alter table patients enable row level security;
alter table encounters enable row level security;
alter table clinical_records enable row level security;
alter table access_logs enable row level security;

create policy tenant_patients on patients using (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_encounters on encounters using (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_records on clinical_records using (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_access_logs on access_logs using (tenant_id = current_setting('app.tenant_id', true)::uuid);
