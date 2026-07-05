---
status: approved
approved_at: 2026-07-05T09:41:29Z
last_modified: 2026-07-05T09:41:29Z
approved_fingerprint: sha256:11e45b5947448351e10cd0ecf64a847840908c30b8dbb8766def557f9174b9b5
---

# Requirements Document

## Introduction

`sonar/client.ts` è un God object da ~3.288 righe (il 14% del sorgente). Lo affrontiamo **incrementalmente**, un'estrazione coesa per spec. Questo primo spec estrae il cluster più grande e più autonomo: la **costruzione dei parametri scanner per-linguaggio** (~1.200 righe: Java/JS/Python/Go/C++, rilevamento versione, source/test dirs, risoluzione librerie Maven/Gradle).

Questo cluster è il candidato ideale: **zero accoppiamento all'HTTP** (non usa `this.client`/axios, `getToken`, né `projectKey`) — dipende solo da `projectContext` e da helper filesystem interni al cluster stesso. Ha un unico entry-point (`buildLanguageSpecificParams`) e 7 file di test dedicati in `tests/sonar/`.

Obiettivo: estrarre in un `ScannerParameterBuilder`, far **delegare** `SonarQubeClient` (comportamento identico, nessun call-site cambiato, nessuna regressione), riducendo il God object di ~36%. Gli altri cluster — orchestrazione scan (trigger/CE/lock) e API di lettura — sono spec successivi.

<!-- assumed: scope = SOLO l'estrazione del cluster di costruzione parametri per-linguaggio in `ScannerParameterBuilder`. Cluster A (scan/CE/lock) e cluster C (read API) sono spec successivi. Move, non rewrite. -->

## Requirements

### R1 Estrazione in `ScannerParameterBuilder`

**User Story:** Come manutentore, voglio la logica di costruzione parametri per-linguaggio in un modulo dedicato, così che `sonar/client.ts` smetta di essere un God object monolitico.

#### Acceptance Criteria

1. `R1.AC1` The system SHALL provide a `ScannerParameterBuilder` module that builds language-specific scanner parameters, constructed from the project context, separate from `SonarQubeClient`.
2. `R1.AC2` The system SHALL make `SonarQubeClient` delegate language-specific parameter building to `ScannerParameterBuilder`.
3. `R1.AC3` The `ScannerParameterBuilder` SHALL depend only on the project context and the filesystem, with no dependency on the HTTP client, token, or project key.

### R2 Parità di comportamento (nessuna regressione)

**User Story:** Come utente, voglio che le scansioni producano esattamente gli stessi parametri di prima, così da non avere regressioni.

#### Acceptance Criteria

1. `R2.AC1` WHEN language-specific scanner parameters are built for a project, the system SHALL produce the same parameters as before the extraction.
2. `R2.AC2` The system SHALL preserve the language detection behaviors (Java/JS/Python/Go/C++ version, source/test directories, Maven/Gradle libraries) and cover them with tests targeting `ScannerParameterBuilder`.

### R3 Riduzione del God object

**User Story:** Come manutentore, voglio che `sonar/client.ts` si riduca in modo misurabile, così da rendere concreto il debito ripagato.

#### Acceptance Criteria

1. `R3.AC1` After the extraction, `SonarQubeClient` SHALL NOT contain the language-specific parameter-building methods.
2. `R3.AC2` The system SHALL reduce `sonar/client.ts` by removing the extracted cluster (measurable line reduction).

### R4 API pubblica e call-site invariati

**User Story:** Come manutentore, voglio che nulla a valle cambi, così che l'estrazione sia trasparente per chi usa il client.

#### Acceptance Criteria

1. `R4.AC1` The system SHALL preserve `SonarQubeClient`'s public API so existing call-sites need no change.
2. `R4.AC2` IF the project language cannot be determined, THEN the builder SHALL behave exactly as the prior in-client code did (no new failure modes).

## Non-Functional Requirements

- `NFR1` The system SHALL preserve TypeScript `strict` compilation and SHALL NOT introduce new `as any` casts at the client/builder seam.
- `NFR2` The extraction SHALL **move** the existing logic, not rewrite it (strangler-fig), to guarantee behavior parity (bridged by `R2.AC1`).
- `NFR3` `ScannerParameterBuilder` SHALL be covered by tests, including the migrated `tests/sonar/*` language-detection suites.

## Constraints And Dependencies

- `C1` `ScannerParameterBuilder` dipende solo da `projectContext` + filesystem (rispecchia lo zero-accoppiamento HTTP del cluster).
- `C2` È il **primo** degli split del God object; orchestrazione scan (cluster A) e read API (cluster C) sono spec successivi.
- `C3` I 7 file `tests/sonar/*` che oggi testano i metodi privati del cluster via `(client as any)` vanno **ri-orientati** al builder (stessa logica, stesse asserzioni).

## Out Of Scope

- Estrazione del cluster **A** (trigger analisi, polling CE, lock) e del cluster **C** (read API: issues/rules/sources/metrics/hotspots/duplication/coverage/tech-debt) — spec successivi.
- Qualsiasi cambiamento ai call-site o alla API pubblica di `SonarQubeClient`.
- Riscrittura o modifica della logica di detection (solo spostamento).
