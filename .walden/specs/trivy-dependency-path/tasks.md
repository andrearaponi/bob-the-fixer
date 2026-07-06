---
status: approved
approved_at: 2026-07-06T13:55:25Z
last_modified: 2026-07-06T14:03:10Z
approved_fingerprint: sha256:94e876cd12b47ce792be388ef80694de34fd80aaa84309dca5a53029f0d90464
source_design_approved_at: 2026-07-06T13:54:37Z
source_design_fingerprint: sha256:d03d1699e14d53e9178d0667a7e87591d95c8c13d42e3ed3bbe6c921a696b79b
---

# Implementation Plan

Feature additivo: nuovo modulo grafo puro + wiring in parser/scanner/report. Fixture derivata dal JSON Trivy 0.69.1 reale.

- [x] 1. Modulo `DependencyGraph` (puro)
  - [x] 1.1 Creare `src/trivy/dependency-graph.ts` (tipo `TrivyPackage`, classe `DependencyGraph` con `pathTo(pkgId)`: BFS dalle direct/root su `DependsOn`, visited-set, path più corto, `directDependency`, `relationship`) + `src/trivy/dependency-graph.test.ts` (diretta→singolo; transitivo→più corto; ciclo→termina; irraggiungibile→`unknown`; scelta più corta)
    - Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`, `R2.AC4`, `NFR1`, `NFR3`
    - Design: Components And Interfaces → DependencyGraph
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/trivy/dependency-graph.test.ts"]
        covers: ["R2.AC1", "R2.AC2", "R2.AC3", "R2.AC4", "NFR1", "NFR3"]

- [x] 2. Wiring: IIssue + parser + scanner
  - [x] 2.1 Estendere `IIssue.dependency` (`path`/`directDependency`/`relationship`); estendere `trivy-parser` (`TrivyVulnerability.PkgID`, `TrivyPackage`, `TrivyResult.Packages`, costruire il grafo per Result e attaccare il path); aggiungere `--list-all-pkgs` in `TrivyScanner`; estendere `trivy-parser.test.ts` (fixture con `Packages`→path; senza→fallback piatto)
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R3.AC1`
    - Design: Components And Interfaces → TrivyResultParser / TrivyScanner
    - Verification:
      - command: ["grep", "-q", "list-all-pkgs", "packages/core/src/trivy/TrivyScanner.ts"]
        covers: ["R1.AC1"]
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/trivy/trivy-parser.test.ts"]
        covers: ["R1.AC2", "R1.AC3", "R3.AC1"]

- [x] 3. Report e parità
  - [x] 3.1 Estendere `formatTrivyReport` (riga `Via:` per le indirette, nessuna per le dirette) + `trivy-report.test.ts`; poi build `strict` + suite completa verde
    - Requirements: `R3.AC2`, `NFR2`, `NFR4`
    - Design: Components And Interfaces → formatTrivyReport
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/trivy/trivy-report.test.ts"]
        covers: ["R3.AC2"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
        covers: ["NFR2", "NFR4"]
