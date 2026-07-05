---
status: approved
approved_at: 2026-07-05T13:21:00Z
last_modified: 2026-07-05T13:28:43Z
approved_fingerprint: sha256:e92a75cc612eb1b37a36211913dafb86564cafbd9bca13dbe123cf1f61fc0f4d
source_design_approved_at: 2026-07-05T13:20:18Z
source_design_fingerprint: sha256:6bb671ab36c23a0910015e1decd2e6ccbd96b77a0cb2096c8a55554dce8545f6
---

# Implementation Plan

Estrazione meccanica di 3 range + module-const + cambio costruttore (move-not-rewrite). `git` come rete di sicurezza.

- [x] 1. Estrarre `SonarScanRunner` e far delegare il client
  - [x] 1.1 Creare `src/sonar/api/SonarScanRunner.ts` (costruttore `AxiosInstance` + `projectKey` + `projectContext?`, crea il proprio `ScannerParameterBuilder`, tiene `scannerOptions`/`lastBuiltScannerParams`, module-const `execAsync`/`execFileAsync`, import con path `../../`) spostando **verbatim** i 3 range scan; aggiungere `private scanRunner` a `SonarQubeClient` (creato dopo l'axios client) e sostituire i 6 metodi pubblici con delegatori; rimuovere bodies, `paramBuilder`/`scannerOptions`/`lastBuiltScannerParams` e la creazione di `paramBuilder` dal client (tenendo `client`/`projectContext` pubblici)
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R3.AC1`, `R3.AC2`, `NFR1`, `NFR2`, `NFR4`
    - Design: Components And Interfaces
    - Verification:
      - command: ["grep", "-q", "private async acquireLock", "packages/core/src/sonar/client.ts"]
        expect_exit: 1
        covers: ["R3.AC2"]
      - command: ["grep", "-q", "execFileAsync('dotnet'", "packages/core/src/sonar/api/SonarScanRunner.ts"]
        covers: ["NFR4"]
      - command: ["sh", "-c", "npm run build"]
        covers: ["R1.AC1", "R1.AC2", "R1.AC3", "R3.AC1"]

- [x] 2. Test del scan-runner e parità
  - [x] 2.1 Aggiungere `src/sonar/api/SonarScanRunner.test.ts` (axios/fs mockati: readCeTaskId + fallback, checkTaskStatus per ceTaskId, getLastBuiltScannerParams, setScannerOptions — nessun processo reale); poi build `strict` + suite completa verde (incl. ScanOrchestrator)
    - Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`, `NFR3`
    - Design: Testing Strategy
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/sonar/api/SonarScanRunner.test.ts"]
        covers: ["R2.AC1", "R2.AC2", "R2.AC3"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
