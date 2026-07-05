---
status: approved
approved_at: 2026-07-05T07:56:27Z
last_modified: 2026-07-05T08:27:13Z
approved_fingerprint: sha256:3a6d35362b3311d8d730a356c648f5fda4251798b78b7a7a3288163b2cc36107
source_design_approved_at: 2026-07-05T07:53:55Z
source_design_fingerprint: sha256:f130399812fa16cd6553107a88c2c416b51f3aa88cd760894247474bface2ced
---

# Implementation Plan

Sequenza per rischio crescente: prima il contratto (additivo, coesiste con TSyringe), poi lo scanner reale e il routing, poi la rimozione di TSyringe (sweep meccanica), infine i fallimenti e la verifica finale. Build `strict` + suite completa verdi a ogni passo.

- [x] 1. Ridisegnare il contratto scanner (additivo, nessuna regressione)
  - [x] 1.1 Rivedere `IScanner` verso "scan-and-return"; introdurre `IQueryableScanner extends IScanner` con `getIssues(projectKey, filter)`; rimuovere `getIssues` dal contratto base; aggiornare `BaseScannerImpl`
    - Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`, `R6.AC1`
    - Design: Components And Interfaces → `IScanner` (contratto rivisto), `IQueryableScanner`
    - Verification:
      - command: ["sh", "-c", "npm run build"]
        covers: ["R2.AC1", "R2.AC2", "R2.AC3", "R6.AC1"]
  - [x] 1.2 Implementare `ScannerRegistry` (`register/get/list/getByType`) su `Map<string, IScanner>`; rimuovere o ridefinire `IScannerFactory`; scrivere unit test incluso un **fake scanner** registrato
    - Requirements: `R3.AC1`, `R3.AC2`, `NFR4`
    - Design: Components And Interfaces → `ScannerRegistry`; Testing Strategy
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/scanners/ScannerRegistry.test.ts"]
        covers: ["R3.AC1", "R3.AC2"]

- [x] 2. Rendere reale `SonarQubeScanner` e instradare l'orchestratore
  - [x] 2.1 Implementare `SonarQubeScanner.scan()` reale riusando `SonarQubeClient` (non il morto `SonarQubeApiClient`); implementare `IQueryableScanner`; test di mapping/comportamento
    - Requirements: `R4.AC1`
    - Design: Components And Interfaces → `SonarQubeScanner` (reso reale); Architecture (strangler-fig)
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/sonar/scanner/SonarQubeScanner.test.ts"]
        covers: ["R4.AC1"]
  - [x] 2.2 Far dipendere `ScanOrchestrator` da `ScannerRegistry`/`IScanner` invece di costruire `SonarQubeClient`; aggiungere un test di **parità output** su `sonar_scan_project` (pre/post migrazione)
    - Requirements: `R2.AC1`, `R3.AC2`, `R4.AC2`
    - Design: Architecture (confini); Components And Interfaces → `ScanOrchestrator`; Verification Plan (R4)
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/core/scanning/ScanOrchestrator.test.ts src/mcp/handlers/scan.handler.test.ts"]
        covers: ["R2.AC1", "R3.AC2", "R4.AC2"]

- [ ] 3. Wiring unico: rimuovere TSyringe (Opzione A)
  - [ ] 3.1 Creare il composition root (`createScannerRegistry`, `createHandlers`) e collegare `ToolRouter` agli handler già costruiti
    - Requirements: `R1.AC1`
    - Design: Components And Interfaces → Composition Root (Opzione A)
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/mcp/ToolRouter.test.ts"]
        covers: ["R1.AC1"]
  - [ ] 3.2 De-decorare i ~20 handler: rimuovere `@injectable`/`@inject`/`TOKENS`, costruttori a parametri tipati da interfacce, eliminare gli `as any` alle giunzioni
    - Requirements: `R1.AC1`, `R1.AC3`, `NFR1`
    - Design: Composition Root (Opzione A); Simplicity And Elegance Review
    - Verification:
      - command: ["grep", "-q", "as any", "packages/core/src/mcp/handlers/scan.handler.ts"]
        expect_exit: 1
        covers: ["R1.AC3"]
      - command: ["sh", "-c", "npm run build"]
        covers: ["R1.AC1"]
  - [ ] 3.3 De-decorare i 10 servizi `core/*` e `SonarQubeScanner`: rimuovere `@injectable`/`@inject`/import `TOKENS`, costruttori espliciti
    - Requirements: `R1.AC3`, `NFR1`
    - Design: Composition Root (Opzione A) → nota sulle rimozioni
    - Verification:
      - command: ["grep", "-rq", "TOKENS", "packages/core/src/core", "--include=*.ts"]
        expect_exit: 1
        covers: ["R1.AC3"]
      - command: ["sh", "-c", "npm run build"]
        covers: ["R1.AC3"]
  - [ ] 3.4 Cancellare `infrastructure/di/{container,tokens}.ts`, rimuovere `reflect-metadata` da `package.json` e dagli entrypoint, cancellare tutte le funzioni `handle*()` `@deprecated` e il morto `SonarQubeApiClient`
    - Requirements: `R1.AC2`
    - Design: Composition Root (Opzione A) → Rimozioni
    - Verification:
      - command: ["grep", "-rq", "tsyringe", "packages/core/src", "--include=*.ts"]
        expect_exit: 1
        covers: ["R1.AC2"]
      - command: ["grep", "-rq", "@deprecated", "packages/core/src/mcp/handlers", "--include=*.ts"]
        expect_exit: 1
        covers: ["R1.AC2"]

- [ ] 4. Fallimenti scanner e mascheramento token
  - [ ] 4.1 Garantire: scanner non disponibile → errore normalizzato actionable; rilascio del lock su eccezione nel `finally`; `maskToken()` su ogni messaggio d'errore. Aggiungere i relativi test
    - Requirements: `R5.AC1`, `R5.AC2`, `R5.AC3`, `NFR2`
    - Design: Error Handling; Security Considerations
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/core/scanning/ScanOrchestrator.test.ts src/scanners"]
        covers: ["R5.AC1", "R5.AC2", "R5.AC3"]

- [ ] 5. Verifica finale end-to-end
  - [ ] 5.1 Eseguire i grep-guard (nessun import `tsyringe`/`reflect-metadata` nel sorgente), il build `strict` e la suite completa verde
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `NFR1`
    - Design: Verification Plan
    - Verification:
      - command: ["grep", "-rqE", "tsyringe|reflect-metadata", "packages/core/src", "--include=*.ts"]
        expect_exit: 1
        covers: ["R1.AC2"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
        covers: ["R1.AC1", "R1.AC3"]
