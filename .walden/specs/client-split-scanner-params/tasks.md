---
status: approved
approved_at: 2026-07-05T09:47:01Z
last_modified: 2026-07-05T09:55:12Z
approved_fingerprint: sha256:ebda77a029f1ee07ddd304d3e19a8676341c57d06162e51a556d1b8b6afda844
source_design_approved_at: 2026-07-05T09:45:10Z
source_design_fingerprint: sha256:4161d6cd113786f08c47312aeb7c0e0ec9dff65aee972c87227127439e1625de
---

# Implementation Plan

Estrazione meccanica (move-not-rewrite). Build `strict` + suite completa verdi a ogni passo. `git` come rete di sicurezza (client.ts è committato).

- [x] 1. Estrarre `ScannerParameterBuilder` e far delegare il client
  - [x] 1.1 Creare `src/sonar/scanner/ScannerParameterBuilder.ts` spostando **verbatim** i ~30 metodi del cluster (Java/JS/Python/Go/C++, detection, Maven/Gradle libraries) + copia privata di `fileExists`; aggiungere `private paramBuilder` a `SonarQubeClient` e far delegare `buildLanguageSpecificParams`; rimuovere i metodi spostati da `client.ts`
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R3.AC1`, `R4.AC1`, `R4.AC2`, `NFR1`, `NFR2`
    - Design: Components And Interfaces → `ScannerParameterBuilder`, `SonarQubeClient` (delega)
    - Verification:
      - command: ["grep", "-q", "detectJavaVersionFromPom", "packages/core/src/sonar/client.ts"]
        expect_exit: 1
        covers: ["R3.AC1"]
      - command: ["grep", "-rqE", "axios|getToken|projectKey", "packages/core/src/sonar/scanner/ScannerParameterBuilder.ts"]
        expect_exit: 1
        covers: ["R1.AC3"]
      - command: ["sh", "-c", "npm run build"]
        covers: ["R1.AC1", "R1.AC2", "R4.AC1"]

- [x] 2. Migrare i test di detection al builder
  - [x] 2.1 Ri-orientare i 7 file `tests/sonar/*.test.ts` da `new SonarQubeClient(...)` a `new ScannerParameterBuilder(projectContext)` (stesse asserzioni sui metodi di detection)
    - Requirements: `R2.AC1`, `R2.AC2`, `NFR3`
    - Design: Testing Strategy
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run tests/sonar"]
        covers: ["R2.AC1", "R2.AC2"]

- [x] 3. Verifica riduzione e parità finale
  - [x] 3.1 Confermare la riduzione di `client.ts` (metodi del cluster rimossi) e la parità: build `strict` + suite completa verde
    - Requirements: `R3.AC2`, `R4.AC1`
    - Design: Verification Plan
    - Verification:
      - command: ["grep", "-q", "addMavenLibraries", "packages/core/src/sonar/client.ts"]
        expect_exit: 1
        covers: ["R3.AC2"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
        covers: ["R4.AC1", "R4.AC2", "R3.AC2"]
