---
status: approved
approved_at: 2026-07-05T09:23:48Z
last_modified: 2026-07-05T09:30:24Z
approved_fingerprint: sha256:cd6843a209e5dffba8ed81a04327d53214962e3f1c428c44d7bbbe32f2f64e96
source_design_approved_at: 2026-07-05T09:21:16Z
source_design_fingerprint: sha256:9170602dddf963a1d57bc9a55e1501d96924bcd82069a95bc9596bb5c22e6ab3
---

# Implementation Plan

Sequenza: prima il parser puro (offline, con fixture), poi lo scanner (execFile), poi i tool MCP + wiring, infine la verifica Open-Closed. Build `strict` + suite verdi a ogni passo.

- [x] 1. Parser Trivy puro (testabile offline)
  - [x] 1.1 Aggiungere una fixture JSON rappresentativa (`tests/fixtures/trivy-fs-report.json`) e implementare `TrivyResultParser` (`src/trivy/trivy-parser.ts`): mappa `Results[].Vulnerabilities[]` in `IIssue[]` (DEPENDENCY_VULN, source trivy, `dependency`, `remediation.fixedVersion`, severità normalizzata, CVE come `ruleId`) e costruisce `IScanResult`; test sul mapping dalla fixture
    - Requirements: `R1.AC3`, `R2.AC1`, `R2.AC2`, `R2.AC3`, `NFR1`, `NFR4`
    - Design: Components And Interfaces → `TrivyResultParser`; Data Models
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/trivy/trivy-parser.test.ts"]
        covers: ["R1.AC3", "R2.AC1", "R2.AC2", "R2.AC3"]

- [x] 2. TrivyScanner (wrapper execFile)
  - [x] 2.1 Implementare `TrivyScanner` (`src/trivy/TrivyScanner.ts`) come `IScanner` (`name='trivy'`, `type='sca'`): `scan()` via `execFile('trivy', ['fs','--quiet','--format','json','--scanners','vuln', path])` + parser; `checkHealth()` via `trivy --version`; test con `execFile` mockato (scan ok, `ENOENT`→unavailable/errore actionable, exit≠0→errore)
    - Requirements: `R1.AC1`, `R1.AC2`, `R5.AC1`, `R5.AC2`, `R6.AC1`, `R6.AC2`, `R6.AC3`, `NFR2`, `NFR3`
    - Design: Components And Interfaces → `TrivyScanner`; Error Handling; Security Considerations
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/trivy/TrivyScanner.test.ts"]
        covers: ["R1.AC1", "R1.AC2", "R5.AC1", "R5.AC2", "R6.AC1", "R6.AC2", "R6.AC3"]

- [x] 3. Superficie MCP: formatter, handler e wiring
  - [x] 3.1 Implementare il formatter fix-ready (`src/trivy/trivy-report.ts`): `IScanResult` → testo (`PkgName installed → fixed`, severità, CVE, link, remediation); test
    - Requirements: `R4.AC1`
    - Design: Components And Interfaces → Fix-ready formatter
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/trivy/trivy-report.test.ts"]
        covers: ["R4.AC1"]
  - [x] 3.2 Aggiungere gli handler `trivy_scan_dependencies` e `trivy_check_installation` (risolvono `TrivyScanner` via `ScannerRegistry`), registrarli in `toolRoutes` e `tool-definitions.ts`, aggiornare `ToolRouter.test.ts` (23 tool); test degli handler
    - Requirements: `R4.AC1`, `R4.AC2`, `R3.AC1`
    - Design: Components And Interfaces → handler Trivy; Architecture
    - Verification:
      - command: ["grep", "-q", "trivy_scan_dependencies", "packages/core/src/mcp/ToolRouter.ts"]
        covers: ["R3.AC1", "R4.AC1"]
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/mcp/handlers/trivy-scan.handler.test.ts src/mcp/handlers/trivy-check.handler.test.ts src/mcp/ToolRouter.test.ts"]
        covers: ["R4.AC1", "R4.AC2"]

- [x] 4. Verifica Open-Closed e finale
  - [x] 4.1 Confermare che il path SonarQube è **invariato** (diff vuoto su `ScanOrchestrator`, `scan.handler`, `SonarQubeScanner`), poi build `strict` + suite completa verde
    - Requirements: `R3.AC2`
    - Design: Architecture (confini); Verification Plan
    - Verification:
      - command: ["git", "diff", "--quiet", "HEAD", "--", "packages/core/src/core/scanning/ScanOrchestrator.ts", "packages/core/src/mcp/handlers/scan.handler.ts", "packages/core/src/sonar/scanner/SonarQubeScanner.ts"]
        expect_exit: 0
        covers: ["R3.AC2"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
        covers: ["R3.AC2"]
