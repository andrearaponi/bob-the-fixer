---
status: approved
approved_at: 2026-07-05T10:42:47Z
last_modified: 2026-07-05T10:52:47Z
approved_fingerprint: sha256:d8264f745e2279a84c918948b9786fb02e8c99eb68be9e33ceb052575fd30c6b
source_design_approved_at: 2026-07-05T10:40:37Z
source_design_fingerprint: sha256:dafbd5082e796740bc2ba9f46a3581e5bdc31c8e209e86e2557b378929e6a172
---

# Implementation Plan

Fix mirati, ciascuno con unit test (axios/fs mockati). Build `strict` + suite completa verdi alla fine.

- [x] 1. Robustezza `sonar/client.ts`
  - [x] 1.1 R1 — `getIssues`: cap a `MAX_PAGE = Math.floor(10000/PAGE_SIZE)`, recuperare pagine `2..min(totalPages, MAX_PAGE)`, loggare troncamento se `total > 10000`; test (total=15000 → ≤20 pagine, nessun throw, troncamento)
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `NFR3`
    - Design: Components And Interfaces → R1
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/sonar/client.test.ts"]
        covers: ["R1.AC1", "R1.AC2", "R1.AC3"]
  - [x] 1.2 R2 — aggiungere `readCeTaskId(projectPath)`; `waitForAnalysis(timeout?, ceTaskId?)`/`checkTaskStatus(ceTaskId?)` che pollano `ce/task?id=` con fallback a `ce/activity`; `ScanOrchestrator` passa il `ceTaskId`; test (poll per id + fallback)
    - Requirements: `R2.AC1`, `R2.AC2`, `NFR3`
    - Design: Components And Interfaces → R2
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/sonar/client.test.ts"]
        covers: ["R2.AC1", "R2.AC2"]
  - [x] 1.3 R3 — `waitForCacheRefresh`: uscita solo con `currentCount === previousIssueCount && currentCount > 0`; test (0,0 → non esce; 5,5 → esce)
    - Requirements: `R3.AC1`, `NFR3`
    - Design: Components And Interfaces → R3
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/sonar/client.test.ts"]
        covers: ["R3.AC1"]

- [x] 2. Correttezza handler
  - [x] 2.1 R4 — allineare l'enum azioni a `view/validate/reset` in `tool-definitions.ts` e `SonarConfigManagerSchema`; l'handler chiama `validateInput`; test (azione ignota → errore; consistenza enum)
    - Requirements: `R4.AC1`, `R4.AC2`, `R4.AC3`, `NFR3`
    - Design: Components And Interfaces → R4
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/mcp/handlers/config-manager.handler.test.ts"]
        covers: ["R4.AC1", "R4.AC2", "R4.AC3"]
  - [x] 2.2 R5 — `delete-project.handler`: `isError:true` nel `catch` + `validateInput(SonarDeleteProjectSchema)`; test (delete fallito → isError; confirm:false → errore); poi build `strict` + suite completa
    - Requirements: `R5.AC1`, `R5.AC2`, `NFR1`, `NFR2`
    - Design: Components And Interfaces → R5
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/mcp/handlers/delete-project.handler.test.ts"]
        covers: ["R5.AC1", "R5.AC2"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
