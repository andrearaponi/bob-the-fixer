---
status: approved
approved_at: 2026-07-05T11:33:20Z
last_modified: 2026-07-05T11:36:17Z
approved_fingerprint: sha256:f7622b674812aad7d5f7ea42433eb5c40710e345d138bbc186a5093ac64ac939
source_design_approved_at: 2026-07-05T11:28:23Z
source_design_fingerprint: sha256:8344cfc3c3212b329d0622c6e1192328dcdfac356fd9c9ca35dbeb35171543ec
---

# Implementation Plan

Estrazione meccanica (move-not-rewrite). `git` come rete di sicurezza.

- [x] 1. Estrarre `SonarSourceFetcher` e far delegare il client
  - [x] 1.1 Creare `src/sonar/api/SonarSourceFetcher.ts` (costruttore con `AxiosInstance`, campo `rawSourceLinesCache`) spostando **verbatim** `getSourceContext`/`getSourceLines`/`getSourceLinesFromIndex`/`getRawFileLines`; aggiungere `private sourceFetcher` a `SonarQubeClient` e trasformare `getSourceContext`/`getSourceLines` in delegatori; rimuovere i metodi spostati e la cache da `client.ts`
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R3.AC1`, `R3.AC2`, `NFR1`, `NFR2`
    - Design: Components And Interfaces
    - Verification:
      - command: ["grep", "-q", "getRawFileLines", "packages/core/src/sonar/client.ts"]
        expect_exit: 1
        covers: ["R3.AC2"]
      - command: ["grep", "-qE", "projectKey|getToken", "packages/core/src/sonar/api/SonarSourceFetcher.ts"]
        expect_exit: 1
        covers: ["R1.AC3"]
      - command: ["sh", "-c", "npm run build"]
        covers: ["R1.AC1", "R1.AC2", "R3.AC1"]

- [x] 2. Test del fetcher e parità
  - [x] 2.1 Aggiungere `src/sonar/api/SonarSourceFetcher.test.ts` (axios mockato: index-endpoint, fallback raw, cache, best-effort); poi build `strict` + suite completa verde
    - Requirements: `R2.AC1`, `R2.AC2`, `NFR3`
    - Design: Testing Strategy
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/sonar/api/SonarSourceFetcher.test.ts"]
        covers: ["R2.AC1", "R2.AC2"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
