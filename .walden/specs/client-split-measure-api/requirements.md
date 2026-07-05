---
status: approved
approved_at: 2026-07-05T13:03:30Z
last_modified: 2026-07-05T13:03:30Z
approved_fingerprint: sha256:2620b3dccf609d308ef8f2941297c1a1884da9c7259946af3c157561ce7e9eb0
---

# Requirements Document

## Introduction

Incremento 4 (il più grande) dello split della read-API di `sonar/client.ts` (ora 1.698 righe). Estrae il cluster **measures** — component, quality gate, hotspots, project metrics, duplication, coverage, technical debt (11 metodi pubblici) più i privati `buildHotspotFilterParams` e `calculateCoveragePriority` — in un `SonarMeasureApi(client, projectKey)`. Verificato: **nessuna chiamata cross-modulo**; le interdipendenze sono tutte **interne** al cluster (technical-debt → project-metrics, duplication-summary → files-with-duplication + project-metrics, hotspots → buildHotspotFilterParams, coverage-gaps → calculateCoveragePriority), quindi si risolvono nella classe se spostate insieme. Sono **2 range** (A: component+quality-gate 903-985; B: hotspots…coverage 1005-1579) perché `buildLanguageSpecificParams`/`fileExists` (scan) restano in mezzo. `SonarQubeClient` delega gli 11 metodi.

## Requirements

### R1 Estrazione in `SonarMeasureApi`

**User Story:** Come manutentore, voglio la lettura di misure/metriche/hotspots/duplication/coverage in un modulo dedicato, così da ridurre sostanzialmente `sonar/client.ts`.

#### Acceptance Criteria

1. `R1.AC1` The system SHALL provide a `SonarMeasureApi`, constructed with the HTTP client and the project key, exposing the eleven measure methods (component details, quality gate, security hotspots, hotspot details, project metrics, files/details/summary duplication, line coverage, technical debt, coverage gaps) and owning `buildHotspotFilterParams` and `calculateCoveragePriority`.
2. `R1.AC2` The system SHALL make `SonarQubeClient` delegate all eleven measure methods to `SonarMeasureApi`.
3. `R1.AC3` The `SonarMeasureApi` SHALL depend only on the HTTP client and the project key — no token, scanner, or other extracted module.

### R2 Parità di comportamento (nessuna regressione)

**User Story:** Come utente, voglio che metriche, hotspots, duplication, coverage e technical debt restino identici, così da non avere regressioni.

#### Acceptance Criteria

1. `R2.AC1` WHEN any of the eleven measure methods is requested, the system SHALL return the same result as before the extraction.
2. `R2.AC2` The system SHALL preserve the internal composition among measure methods (technical-debt over project-metrics, duplication-summary over files-with-duplication and project-metrics).

### R3 API pubblica e call-site invariati

**User Story:** Come manutentore, voglio che i consumatori non cambino, così che l'estrazione sia trasparente.

#### Acceptance Criteria

1. `R3.AC1` The system SHALL preserve the eleven public method signatures on `SonarQubeClient` so existing call-sites need no change.
2. `R3.AC2` After the extraction, `SonarQubeClient` SHALL NOT contain the measure-method bodies (delegation only).

## Non-Functional Requirements

- `NFR1` The system SHALL preserve TypeScript `strict` compilation and introduce no new `as any` at the client/measure-api seam.
- `NFR2` The extraction SHALL move the existing logic, not rewrite it (behavior parity, bridged by `R2.AC1`).
- `NFR3` `SonarMeasureApi` SHALL be covered by tests (moved/added), and the full suite SHALL stay green.

## Constraints And Dependencies

- `C1` Il cluster è in **2 range** (A: 903-985, B: 1005-1579); `buildLanguageSpecificParams`/`fileExists` (scan) restano in mezzo e non si toccano.
- `C2` `SonarMeasureApi` riceve `projectKey` per valore (immutabile dopo il costruttore, verificato).
- `C3` I delegatori di `getTechnicalDebtAnalysis`/`getDuplicationSummary` usano il **return type inferito** (tipi di ritorno inline) per evitare di ri-dichiarare i tipi; gli altri 9 mantengono il return type esplicito nominale.
- `C4` È l'**incremento 4** dello split; dopo resta solo il **cluster A** (scan machinery).

## Out Of Scope

- Cluster A (scan machinery: trigger/CE/lock/exec) — spec successivo.
- Qualsiasi cambiamento ai call-site o alla logica (solo spostamento).
