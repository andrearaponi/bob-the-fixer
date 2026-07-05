---
status: approved
approved_at: 2026-07-05T10:20:13Z
last_modified: 2026-07-05T10:22:06Z
approved_fingerprint: sha256:6b6c9348d0f2ef00db57b16a0fb6bfb9319851b7d7834291fb679384218b4c79
source_design_approved_at: 2026-07-05T10:15:27Z
source_design_fingerprint: sha256:64b22a0e111eaa8383f577ffcfe4dc8b3a12536a75b7b13e5e1f82f6de1ef893
---

# Implementation Plan

Interventi cosmetici. Build `strict` + suite completa verdi alla fine.

- [x] 1. Rimuovere l'artefatto Vitest UI committato
  - [x] 1.1 `git rm -r packages/core/html` e aggiungere `packages/core/html/` a `.gitignore`
    - Requirements: `R1.AC1`, `R1.AC2`
    - Design: Components And Interfaces → Rimozione `packages/core/html/`
    - Verification:
      - command: ["sh", "-c", "test -z \"$(git ls-files packages/core/html)\" && grep -q 'packages/core/html' .gitignore"]
        covers: ["R1.AC1", "R1.AC2"]

- [x] 2. Rebranding stringhe/classe, rimozione `[EN]`, aggiornamento test
  - [x] 2.1 Sostituire "SONARGUARD"/"BOB THE BUILDER" → "BOB THE FIXER" nelle stringhe di report/banner; rinominare la classe in `UniversalBobTheFixerMCPServer` (export diretto); togliere `[EN] ` dalle 23 description; aggiornare `.env.example`; aggiornare le asserzioni dei 3 test
    - Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`, `R3.AC1`, `R3.AC2`, `R3.AC3`, `NFR1`, `NFR2`
    - Design: Components And Interfaces → Rebranding stringhe, Description tool; Testing Strategy
    - Verification:
      - command: ["grep", "-rqiE", "sonarguard|bobthebuilder|bob the builder", "packages/core/src", "--include=*.ts"]
        expect_exit: 1
        covers: ["R2.AC1", "R2.AC2"]
      - command: ["grep", "-q", "\\[EN\\]", "packages/core/src/mcp/tool-definitions.ts"]
        expect_exit: 1
        covers: ["R2.AC3"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
        covers: ["R3.AC1", "R3.AC2", "R3.AC3"]
