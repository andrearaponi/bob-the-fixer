---
status: approved
approved_at: 2026-07-05T13:04:11Z
last_modified: 2026-07-05T13:04:11Z
approved_fingerprint: sha256:ffc6d0e548070f6d22758fe0f7dca818dc476919fecebb0e51522f4d4bb75ac6
source_requirements_approved_at: 2026-07-05T13:03:30Z
source_requirements_fingerprint: sha256:2620b3dccf609d308ef8f2941297c1a1884da9c7259946af3c157561ce7e9eb0
---

# Feature Design

## Overview

Estrarre il cluster measures in `SonarMeasureApi` (`src/sonar/api/SonarMeasureApi.ts`), costruito con l'`AxiosInstance` e il `projectKey`. Due range verbatim — A (getComponentDetails, getQualityGateStatus: 903-985) e B (getSecurityHotspots … calculateCoveragePriority: 1005-1579) — con `buildLanguageSpecificParams`/`fileExists` (scan) lasciati intatti in mezzo. `SonarQubeClient` tiene un campo `measureApi` e delega gli 11 metodi pubblici. Le composizioni interne (tech-debt→metrics, dup-summary→files+metrics, hotspots→buildHotspotFilterParams, coverage-gaps→calculateCoveragePriority) si risolvono dentro la classe.

## Architecture

```text
  consumatori (ReportGenerator, QualityAnalyzer, SecurityAnalyzer, handlers, ...)
        │  client.get{ProjectMetrics,SecurityHotspots,TechnicalDebtAnalysis,...}
        ▼
  SonarQubeClient  ──delegate (x11)──>  this.measureApi.<metodo>(...)
                                              │
                                              ▼
                                  SonarMeasureApi(client, projectKey)
                                    11 metodi pubblici + composizioni interne
                                    (privati: buildHotspotFilterParams, calculateCoveragePriority)
```

Stesso stampo di `SonarIssueApi` (client + projectKey), scalato al cluster più grande.

## Options Considered

### Option A — Un unico `SonarMeasureApi` per tutto il cluster (SCELTA)

- Summary: spostare gli 11 metodi + i 2 helper in una sola classe; il client delega.
- Why chosen: le composizioni interne (metrics condiviso da tech-debt e duplication-summary) legano i metodi tra loro; separarli renderebbe quelle chiamate cross-modulo. Un solo modulo rispetta il grafo delle dipendenze.

### Option B — Sotto-moduli separati (hotspots / coverage / measures-core)

- Summary: 3 classi distinte.
- Why rejected: spezzerebbe `getProjectMetrics` (usato da tech-debt e duplication-summary) su più moduli, introducendo accoppiamento cross-modulo che oggi non esiste.

## Simplicity And Elegance Review

- Simplest viable shape: una classe con client + projectKey; 13 metodi verbatim; 11 delegatori; `measureApi` inizializzato accanto a `issueApi`.
- Coupling check: nessun token/scanner/cross-modulo (verificato); solo client + projectKey; le composizioni restano interne.
- Future-proofing: dopo questo resta solo il cluster A (scan machinery).

## Components And Interfaces

### `SonarMeasureApi` (`src/sonar/api/SonarMeasureApi.ts`)

- Purpose: letture di component, quality gate, security hotspots, project metrics, duplication, line coverage, coverage gaps, technical debt.
- Inputs/Outputs: `constructor(client: AxiosInstance, projectKey: string)`; gli 11 metodi pubblici (firme invariate) + privati `buildHotspotFilterParams`, `calculateCoveragePriority`.
- Requirements: `R1.AC1`, `R1.AC3`, `R2.AC1`, `R2.AC2`

### `SonarQubeClient` (delega)

- Purpose: campo `private readonly measureApi: SonarMeasureApi` (costruito con `this.client, this.projectKey`, accanto a `issueApi`).
- Cambio: gli 11 metodi diventano delegatori (9 con return type nominale esplicito, 2 — technical-debt e duplication-summary — con return inferito per non ri-dichiarare i tipi inline); i bodies e i 2 helper privati **rimossi** dal client.
- Requirements: `R1.AC2`, `R3.AC1`, `R3.AC2`

## Data Models

Nessun nuovo modello (usa i tipi esistenti: `SonarComponentDetails`, `SonarQualityGateStatus`, `SonarSecurityHotspot`, `SonarProjectMetrics`, `SonarSecurityHotspotDetails`, `SonarFilesWithDuplication`, `SonarDuplicationDetails`, `SonarLineCoverage`, `FilesWithCoverageGaps`, `CoveragePriority`, `HotspotStatus`/`HotspotResolution`/`HotspotSeverity`).

## Error Handling

Invariato: spostamento verbatim (gestione errori dei singoli metodi immutata).

## Failure Modes And Tradeoffs

- Failure mode: import di tipo mancante nel nuovo modulo (cluster grande, molti tipi).
  - Mitigation: import comprensivo da `../types`; il build `strict` fallisce se manca un tipo (rilevamento immediato).
- Failure mode: un delegatore con firma imprecisa rompe un call-site.
  - Mitigation: 9 return espliciti presi dalle firme reali; 2 con return inferito (identico per costruzione); build + suite completa verificano tutti i consumatori.
- Tradeoff: 2 delegatori senza return type esplicito (inferito) — accettato per non ri-dichiarare tipi inline verbosi; il tipo pubblico resta identico.

## Testing Strategy

- Nuovo `SonarMeasureApi.test.ts` con axios mockato: getProjectMetrics (usa projectKey), getSecurityHotspots (buildHotspotFilterParams, un GET per status), getFilesWithDuplication, getTechnicalDebtAnalysis (compone project-metrics).
- Suite completa verde (inclusi i molti test che oggi esercitano questi metodi) → API pubblica e comportamento invariati.

## Verification Plan

- Requirement proof:
  - **R1/R2**: test del measure-api + parità suite; grep che il measure-api riceve `projectKey` e non usa `getToken`.
  - **R3**: build `strict` + suite completa; grep che `calculateCoveragePriority`/`buildHotspotFilterParams` non sono più in `client.ts`.
- Test evidence: suite vitest verde; nuovo test measure-api.
- Operational evidence: n/a (refactor interno).

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `SonarMeasureApi(client, projectKey)` + delega x11 |
| `R2` | Spostamento verbatim (2 range) + composizioni interne + test/parità |
| `R3` | Delegatori (firme invariate); metodi/helper rimossi dal client |
| `NFR1` | `strict` pulito, nessun nuovo `as any` |
| `NFR2` | move-not-rewrite |
| `NFR3` | test del measure-api + suite verde |
