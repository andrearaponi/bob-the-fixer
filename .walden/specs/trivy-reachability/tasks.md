---
status: approved
approved_at: 2026-07-06T17:07:19Z
last_modified: 2026-07-06T17:12:30Z
approved_fingerprint: sha256:e51658a75ed411dc36a1e0899159e6d16106052eb4bf8ba7279c643572dee22d
source_design_approved_at: 2026-07-06T17:06:35Z
source_design_fingerprint: sha256:a2f2ffc9a5e3e4afc562b26fd48857d94f900751e631b568c271ca029513b212
---

# Implementation Plan

Feature additivo: classificatore puro + walker I/O del source + wiring. Costruisce sull'increment 1.

- [x] 1. Classificatore puro `reachability`
  - [x] 1.1 Estendere `IIssue.dependency` (`ecosystem`, `reachability`); creare `src/trivy/reachability.ts` (`classifyReachability(dep, imported)`: npm-only, `imported`/`not-imported`/`unknown`, spoglia la versione dalla `directDependency`) + `src/trivy/reachability.test.ts` (importato; diretta importata; nessuno; non-npm; set vuoto)
    - Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`, `NFR1`
    - Design: Components And Interfaces → classifyReachability
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/trivy/reachability.test.ts"]
        covers: ["R2.AC1", "R2.AC2", "R2.AC3", "NFR1"]

- [x] 2. Walker del source `source-imports`
  - [x] 2.1 Creare `src/trivy/source-imports.ts` (`collectImportedPackages(projectPath)`: walk `.ts/.tsx/.js/.jsx/.mjs/.cjs`, salta `node_modules`/`dist`/`build`/`coverage`/`.git`, cap file, regex import/require, scarta i relativi, normalizza a nome pacchetto; mai throw) + `src/trivy/source-imports.test.ts` (fixture temporanea: estrazione, normalizzazione scope/subpath, skip node_modules, ignora relativi)
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `NFR2`
    - Design: Components And Interfaces → collectImportedPackages
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/trivy/source-imports.test.ts"]
        covers: ["R1.AC1", "R1.AC2", "R1.AC3", "NFR2"]

- [x] 3. Wiring (parser + scanner + report) e parità
  - [x] 3.1 Parser: passare `result.Type` a `mapVulnerability` → `dependency.ecosystem`; `TrivyScanner.scan`: dopo il parse, `collectImportedPackages` una volta e arricchire ogni issue con `classifyReachability`; `formatTrivyReport`: marker reachability; estendere `trivy-report.test.ts`; poi build `strict` + suite completa verde
    - Requirements: `R3.AC1`, `R3.AC2`, `NFR3`, `NFR4`
    - Design: Components And Interfaces → TrivyResultParser / TrivyScanner / formatTrivyReport
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/trivy/trivy-report.test.ts"]
        covers: ["R3.AC2"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
        covers: ["R3.AC1", "NFR3", "NFR4"]
