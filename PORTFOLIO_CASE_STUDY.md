# Lumos Health — Applied AI EHR Prototype

**Status:** educational/experimental prototype; not clinically validated or approved for real patient data.

## Architecture visible in this repository

- Next.js / React / TypeScript client, with Node.js / Express backend components
- Transcription integration with Deepgram, plus an OpenAI Responses API structured-output route
- JSON schema outputs for professional categories, human review UI, records / prescriptions / exam-request models
- PostgreSQL schemas, Redis integration, Docker Compose configuration, PWA shell and local examples

## Responsible claims

The source demonstrates an integration design and prototype implementation. It **does not establish** that live third-party API calls, clinical safety, authorization boundaries, complete multitenancy, offline synchronization, end-to-end clinical approval or production performance have been independently verified.

**Do not use for clinical decisions or store real patient records.** Dummy records in the repository are fictional demonstration data.

## Before deploying anything outside a demo

- Implement and test authenticated server-side authorization on every patient/record endpoint
- Enforce human approval server-side before creating prescriptions and exam requests
- Complete tenant isolation, privacy/security testing, audit controls, failure recovery and data retention policies
- Review dependency vulnerabilities and secret-handling, complete integration and user-acceptance tests
- Perform formal clinical and regulatory review before any real-world use

No part of this case study claims that these measures have been completed.

## Security hardening (November 2026)

A review branch introduces fail-closed public clinical routes, a locally gated synthetic demo, unsigned-only record drafts, disabled unprotected voice proxy, JWT checks for the opt-in backend, loopback Docker bindings, and explicit warnings in the UI.

These changes **reduce risk**; they are **not** evidence of production security or clinical approval. The authenticated human-signature flow, real-data privacy safeguards, and end-to-end clinical tests remain out of scope. Never enter actual patient data into this demo.
