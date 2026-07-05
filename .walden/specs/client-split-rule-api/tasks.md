---
status: approved
approved_at: 2026-07-05T12:32:42Z
last_modified: 2026-07-05T12:32:42Z
approved_fingerprint: sha256:863fcd8c715271743b42696609b305824a040ab141e633d32a017ea9076d81d2
source_design_approved_at: 2026-07-05T11:49:43Z
source_design_fingerprint: sha256:031c5535805a8e8ba981ce7d2772387bc4bb0e3b6196c779d8f8bd8232529cab
---

# Implementation Plan

Estrazione meccanica di 2 range non contigui (move-not-rewrite). `git` come rete di sicurezza.

- [ ] 1. Estrarre `SonarRuleApi` e far delegare il client
  - [ ] 1.1 Creare `src/sonar/api/SonarRuleApi.ts` (costruttore con `AxiosInstance`, campo `ruleCache` + `RULE_CACHE_TTL`) spostando **verbatim** `getRuleDetails`+`getRulesSearch` (range 1) e `getUniqueRulesInfo` (range 2); aggiungere `private ruleApi` a `SonarQubeClient` (accanto a `sourceFetcher`) e trasformare i 3 metodi in delegatori; rimuovere i bodies e `ruleCache`/`RULE_CACHE_TTL` da `client.ts`
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R3.AC1`, `R3.AC2`, `NFR1`, `NFR2`
    - Design: Components And Interfaces
    - Verification:
      - command: ["grep", "-q", "async getUniqueRulesInfo", "packages/core/src/sonar/client.ts"]
        expect_exit: 1
        covers: ["R3.AC2"]
      - command: ["grep", "-qE", "projectKey|getToken", "packages/core/src/sonar/api/SonarRuleApi.ts"]
        expect_exit: 1
        covers: ["R1.AC3"]
      - command: ["sh", "-c", "npm run build"]
        covers: ["R1.AC1", "R1.AC2", "R3.AC1"]

- [ ] 2. Test del rule-api e parità
  - [ ] 2.1 Aggiungere `src/sonar/api/SonarRuleApi.test.ts` (axios mockato: getRuleDetails + cache hit, getRulesSearch, getUniqueRulesInfo aggrega via getRuleDetails); poi build `strict` + suite completa verde
    - Requirements: `R2.AC1`, `R2.AC2`, `NFR3`
    - Design: Testing Strategy
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/sonar/api/SonarRuleApi.test.ts"]
        covers: ["R2.AC1", "R2.AC2"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
