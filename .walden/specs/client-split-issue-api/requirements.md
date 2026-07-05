---
status: approved
approved_at: 2026-07-05T12:43:44Z
last_modified: 2026-07-05T12:43:44Z
approved_fingerprint: sha256:d36c81724b0e03b0067387b2063d9c0194f2c9835d331367d458b943aa61892f
---

# Requirements Document

## Introduction

Incremento 3 dello split della read-API di `sonar/client.ts` (ora 1.887 righe). Estrae il cluster **issues** — `getIssues`, `getIssueByKey`, `getSimilarFixedIssues`, `getProjectTestFiles` e il privato `buildFilterParams` — in un `SonarIssueApi`. A differenza di sources/rules (accoppiamento zero), questo cluster usa **`projectKey`**, quindi il modulo prende `constructor(client, projectKey)`. Verificato: i 4 metodi issue sono contigui (602-790), `buildFilterParams` è isolato (942-954) e usato solo da `getIssues`, `projectKey` è assegnato solo nel costruttore (pass-by-value sicuro), nessuna chiamata cross-modulo (source/rule). `SonarQubeClient` delega; consumatori: `ReportGenerator`, `IssueAnalyzer`, `PatternAnalysisService`, `DiagnosticsService`, `ScanOrchestrator`.

## Requirements

### R1 Estrazione in `SonarIssueApi`

**User Story:** Come manutentore, voglio la lettura delle issue in un modulo dedicato, così da ridurre `sonar/client.ts` in modo coeso.

#### Acceptance Criteria

1. `R1.AC1` The system SHALL provide a `SonarIssueApi` exposing `getIssues`, `getIssueByKey`, `getSimilarFixedIssues`, and `getProjectTestFiles`, constructed with the HTTP client and the project key, and owning the `buildFilterParams` helper.
2. `R1.AC2` The system SHALL make `SonarQubeClient` delegate `getIssues`, `getIssueByKey`, `getSimilarFixedIssues`, and `getProjectTestFiles` to `SonarIssueApi`.
3. `R1.AC3` The `SonarIssueApi` SHALL depend only on the HTTP client and the project key — no token, scanner, or other client method.

### R2 Parità di comportamento (nessuna regressione)

**User Story:** Come utente, voglio che il recupero delle issue resti identico, così da non avere regressioni.

#### Acceptance Criteria

1. `R2.AC1` WHEN issues, an issue by key, similar fixed issues, or test files are requested, the system SHALL return the same result as before the extraction.
2. `R2.AC2` The system SHALL preserve the `getIssues` pagination behavior, including the 10,000-result window cap and truncation signal.

### R3 API pubblica e call-site invariati

**User Story:** Come manutentore, voglio che i 5 consumatori non cambino, così che l'estrazione sia trasparente.

#### Acceptance Criteria

1. `R3.AC1` The system SHALL preserve `SonarQubeClient`'s public `getIssues`/`getIssueByKey`/`getSimilarFixedIssues`/`getProjectTestFiles` signatures so existing call-sites need no change.
2. `R3.AC2` After the extraction, `SonarQubeClient` SHALL NOT contain the issue-method bodies (delegation only).

## Non-Functional Requirements

- `NFR1` The system SHALL preserve TypeScript `strict` compilation and introduce no new `as any` at the client/issue-api seam.
- `NFR2` The extraction SHALL move the existing logic, not rewrite it (behavior parity, bridged by `R2.AC1`).
- `NFR3` `SonarIssueApi` SHALL be covered by tests (moved/added), and the full suite SHALL stay green.

## Constraints And Dependencies

- `C1` I 4 metodi issue sono contigui (602-790); `buildFilterParams` è un range separato (942-954). L'estrazione sposta 2 range.
- `C2` `SonarIssueApi` riceve `projectKey` per valore nel costruttore; `projectKey` non è mai riassegnato dopo il costruttore (verificato), quindi il valore non si disallinea.
- `C3` È l'**incremento 3** dello split read-API; measures/hotspots/duplication e il cluster A sono spec successivi.

## Out Of Scope

- Altri sotto-moduli read-API: **measures/hotspots/duplication/coverage** — spec successivo.
- Cluster A (scan machinery) — spec successivo.
- Qualsiasi cambiamento ai call-site o alla logica (solo spostamento).
