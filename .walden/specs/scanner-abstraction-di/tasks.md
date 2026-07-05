---
status: approved
approved_at: 2026-07-05T09:05:07Z
last_modified: 2026-07-05T09:09:04Z
approved_fingerprint: sha256:9ee5dd32b4a8dd8ad278a95980a82fc584e8d28f9df57f6e390b1ec8f2f09efa
source_design_approved_at: 2026-07-05T08:52:00Z
source_design_fingerprint: sha256:79c30b4fd0d8e3be28a9b49521aef5b2dc02b014233a8c549bdb9a93e7774ce1
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

- [x] 3. Wiring unico: rimuovere TSyringe (Opzione A — realizzazione a funzioni)
  - [x] 3.1 Confermare `toolRoutes` (`ToolRouter.ts`) come unico meccanismo di wiring (funzioni handler, dipendenze costruite per-chiamata per la config dinamica per-progetto); aggiungere/estendere `ToolRouter.test.ts` a copertura del dispatch
    - Requirements: `R1.AC1`
    - Design: Components And Interfaces → Wiring unico (Opzione A — realizzazione)
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/mcp/ToolRouter.test.ts"]
        covers: ["R1.AC1"]
  - [x] 3.2 Cancellare le classi `@injectable` morte dagli handler (mai raggiunte dal router) e rimuovere gli import `tsyringe`/`TOKENS`; togliere i tag `@deprecated` dalle funzioni handler (ora path unico)
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `NFR1`
    - Design: Wiring unico (Opzione A — realizzazione); Simplicity And Elegance Review
    - Verification:
      - command: ["grep", "-q", "as any", "packages/core/src/mcp/handlers/scan.handler.ts"]
        expect_exit: 1
        covers: ["R1.AC3"]
      - command: ["grep", "-rq", "@deprecated", "packages/core/src/mcp/handlers", "--include=*.ts"]
        expect_exit: 1
        covers: ["R1.AC2"]
      - command: ["sh", "-c", "npm run build"]
        covers: ["R1.AC1"]
  - [x] 3.3 De-decorare i 10 servizi `core/*`: rimuovere `@injectable`/`@inject`/import `TOKENS`, costruttori espliciti tipati dalle interfacce
    - Requirements: `R1.AC3`, `NFR1`
    - Design: Wiring unico (Opzione A — realizzazione) → rimozioni
    - Verification:
      - command: ["grep", "-rq", "di/tokens", "packages/core/src/core", "--include=*.ts"]
        expect_exit: 1
        covers: ["R1.AC3"]
      - command: ["sh", "-c", "npm run build"]
        covers: ["R1.AC3"]
  - [x] 3.4 Cancellare `infrastructure/di/{container,tokens}.ts`, rimuovere `reflect-metadata` da `package.json`/entrypoint/setup, e cancellare il morto `SonarQubeApiClient`
    - Requirements: `R1.AC2`
    - Design: Wiring unico (Opzione A — realizzazione) → rimozioni
    - Verification:
      - command: ["grep", "-rq", "tsyringe", "packages/core/src", "--include=*.ts"]
        expect_exit: 1
        covers: ["R1.AC2"]
      - command: ["sh", "-c", "npm run build"]
        covers: ["R1.AC2"]

- [x] 4. Fallimenti scanner e mascheramento token
  - [x] 4.1 Garantire: scanner non disponibile → errore normalizzato actionable; rilascio del lock su eccezione nel `finally`; `maskToken()` su ogni messaggio d'errore. Aggiungere i relativi test
    - Requirements: `R5.AC1`, `R5.AC2`, `R5.AC3`, `NFR2`
    - Design: Error Handling; Security Considerations
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/core/scanning/ScanOrchestrator.test.ts src/scanners"]
        covers: ["R5.AC1", "R5.AC2", "R5.AC3"]

- [x] 5. Verifica finale end-to-end
  - [x] 5.1 Eseguire i grep-guard (nessun import `tsyringe`/`reflect-metadata` nel sorgente), il build `strict` e la suite completa verde
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `NFR1`
    - Design: Verification Plan
    - Verification:
      - command: ["grep", "-rqE", "tsyringe|reflect-metadata", "packages/core/src", "--include=*.ts"]
        expect_exit: 1
        covers: ["R1.AC2"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
        covers: ["R1.AC1", "R1.AC3"]
