---
status: approved
approved_at: 2026-07-05T12:49:27Z
last_modified: 2026-07-05T12:51:45Z
approved_fingerprint: sha256:8f25eaa7f5f93cab3648b8ac78050a1d4ad9c9870339d8afabb2bf2daf98a4a6
source_design_approved_at: 2026-07-05T12:45:28Z
source_design_fingerprint: sha256:ef5fcc4c12d832e88330902bce69aabb0b9935d75039f667b6877c23dd88f0ca
---

# Implementation Plan

Estrazione meccanica di 2 range (move-not-rewrite), con `projectKey` nel costruttore. `git` come rete di sicurezza.

- [x] 1. Estrarre `SonarIssueApi` e far delegare il client
  - [x] 1.1 Creare `src/sonar/api/SonarIssueApi.ts` (costruttore con `AxiosInstance` + `projectKey`) spostando **verbatim** i 4 metodi issue (range 1: 602-790) e `buildFilterParams` (range 2: 942-954); aggiungere `private issueApi` a `SonarQubeClient` (accanto a `ruleApi`, costruito con `this.client, this.projectKey`) e trasformare i 4 metodi in delegatori; rimuovere i bodies e `buildFilterParams` da `client.ts`
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R3.AC1`, `R3.AC2`, `NFR1`, `NFR2`
    - Design: Components And Interfaces
    - Verification:
      - command: ["grep", "-q", "buildFilterParams", "packages/core/src/sonar/client.ts"]
        expect_exit: 1
        covers: ["R3.AC2"]
      - command: ["grep", "-q", "getToken", "packages/core/src/sonar/api/SonarIssueApi.ts"]
        expect_exit: 1
        covers: ["R1.AC3"]
      - command: ["sh", "-c", "npm run build"]
        covers: ["R1.AC1", "R1.AC2", "R3.AC1"]

- [x] 2. Test dell'issue-api e parità
  - [x] 2.1 Aggiungere `src/sonar/api/SonarIssueApi.test.ts` (axios mockato: getIssues con projectKey come componentKeys + cap 10k, getIssueByKey, getProjectTestFiles); poi build `strict` + suite completa verde
    - Requirements: `R2.AC1`, `R2.AC2`, `NFR3`
    - Design: Testing Strategy
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/sonar/api/SonarIssueApi.test.ts"]
        covers: ["R2.AC1", "R2.AC2"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
