---
status: approved
approved_at: 2026-07-05T11:11:14Z
last_modified: 2026-07-05T11:11:14Z
approved_fingerprint: sha256:0b5ca4bebbbf5e85278cb2dabfe17055ec93f0ce6c4747137b767986d8d8177a
---

# Requirements Document

## Introduction

Continuazione dello split del God object `sonar/client.ts` (ora 2.158 righe). A differenza del cluster B (blocco contiguo, zero accoppiamento), la **read-API è sparsa e accoppiata** ad axios/cache: la affrontiamo **in più incrementi coesi**, uno per spec, per tenere il rischio basso.

Questo spec è l'**incremento 1**: estrarre il sotto-blocco **sources** — `getSourceContext`, `getSourceLines` (+ i privati `getSourceLinesFromIndex`, `getRawFileLines`) e la cache `rawSourceLinesCache` — in un `SonarSourceFetcher`. È il candidato più pulito: **contiguo** (righe ~801-925), accoppiamento minimo (solo `this.client` + la propria cache confinata), 2 soli metodi pubblici consumati esternamente (da `IssueAnalyzer`, `SecurityAnalyzer`). `SonarQubeClient` delega, comportamento e call-site invariati.

<!-- assumed: scope = SOLO l'estrazione del sotto-blocco sources in `SonarSourceFetcher`. Incrementi successivi (spec a parte): rules+ruleCache; measures/hotspots/duplication/coverage; e il cluster A (scan machinery). -->

## Requirements

### R1 Estrazione in `SonarSourceFetcher`

**User Story:** Come manutentore, voglio la logica di fetch del codice sorgente in un modulo dedicato con la sua cache, così da ridurre `sonar/client.ts` in modo coeso.

#### Acceptance Criteria

1. `R1.AC1` The system SHALL provide a `SonarSourceFetcher` that fetches source context/lines, constructed with the HTTP client, and owns the raw-source-lines cache.
2. `R1.AC2` The system SHALL make `SonarQubeClient` delegate `getSourceContext` and `getSourceLines` to `SonarSourceFetcher`.
3. `R1.AC3` The `SonarSourceFetcher` SHALL NOT depend on the project key, token, or scanner concerns — only on the HTTP client and its own cache.

### R2 Parità di comportamento (nessuna regressione)

**User Story:** Come utente, voglio che il contesto di codice nelle issue resti identico, così da non avere regressioni.

#### Acceptance Criteria

1. `R2.AC1` WHEN source context or source lines are requested, the system SHALL return the same result as before the extraction.
2. `R2.AC2` The system SHALL preserve the raw-source-lines caching behavior (same file fetched at most once per client instance).

### R3 API pubblica e call-site invariati

**User Story:** Come manutentore, voglio che i consumatori (`IssueAnalyzer`, `SecurityAnalyzer`) non cambino, così che l'estrazione sia trasparente.

#### Acceptance Criteria

1. `R3.AC1` The system SHALL preserve `SonarQubeClient`'s public `getSourceContext`/`getSourceLines` signatures so existing call-sites need no change.
2. `R3.AC2` After the extraction, `SonarQubeClient` SHALL NOT contain the source-fetching method bodies (delegation only).

## Non-Functional Requirements

- `NFR1` The system SHALL preserve TypeScript `strict` compilation and introduce no new `as any` at the client/fetcher seam.
- `NFR2` The extraction SHALL move the existing logic, not rewrite it (behavior parity, bridged by `R2.AC1`).
- `NFR3` `SonarSourceFetcher` SHALL be covered by tests (moved/added), and the full suite SHALL stay green.

## Constraints And Dependencies

- `C1` `SonarSourceFetcher` riceve l'`AxiosInstance` dal client e tiene la propria `rawSourceLinesCache` (confinata al blocco, verificato).
- `C2` È l'**incremento 1** dello split read-API; gli altri sotto-moduli e il cluster A sono spec successivi.

## Out Of Scope

- Altri sotto-moduli della read-API: **rules** (+ruleCache), **measures/hotspots/duplication/coverage** — spec successivi.
- Cluster A (scan machinery: trigger/CE/lock/exec) — spec successivo.
- Qualsiasi cambiamento ai call-site o alla logica di fetch (solo spostamento).
