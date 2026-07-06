---
status: approved
approved_at: 2026-07-06T18:59:03Z
last_modified: 2026-07-06T18:59:03Z
approved_fingerprint: sha256:27fcd5eec56dbe6b60c73207b659e292f81c4695c8e09f806fe5dcb91c92e250
---

# Requirements Document

## Introduction

Blocco 3 del punto 7: aggiungere **ESLint** (flat config, `typescript-eslint`) e un **gate di lint** in CI. Misurato: la config recommended dà **774 errori**, dominati da `no-explicit-any` (632, uso deliberato di `any` → si spegne) e `no-unused-vars` (128 genuini). Per un **primo gate verde ed enforceable** senza un cleanup rischioso di 128 punti: `any` off, `no-unused-vars` a **warn** (backlog visibile, non blocca), e si **fixano** i 7 errori reali e pochi (`no-require-imports` ×6, `no-empty-object-type` ×1). L'installazione di ESLint ha inoltre **esposto** un override `ajv` troppo largo (globale) che forzava ajv 8 anche su ESLint (che vuole ajv 6): va ristretto.

## Requirements

### R1 Tooling e configurazione ESLint

**User Story:** Come manutentore, voglio una config ESLint per il progetto TS, così da avere linting coerente.

#### Acceptance Criteria

1. `R1.AC1` The project SHALL provide an ESLint flat config based on `typescript-eslint` recommended rules.
2. `R1.AC2` The config SHALL ignore build output, `node_modules`, coverage, and `.d.ts` files.
3. `R1.AC3` A `lint` npm script SHALL run ESLint over the source.

### R2 Gate verde ed enforceable

**User Story:** Come manutentore, voglio che `npm run lint` sia verde sul codice attuale, così da poterlo mettere come gate.

#### Acceptance Criteria

1. `R2.AC1` `npm run lint` SHALL exit 0 on the current codebase (zero errors).
2. `R2.AC2` The config SHALL disable `@typescript-eslint/no-explicit-any` and set `@typescript-eslint/no-unused-vars` to `warn` (surfaced backlog, non-blocking for this first gate).
3. `R2.AC3` The real errors (`no-require-imports`, `no-empty-object-type`) SHALL be fixed in source, not merely downgraded.

### R3 Integrazione CI

**User Story:** Come manutentore, voglio il lint come gate in CI, così da bloccare le regressioni.

#### Acceptance Criteria

1. `R3.AC1` The CI SHALL run the lint gate (`npm run lint`) as a step or job.

## Non-Functional Requirements

- `NFR1` The `ajv` override SHALL be scoped so ESLint's ajv-6 usage is not forced to ajv-8, and the Trivy dependency gate SHALL stay green (ajv vuln still closed).
- `NFR2` TypeScript `strict` build and the full test suite SHALL stay green (no source behavior change beyond the 7 lint fixes).
- `NFR3` The lint config SHALL be reproducible (pinned dev deps, explicit rules).

## Constraints And Dependencies

- `C1` `no-explicit-any` (632) è spento per scelta: `any` è usato deliberatamente nel codebase; ripulirlo è un refactor a sé, non un lint gate.
- `C2` `no-unused-vars` (128) è a `warn` in questo primo gate: cleanup e stringimento (max-warnings ratchet) sono un follow-up.
- `C3` ESLint flat config richiede `.mjs` (il root non è `type: module`).
- `C4` La CI gira su GitHub; `npm run lint` è verificato localmente (exit 0).

## Out Of Scope

- Cleanup dei 128 `no-unused-vars` e stringimento a errore (blocco/follow-up successivo).
- Regole `strict-type-checked` (richiedono type-info, molto più severe).
- Rimozione degli `any` (632).
