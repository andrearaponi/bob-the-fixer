---
status: approved
approved_at: 2026-07-05T12:45:28Z
last_modified: 2026-07-05T12:45:28Z
approved_fingerprint: sha256:ef5fcc4c12d832e88330902bce69aabb0b9935d75039f667b6877c23dd88f0ca
source_requirements_approved_at: 2026-07-05T12:43:44Z
source_requirements_fingerprint: sha256:d36c81724b0e03b0067387b2063d9c0194f2c9835d331367d458b943aa61892f
---

# Feature Design

## Overview

Estrarre il cluster issues in `SonarIssueApi` (`src/sonar/api/SonarIssueApi.ts`), costruito con l'`AxiosInstance` **e il `projectKey`**. Due range: i 4 metodi issue (602-790, contigui) e il privato `buildFilterParams` (942-954). `SonarQubeClient` tiene un campo `issueApi` e delega i 4 metodi pubblici. Firme e call-site invariati.

## Architecture

```text
  ReportGenerator / IssueAnalyzer / PatternAnalysisService / DiagnosticsService / ScanOrchestrator
        │  client.getIssues / getIssueByKey / getSimilarFixedIssues / getProjectTestFiles
        ▼
  SonarQubeClient  ──delegate──>  this.issueApi.<metodo>(...)
                                        │
                                        ▼
                              SonarIssueApi(client, projectKey)
                                getIssues / getIssueByKey / getSimilarFixedIssues / getProjectTestFiles
                                (privato: buildFilterParams)
```

Stesso stampo di source/rule api, ma con `projectKey` per valore (mai riassegnato dopo il costruttore → sicuro).

## Options Considered

### Option A — `SonarIssueApi(client, projectKey)` (SCELTA)

- Summary: spostare i 2 range (4 metodi + buildFilterParams) verbatim in una classe con `this.client` + `this.projectKey`; il client delega.
- Why chosen: stesso pattern degli increment 1-2; l'unica differenza è il `projectKey`, che è immutabile dopo il costruttore (verificato), quindi il pass-by-value è corretto.

### Option B — Passare un getter `() => this.projectKey` invece del valore

- Summary: iniettare una funzione che rilegge il projectKey dal client.
- Why rejected: inutile complessità — `projectKey` non cambia mai dopo il costruttore; il valore diretto è più semplice e sufficiente.

## Simplicity And Elegance Review

- Simplest viable shape: una classe con client + projectKey; 5 metodi verbatim (4 pubblici + buildFilterParams); 4 delegatori; `issueApi` inizializzato accanto a `ruleApi`.
- Coupling check: nessun token/scanner/cross-modulo (verificato); solo client + projectKey.
- Future-proofing: prosegue lo svuotamento della read-API (dopo: measures/hotspots/duplication).

## Components And Interfaces

### `SonarIssueApi` (`src/sonar/api/SonarIssueApi.ts`)

- Purpose: lettura issue (lista con paginazione, per key, simili risolte, file di test).
- Inputs/Outputs: `constructor(client: AxiosInstance, projectKey: string)`; `getIssues(filter?)`, `getIssueByKey(issueKey, options?)`, `getSimilarFixedIssues(ruleKey, maxResults?)`, `getProjectTestFiles(pageSize?)`; privato `buildFilterParams`.
- Requirements: `R1.AC1`, `R1.AC3`, `R2.AC1`, `R2.AC2`

### `SonarQubeClient` (delega)

- Purpose: campo `private readonly issueApi: SonarIssueApi` (costruito con `this.client, this.projectKey`, accanto a `ruleApi`).
- Cambio: i 4 metodi diventano delegatori (firme identiche); i bodies e `buildFilterParams` **rimossi** dal client.
- Requirements: `R1.AC2`, `R3.AC1`, `R3.AC2`

## Data Models

Nessun nuovo modello (usa `SonarIssue`, `IssueFilter`).

## Error Handling

Invariato: spostamento verbatim (gestione 403/404 in getIssues, best-effort ecc. immutati).

## Failure Modes And Tradeoffs

- Failure mode: spostamento impreciso cambia il set di issue restituito o la paginazione.
  - Mitigation: 2 range verbatim con confini verificati; build `strict` + suite completa (inclusi i test `getIssues`/10k) + nuovo test del `SonarIssueApi`.
  - Tradeoff: nessuno rilevante.
- Failure mode: `projectKey` disallineato tra client e issueApi.
  - Mitigation: `projectKey` è immutabile dopo il costruttore (verificato: unico assegnamento); il valore non diverge.

## Testing Strategy

- Nuovo `SonarIssueApi.test.ts` con axios mockato: getIssues (usa projectKey come componentKeys, cap 10k), getIssueByKey, getProjectTestFiles.
- Suite completa verde (inclusi i test che oggi esercitano questi metodi, tra cui il cap 10k) → API pubblica e comportamento invariati.

## Verification Plan

- Requirement proof:
  - **R1/R2**: test dell'issue-api + parità suite; grep che l'issue-api riceve `projectKey` dal costruttore e non usa `getToken`.
  - **R3**: build `strict` + suite completa; grep che `getIssueByKey`/`buildFilterParams` non sono più in `client.ts`.
- Test evidence: suite vitest verde; nuovo test issue-api.
- Operational evidence: n/a (refactor interno).

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `SonarIssueApi(client, projectKey)` + delega da `SonarQubeClient` |
| `R2` | Spostamento verbatim (2 range) + test issue-api/parità (incl. cap 10k) |
| `R3` | Delegatori (firme invariate); metodi/helper rimossi dal client |
| `NFR1` | `strict` pulito, nessun nuovo `as any` |
| `NFR2` | move-not-rewrite |
| `NFR3` | test dell'issue-api + suite verde |
