---
status: approved
approved_at: 2026-07-06T17:44:09Z
last_modified: 2026-07-06T17:44:09Z
approved_fingerprint: sha256:f699373c259dc83f6e2fe8a9fab176cda78fb3c33e7a99b826ddde4df6e4645d
source_requirements_approved_at: 2026-07-06T17:43:18Z
source_requirements_fingerprint: sha256:ebd5181e90ecada4862946ab42b37d54078bb483379a3dde614e30754c67fc4a
---

# Feature Design

## Overview

Un modulo `trivy/sbom.ts` (`generateSbom`) esegue `trivy fs --format cyclonedx|spdx-json` via `execFile` (no shell), scrive l'SBOM su file e ritorna un riepilogo (formato, percorso, numero componenti). Un handler MCP `trivy-sbom.handler.ts` lo espone come tool `trivy_generate_sbom`; router e tool-definitions vengono aggiornati (24° tool). Riusa `INSTALL_HINT` (esportato da `TrivyScanner`) per il caso Trivy-assente.

## Architecture

```text
  MCP tool trivy_generate_sbom  ──►  handleTrivyGenerateSbom(args)
        │  generateSbom({ projectPath, format, outputPath })
        ▼
  execFile('trivy', ['fs','--quiet','--format',<fmt>, projectPath])  ──► stdout (SBOM JSON)
        │  writeFile(outputPath, stdout)  +  parse per component count
        ▼
  MCPResponse: "SBOM CycloneDX scritto in ./sbom.cyclonedx.json — 107 componenti"
```

## Options Considered

### Option A — Modulo `sbom.ts` standalone + handler (SCELTA)

- Summary: la generazione SBOM è un'operazione a sé (non è `IScanner.scan`); vive in un modulo dedicato con il suo `execFile`, riusando solo `INSTALL_HINT`.
- Why chosen: separa SBOM (inventario) da scan (issue); non inquina l'astrazione `IScanner`; testabile in isolamento con `execFile` mockato.

### Option B — Metodo `generateSbom` su `TrivyScanner`

- Summary: aggiungere il metodo alla classe scanner.
- Why rejected: `TrivyScanner` implementa `IScanner` (scan→issue); l'SBOM è un'altra responsabilità — meglio non gonfiare la classe.

## Simplicity And Elegance Review

- Simplest viable shape: una funzione `generateSbom`, un handler sottile, una tool-def, una riga di router.
- Coupling check: `sbom.ts` dipende solo da `child_process`/`fs` + `INSTALL_HINT`; l'handler è colla; nessun impatto su scan/SCA (`NFR3`).
- Future-proofing: nuovi formati/opzioni si aggiungono nel solo `sbom.ts`.

## Components And Interfaces

### `generateSbom` (`trivy/sbom.ts`)

- API: `generateSbom(opts: { projectPath: string; format?: SbomFormat; outputPath?: string }): Promise<SbomResult>`.
  - `SbomFormat = 'cyclonedx' | 'spdx-json'`; default `cyclonedx` (`R1.AC2`). Formato non in whitelist → `throw` prima di eseguire Trivy (`R1.AC4`).
  - `execFile('trivy', ['fs','--quiet','--format', trivyFmt, projectPath])` (no shell, `NFR1`); `ENOENT` → `throw new Error(INSTALL_HINT)` (`R1.AC3`).
  - `outputPath` default: `<projectPath>/sbom.cyclonedx.json` o `sbom.spdx.json`. Scrive stdout su `outputPath` (`R2.AC1`).
  - Parsing riepilogo: CycloneDX → `components.length` + `specVersion`; SPDX → `packages.length` + `spdxVersion`. Se il parse fallisce → count `undefined` (riepilogo degradato, `R2.AC3`).
  - Ritorna `{ format, outputPath, componentCount?, spec? }`.
- Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R1.AC4`, `R2.AC1`, `R2.AC3`, `NFR1`

### `handleTrivyGenerateSbom` (`mcp/handlers/trivy-sbom.handler.ts`)

- Legge `projectPath` (default `process.cwd()`), `format`, `outputPath`; chiama `generateSbom`; ritorna un `MCPResponse` testuale di riepilogo (`R2.AC2`). Errori (Trivy assente / formato non valido) → messaggio actionable.
- Requirements: `R2.AC2`, `R3.AC1`

### Router + tool-definitions

- `ToolRouter`: aggiungere `trivy_generate_sbom: handleTrivyGenerateSbom` a `toolRoutes`.
- `tool-definitions.ts`: aggiungere la def del tool (params `projectPath?`, `format?` enum, `outputPath?`).
- `ToolRouter.test.ts`: aggiornare il conteggio hardcoded 23 → 24 (`C4`).
- Requirements: `R3.AC2`

## Data Models

```ts
type SbomFormat = 'cyclonedx' | 'spdx-json';
interface SbomResult { format: SbomFormat; outputPath: string; componentCount?: number; spec?: string; }
```

## Error Handling

- Trivy assente (`ENOENT`) → `INSTALL_HINT` (`R1.AC3`); formato non valido → errore pre-esecuzione (`R1.AC4`); SBOM non parseable → riepilogo senza count (`R2.AC3`), file comunque scritto.

## Security Considerations

`NFR1`: `execFile` con array (no shell); `projectPath`/`outputPath` non interpolati in una shell → nessuna command injection. Coerente con il resto dell'integrazione Trivy.

## Failure Modes And Tradeoffs

- Failure mode: SBOM molto grande in `stdout`.
  - Mitigation: `maxBuffer` ampio (come lo scanner); si scrive su file e si ritorna solo il riepilogo (`R2.AC2`).
- Tradeoff: il tool scrive un file nel progetto (effetto atteso per un SBOM, `C3`); percorso overridabile.

## Testing Strategy

- `sbom.test.ts` (`execFile` mockato): cyclonedx default → file scritto + count da `components`; spdx-json → count da `packages`; formato non valido → throw pre-esecuzione; ENOENT → `INSTALL_HINT`; JSON non parseable → riepilogo senza count.
- `trivy-sbom.handler.test.ts`: riepilogo testuale; errore actionable su Trivy assente.
- `ToolRouter.test.ts`: 24 tool; il nuovo tool è routable.
- Scrittura file: usa una dir temporanea nel test (hermetic).

## Verification Plan

- Requirement proof: test unit di `generateSbom` (formati/errori) + handler + router (24 tool, routable).
- Test evidence: nuovi test + suite completa verde.
- Operational evidence (bonus): run reale `trivy_generate_sbom` su questo repo → SBOM CycloneDX con N componenti.

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `generateSbom` (Trivy exec, default, install-hint, format-guard) |
| `R2` | write file + riepilogo + degradazione senza count |
| `R3` | handler + router + tool-definitions (routable) |
| `NFR1` | `execFile` array, no shell |
| `NFR2` | `strict` verde + test con `execFile` mockato |
| `NFR3` | nessun impatto su scan/SCA |
