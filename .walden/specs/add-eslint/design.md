---
status: approved
approved_at: 2026-07-06T19:00:39Z
last_modified: 2026-07-06T19:00:39Z
approved_fingerprint: sha256:61c9be5e455cb95b3f36c029e6dd1a4d9529f496dab6a9815a9ec449195d51b2
source_requirements_approved_at: 2026-07-06T18:59:03Z
source_requirements_fingerprint: sha256:27fcd5eec56dbe6b60c73207b659e292f81c4695c8e09f806fe5dcb91c92e250
---

# Feature Design

## Overview

Aggiungere `eslint.config.mjs` (flat config, `typescript-eslint` recommended con `no-explicit-any` off e `no-unused-vars` a warn), uno script `lint` nel root `package.json`, e un job `lint` in `ci.yml`. Fixare i 7 errori reali (require-imports ×6, empty-object-type ×1). Ristretto l'override `ajv` (globale → scoped sotto `@mcp/sdk`) così ESLint riottiene ajv 6 e il gate Trivy resta verde.

## Architecture

```text
  npm run lint  ──►  eslint (root eslint.config.mjs)  ──►  packages/core/src
        recommended − no-explicit-any + no-unused-vars(warn)
        → 0 errori (gate verde), 128 warning (backlog)

  ci.yml: job lint  (checkout → setup-node → npm ci → npm run lint)
```

## Options Considered

### Option A — Primo gate verde: any off, unused-vars warn, fix dei 7 (SCELTA)

- Summary: config pragmatica + fix dei soli errori reali e pochi; gate `npm run lint` a exit 0.
- Why chosen: stabilisce tooling + gate enforceable **subito**, blocca le regressioni nuove, senza il cleanup rischioso di 128 unused-vars / 632 any.

### Option B — Gate reale completo (fix di tutti i 135)

- Summary: no-unused-vars a errore + fix dei 128.
- Why rejected: 128 edit manuali (rimozioni potenzialmente rischiose) in una sola sessione; sproporzionato per un primo gate. Rimandato a un follow-up con ratchet.

## Simplicity And Elegance Review

- Simplest viable shape: un file di config, uno script, un job CI, 7 fix mirati.
- Coupling check: la config vive al root; nessun impatto sul codice runtime oltre i 7 fix; l'override ajv è scoped (nessuna forzatura globale).
- Future-proofing: il backlog unused-vars è un warn misurabile; il ratchet (max-warnings) e le strict rules sono agganciabili dopo senza rifare questo.

## Components And Interfaces

### `eslint.config.mjs` (root, nuovo)

- Flat config: `...tseslint.configs.recommended`; `ignores` per dist/node_modules/coverage/`.d.ts`; regole: `no-explicit-any: off`, `no-unused-vars: ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]`.
- Requirements: `R1.AC1`, `R1.AC2`, `R2.AC2`

### `package.json` (root)

- Script `"lint": "eslint packages/core/src"`; devDeps `eslint`/`typescript-eslint` (già aggiunte); override `ajv` scoped sotto `@modelcontextprotocol/sdk` (già fatto).
- Requirements: `R1.AC3`, `NFR1`

### Fix di sorgente (7)

- `no-require-imports` (SecurityAnalyzer.ts:184, mcp-logger.ts:280, structured-logger.ts:258, sonar-admin.ts:362, universal-mcp-server.ts:76-77): convertire a `import` se top-level; dove il `require` è **lazy/dinamico intenzionale**, `// eslint-disable-next-line` con motivazione (non un downgrade globale).
- `no-empty-object-type` (quality-gate.handler.ts:17): sostituire `{}` con un tipo appropriato (`Record<string, never>`/`object`).
- Requirements: `R2.AC3`

### `ci.yml` — job `lint`

- `runs-on: ubuntu-latest`; checkout → setup-node(cache npm) → `npm ci` → `npm run lint`.
- Requirements: `R3.AC1`

## Data Models

n/a (config + CI + fix puntuali).

## Error Handling

- `npm run lint` esce non-zero solo su **errori** (i warning non bloccano) → gate verde oggi, rosso su un nuovo errore (`R2.AC1`).

## Security Considerations

`NFR1`: l'override ajv scoped evita di forzare ajv 8 su consumer che vogliono ajv 6 (ESLint), senza riaprire la vuln (ajv top-level 6.15.0 ≥ fix 6.14.0; `@mcp/sdk` 8.18.0). Il gate Trivy resta verde.

## Failure Modes And Tradeoffs

- Failure mode: convertire un `require` lazy in `import` top-level cambia semantica (eager load).
  - Mitigation: conversione solo dove sicura; altrove disable mirato con motivazione; build + suite verificano.
- Tradeoff: `no-unused-vars` a warn non blocca il dead code (accettato: backlog visibile, ratchet in follow-up).

## Testing Strategy

- `npm run lint` → exit 0 (0 errori) — gate verde.
- Build `strict` + suite completa verde (i 7 fix non cambiano comportamento).
- Gate Trivy verde (ajv scoped) + ajv on-disk (ESLint 6.x, `@mcp/sdk` 8.18).

## Verification Plan

- Requirement proof: `npm run lint` exit 0; grep `lint` script + job `lint` in ci.yml + config `no-explicit-any`/`no-unused-vars`; build + suite; gate Trivy.
- Test evidence: suite verde, lint verde.
- Operational evidence: l'esito del job `lint` è visibile al primo run su GitHub (`C4`).

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `eslint.config.mjs` + `lint` script |
| `R2` | config (any off / unused-vars warn) + fix dei 7 → `npm run lint` exit 0 |
| `R3` | job `lint` in `ci.yml` |
| `NFR1` | override ajv scoped + gate Trivy verde |
| `NFR2` | build + suite verdi |
| `NFR3` | dev deps pinnate + regole esplicite |
