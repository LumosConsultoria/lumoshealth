# Lumos Health

**Applied AI clinical workflow prototype · Electronic Health Record (EHR) concept · Next.js / TypeScript / OpenAI**

> [!WARNING]
> **Experimental portfolio demo — not a clinical system.** All patient and clinician identities shown in the interface are fictional. The visual login does **not** authenticate a clinician. Clinical API routes are disabled by default and are always disabled in production builds. The project does not produce legally valid clinical signatures, prescriptions, or exam orders. **Never enter real patient information.**

Lumos Health explores a more natural clinical documentation experience for high-volume primary care: a patient timeline, ambient conversation transcription, structured AI-assisted notes, and a human-review interface. Its purpose is to demonstrate solution architecture, API integration, and responsible AI design decisions—not a ready-to-deploy healthcare product.

## Technical overview

| Layer | Technologies / design |
| --- | --- |
| Frontend | Next.js, React, TypeScript, responsive clinical workspace |
| AI structuring | OpenAI Responses API and strict JSON Schema structured outputs |
| Speech | Deepgram Nova-3, Brazilian Portuguese transcription and speaker diarization |
| Application backend | Node.js / Express, experimental JWT-protected clinician endpoint |
| Data | Drizzle ORM, Cloudflare D1 demonstration schema, PostgreSQL / row-level-security concepts |
| Infrastructure | Redis, Docker Compose, PWA shell, local development |
| Quality controls | Node.js tests, source safety contracts, TypeScript type checks, ESLint, CI |

### Features demonstrated

- Multiprofessional patient timeline with synthetic consultation history.
- Ambient conversation transcription flow with speaker attribution.
- AI-assisted extraction of clinical information with role-specific structured schemas.
- Human-review **UI** for suggested clinical information, medications, and tests.
- Simulated prescription and exam-request workflows; **no actual clinical orders are issued**.
- Local-only unsigned draft persistence in the explicitly enabled synthetic demo.
- A responsive interface and keyboard shortcuts for exploring the workflow.

**Important distinction:** a review/approval control in the UI is not proof of authenticated, server-enforced clinical approval. That production-critical workflow remains unimplemented and unvalidated.

## Repository structure

```text
app/                 Next.js frontend and experimental API routes
server/src/          Express backend and speech/AI integration prototype
db/                  Drizzle data model and D1 adapter
infra/postgres/      PostgreSQL schema and access-control concepts
public/              PWA assets and a restricted service worker cache
tests/               Structural and safety-focused automated tests
PORTFOLIO_CASE_STUDY.md   Architecture, limitations, and risk assessment
```

## Run the UI locally

**Prerequisite:** Node.js 22 or later.

```bash
npm ci
npm run dev
```

Open the local development address displayed by the server (usually `http://localhost:3000`). The visual experience uses fictional information. API-backed features will be unavailable unless you explicitly enable the local demonstration gate.

### Optional: local synthetic-data API demo

1. Copy `.env.example` to `.env.local` and `server/.env.example` to `server/.env`.
2. Use **test-only** credentials for optional OpenAI and Deepgram integrations; never commit secrets.
3. Only for development on your own machine, configure `LUMOS_ENABLE_LOCAL_DEMO_API=true` in `.env.local` while `NODE_ENV=development`.
4. Access the project via `localhost`. Do not expose this demo service to a public network or enter real healthcare data.

The Next.js routes `/api/records`, `/api/structure`, and `/api/deepgram/token` are otherwise blocked with HTTP 403. The local gate is **not authentication**.

The separate Express backend is disabled unless `LUMOS_ENABLE_BACKEND_API=true` and a sufficiently strong `JWT_SECRET` are configured. This experimental authorization layer is **not approved for production use**.

For optional local infrastructure:

```bash
docker compose up --build
```

PostgreSQL, Redis, and the API are bound to `127.0.0.1` by the supplied Compose configuration. The unauthenticated voice WebSocket proxy is intentionally disabled.

## Validation

```bash
node --test tests/demo-security.test.mjs tests/clinical-safety-contract.test.mjs tests/sw-cache.test.mjs
node --check server/src/index.mjs
npm ci
npx tsc --noEmit
npm run lint
npm test
```

The included CI workflow runs safety-contract tests, type checking, linting, and a build/test step. **Passing these checks does not demonstrate clinical correctness or production security.**

## Security, privacy, and responsible AI

- Only fictional patient and professional data may be used.
- Clinical APIs fail closed by default; real-world clinical deployment is out of scope.
- Suggested examinations and medications must **never** be treated as approved prescriptions or orders.
- Local demo records are unsigned drafts. The UI no longer stores clinical transcripts in browser `localStorage`.
- The PWA service worker caches only explicitly allowlisted public shell resources, not arbitrary API responses.
- AI-generated clinical content may be incomplete or inaccurate and requires qualified professional review.
- Tenant isolation, server-enforced human approval, retention policies, authentication, clinical quality, privacy compliance, and production observability all require further implementation and independent validation.

**This repository is a portfolio prototype, not a regulated medical product or a system for real patient records.**

## Portfolio

- [Lumos Consultoria](https://lumosconsultoria.com)
- [Lumos Consultoria on GitHub](https://github.com/LumosConsultoria)
- [Architecture and limitations](PORTFOLIO_CASE_STUDY.md)
