---
status: approved
approved_at: 2026-07-05T13:20:18Z
last_modified: 2026-07-05T13:20:18Z
approved_fingerprint: sha256:6bb671ab36c23a0910015e1decd2e6ccbd96b77a0cb2096c8a55554dce8545f6
source_requirements_approved_at: 2026-07-05T13:19:27Z
source_requirements_fingerprint: sha256:d9090de1739e5967d978ecbbcff347b347800606e7c2c1d795c46eb76c7c7346
---

# Feature Design

## Overview

Estrarre la scan machinery in `SonarScanRunner` (`src/sonar/api/SonarScanRunner.ts`), costruito con `(client, projectKey, projectContext)`. Il runner crea il proprio `ScannerParameterBuilder`, tiene `scannerOptions` e `lastBuiltScannerParams`, e contiene tutti i metodi scan (trigger*, lock, CE-polling, runCliScanner, build*Params, getToken/sleep/fileExists) più i module-const `execAsync`/`execFileAsync`. `SonarQubeClient` delega i 6 metodi pubblici e mantiene i campi pubblici `client`/`projectContext`. Tre range verbatim, coi delegatori read lasciati in mezzo.

## Architecture

```text
  ScanOrchestrator / SonarQubeScanner
        │  client.triggerAnalysis / triggerDotnetAnalysis / waitForAnalysis / readCeTaskId
        │  client.setScannerOptions / getLastBuiltScannerParams
        ▼
  SonarQubeClient  ──delegate (x6)──>  this.scanRunner.<metodo>(...)
   (public client, projectContext)          │
                                             ▼
                                 SonarScanRunner(client, projectKey, projectContext)
                                   trigger (Maven/Gradle/CLI/.NET), file lock,
                                   CE polling, runCliScanner, param builders,
                                   getToken (da client), sleep, fileExists
                                   stato: paramBuilder, scannerOptions, lastBuiltScannerParams
```

## Options Considered

### Option A — `SonarScanRunner(client, projectKey, projectContext)` che costruisce il proprio paramBuilder (SCELTA)

- Summary: tutta la scan machinery + stato in una classe; il client delega 6 metodi.
- Why chosen: lo stato scan è già scan-only (verificato); il runner ha bisogno solo di client/projectKey/projectContext; `getToken` si ricava dal client (header axios). Nessuna dipendenza residua verso il client.

### Option B — Lasciare i builder di parametri nel client e spostare solo trigger/lock/polling

- Summary: split parziale.
- Why rejected: `runCliScanner`/`trigger*` usano `buildBaseParams`/`buildAuthParams`/`buildLanguageSpecificParams`; separarli creerebbe chiamate cross-modulo. Meglio muovere il cluster intero.

## Simplicity And Elegance Review

- Simplest viable shape: una classe con client+projectKey+projectContext; ~24 metodi verbatim; 6 delegatori; `scanRunner` creato nel costruttore dopo l'axios client.
- Coupling check: `getToken` legge l'header del client (nessuna credenziale separata); paramBuilder creato dentro il runner; nessun delegatore read tocca lo stato scan.
- Future-proofing: chiude lo split; `client.ts` resta come facade (costruzione + wiring + delegatori read/scan).

## Components And Interfaces

### `SonarScanRunner` (`src/sonar/api/SonarScanRunner.ts`)

- Purpose: triggering analisi (Maven/Gradle/CLI/.NET), lock a file, polling Compute Engine, costruzione parametri scanner.
- Inputs/Outputs: `constructor(client: AxiosInstance, projectKey: string, projectContext?: ProjectContext)`; pubblici `setScannerOptions`, `triggerAnalysis`, `triggerDotnetAnalysis`, `waitForAnalysis`, `readCeTaskId`, `getLastBuiltScannerParams`; il resto privato. Module-const `execAsync`/`execFileAsync`.
- Requirements: `R1.AC1`, `R1.AC3`, `R2.AC1`, `R2.AC2`, `R2.AC3`, `NFR4`

### `SonarQubeClient` (delega)

- Purpose: campo `private readonly scanRunner: SonarScanRunner` (creato nel costruttore con `this.client, this.projectKey, projectContext`, dopo l'axios client). Mantiene `public readonly client` e `public readonly projectContext`.
- Cambio: i 6 metodi diventano delegatori; i bodies, `paramBuilder`, `scannerOptions`, `lastBuiltScannerParams` e la creazione di `paramBuilder` **rimossi** dal client.
- Requirements: `R1.AC2`, `R3.AC1`, `R3.AC2`

## Data Models

Nessun nuovo modello (usa `ProjectContext`, `ScannerOptions`, `ScannerType`).

## Error Handling

Invariato: spostamento verbatim (gestione lock stale/corrotti, 403/404 nel polling, fallimento scanner propagato — `R2.AC3`).

## Security Considerations

`NFR4`: l'esecuzione resta command-injection-safe — `.NET` via `execFileAsync('dotnet', argsArray)` (nessuna shell), sanitizzatori (`sanitizeCommandArgs`/`shellQuote`) spostati col cluster e usati come prima.

## Failure Modes And Tradeoffs

- Failure mode: import/module-const mancanti nel nuovo file (child_process, fs, path relativi da `sonar/api/`).
  - Mitigation: import comprensivo con path corretti (`../../` per universal/infrastructure/core, `../` per scanner-selection/scanner); `execAsync`+`execFileAsync` replicati; build `strict` fallisce se manca qualcosa.
- Failure mode: rottura del flusso di scansione (feature core).
  - Mitigation: spostamento verbatim; i test di `ScanOrchestrator` + i test scan del client (via delegatori) + nuovo test del runner devono restare verdi; `git` come rete di sicurezza.
- Tradeoff: `projectContext` resta un campo pubblico del client anche se non più usato internamente (accesso esterno) — accettato.

## Testing Strategy

- Nuovo `SonarScanRunner.test.ts`: `readCeTaskId` (mock `fs`, parse `report-task.txt` + fallback), `waitForAnalysis`/`checkTaskStatus` per `ceTaskId` (mock axios `ce/task`), `getLastBuiltScannerParams`, `setScannerOptions` (nessuna esecuzione di processi reali).
- Suite completa verde, in particolare i test di `ScanOrchestrator` che esercitano trigger/wait via i delegatori del client.

## Verification Plan

- Requirement proof:
  - **R1/R2**: test del runner + parità suite (incl. ScanOrchestrator); grep che lo scan-runner riceve `client`/`projectKey`/`projectContext`.
  - **R3**: build `strict` + suite completa; grep che `runCliScanner`/`acquireLock` non sono più in `client.ts` e che i 6 delegatori esistono.
  - **NFR4**: grep che `.NET` usa `execFileAsync('dotnet'` (array), nessuna shell su input non fidato.
- Test evidence: suite vitest verde; nuovo test runner.
- Operational evidence: n/a (refactor interno; l'esecuzione reale dello scanner resta fuori CI).

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `SonarScanRunner(client, projectKey, projectContext)` + delega x6 |
| `R2` | Spostamento verbatim (3 range) + test runner/parità (ScanOrchestrator) |
| `R3` | Delegatori (firme invariate) + campi pubblici mantenuti; stato/metodi rimossi dal client |
| `NFR1` | `strict` pulito, nessun nuovo `as any` |
| `NFR2` | move-not-rewrite |
| `NFR3` | test del runner + suite verde (incl. ScanOrchestrator) |
| `NFR4` | esecuzione via array `execFile` preservata (grep + parità) |
