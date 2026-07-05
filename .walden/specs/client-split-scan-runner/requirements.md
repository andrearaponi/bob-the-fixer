---
status: approved
approved_at: 2026-07-05T13:19:27Z
last_modified: 2026-07-05T13:19:27Z
approved_fingerprint: sha256:d9090de1739e5967d978ecbbcff347b347800606e7c2c1d795c46eb76c7c7346
---

# Requirements Document

## Introduction

Ultimo incremento dello split del God object `sonar/client.ts` (ora 1.111 righe): estrae il **cluster A — scan machinery** in un `SonarScanRunner`. Comprende: `triggerAnalysis` + Maven/Gradle/CLI/.NET, il lock a file (acquire/try/release + gestione stale/corrotti), il polling Compute Engine (`waitForAnalysis`/`checkTaskStatus`/`handleTaskStatus`/`handleAnalysisError`/`build403ErrorMessage`/`readCeTaskId`), `runCliScanner`, i builder di parametri (`buildBaseParams`/`buildAuthParams`/`buildLanguageSpecificParams`/`getMissingCriticalProperties`), e gli helper `getToken`/`sleep`/`fileExists`. Verificato: tutto lo stato scan (`paramBuilder`, `scannerOptions`, `lastBuiltScannerParams`, `projectContext` d'uso interno) è **scan-only**; nessun delegatore read lo tocca. A differenza dei moduli read, questo è **behavior** (esegue processi via `exec`/`execFile`, gestisce lock e polling) e tiene **stato mutabile**.

## Requirements

### R1 Estrazione in `SonarScanRunner`

**User Story:** Come manutentore, voglio la scan machinery in un modulo dedicato con il suo stato, così che `sonar/client.ts` diventi una facade sottile.

#### Acceptance Criteria

1. `R1.AC1` The system SHALL provide a `SonarScanRunner`, constructed with the HTTP client, the project key, and the project context, that owns the scanner param builder, scanner options, and last-built scanner params, and performs analysis triggering, file locking, and Compute Engine polling.
2. `R1.AC2` The system SHALL make `SonarQubeClient` delegate `setScannerOptions`, `triggerAnalysis`, `triggerDotnetAnalysis`, `waitForAnalysis`, `readCeTaskId`, and `getLastBuiltScannerParams` to `SonarScanRunner`.
3. `R1.AC3` The `SonarScanRunner` SHALL derive the scanner token from the HTTP client it is given, not from a separate credential path.

### R2 Parità di comportamento (nessuna regressione)

**User Story:** Come utente, voglio che la scansione (trigger, lock, attesa analisi) resti identica, così da non avere regressioni nel flusso principale.

#### Acceptance Criteria

1. `R2.AC1` WHEN an analysis is triggered or awaited, the system SHALL behave the same as before the extraction (same scanner selection, locking, and polling).
2. `R2.AC2` The system SHALL preserve `getLastBuiltScannerParams`, returning the parameters built during the most recent trigger.
3. `R2.AC3` IF the scanner process fails, THEN the system SHALL surface the same error behavior as before (no swallowed failures).

### R3 API pubblica e call-site invariati

**User Story:** Come manutentore, voglio che `ScanOrchestrator`, `SonarQubeScanner` e gli altri consumatori non cambino.

#### Acceptance Criteria

1. `R3.AC1` The system SHALL preserve the six public scan method signatures on `SonarQubeClient`, plus the public `client` and `projectContext` fields, so existing call-sites need no change.
2. `R3.AC2` After the extraction, `SonarQubeClient` SHALL NOT contain the scan-method bodies nor the scan-only state (delegation only).

## Non-Functional Requirements

- `NFR1` The system SHALL preserve TypeScript `strict` compilation and introduce no new `as any` at the client/scan-runner seam.
- `NFR2` The extraction SHALL move the existing logic, not rewrite it (behavior parity, bridged by `R2.AC1`).
- `NFR3` `SonarScanRunner` SHALL be covered by tests (moved/added), and the full suite (including `ScanOrchestrator`) SHALL stay green.
- `NFR4` The extraction SHALL preserve the command-injection-safe execution (argument arrays via `execFile`, no shell interpolation of untrusted input).

## Constraints And Dependencies

- `C1` La scan machinery è in **3 range** non contigui (setScannerOptions+trigger+lock; CE-polling+build-params+runCliScanner; buildLanguageSpecificParams+fileExists), coi delegatori read in mezzo che restano.
- `C2` `SonarScanRunner` (in `sonar/api/`) replica i module-const `execAsync`/`execFileAsync` e gli import scan (child_process, fs, path, scanner-selection, ScannerParameterBuilder, PreScanValidator, sanitizzatori); i path relativi cambiano (`../../` dalla nuova cartella).
- `C3` `projectContext` resta un campo pubblico sul client (accesso esterno) ma viene anche passato allo scan-runner; `paramBuilder`/`scannerOptions`/`lastBuiltScannerParams` (privati) si spostano.
- `C4` È l'**ultimo** incremento: chiude lo split del God object.

## Out Of Scope

- Refactoring interno della scan machinery (solo spostamento; nessun cambio di logica).
- Qualsiasi cambiamento ai call-site.
