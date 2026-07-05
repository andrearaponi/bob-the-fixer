---
status: approved
approved_at: 2026-07-05T13:04:50Z
last_modified: 2026-07-05T13:09:35Z
approved_fingerprint: sha256:42c1b9177f039803d67f8aa8a6d67f7d957e01655f3fb945708abe7c19f42751
source_design_approved_at: 2026-07-05T13:04:11Z
source_design_fingerprint: sha256:ffc6d0e548070f6d22758fe0f7dca818dc476919fecebb0e51522f4d4bb75ac6
---

# Implementation Plan

Estrazione meccanica di 2 range (move-not-rewrite), 11 delegatori, con `projectKey`. `git` come rete di sicurezza.

- [x] 1. Estrarre `SonarMeasureApi` e far delegare il client
  - [x] 1.1 Creare `src/sonar/api/SonarMeasureApi.ts` (costruttore con `AxiosInstance` + `projectKey`) spostando **verbatim** il range A (getComponentDetails, getQualityGateStatus) e il range B (getSecurityHotspots … calculateCoveragePriority); aggiungere `private measureApi` a `SonarQubeClient` (accanto a `issueApi`) e sostituire gli 11 metodi con delegatori (9 return espliciti, 2 inferiti); rimuovere i bodies e i privati `buildHotspotFilterParams`/`calculateCoveragePriority` da `client.ts`
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R3.AC1`, `R3.AC2`, `NFR1`, `NFR2`
    - Design: Components And Interfaces
    - Verification:
      - command: ["grep", "-q", "calculateCoveragePriority", "packages/core/src/sonar/client.ts"]
        expect_exit: 1
        covers: ["R3.AC2"]
      - command: ["grep", "-q", "getToken", "packages/core/src/sonar/api/SonarMeasureApi.ts"]
        expect_exit: 1
        covers: ["R1.AC3"]
      - command: ["sh", "-c", "npm run build"]
        covers: ["R1.AC1", "R1.AC2", "R3.AC1"]

- [x] 2. Test del measure-api e parità
  - [x] 2.1 Aggiungere `src/sonar/api/SonarMeasureApi.test.ts` (axios mockato: getProjectMetrics con projectKey, getSecurityHotspots, getFilesWithDuplication, getTechnicalDebtAnalysis che compone project-metrics); poi build `strict` + suite completa verde
    - Requirements: `R2.AC1`, `R2.AC2`, `NFR3`
    - Design: Testing Strategy
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/sonar/api/SonarMeasureApi.test.ts"]
        covers: ["R2.AC1", "R2.AC2"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
