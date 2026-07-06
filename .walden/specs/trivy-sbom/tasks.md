---
status: approved
approved_at: 2026-07-06T17:44:44Z
last_modified: 2026-07-06T17:48:51Z
approved_fingerprint: sha256:84e137e678fb41b93d17083f15a1eb131a3ffdf33e67f1d0939fe8de9c46738d
source_design_approved_at: 2026-07-06T17:44:09Z
source_design_fingerprint: sha256:f699373c259dc83f6e2fe8a9fab176cda78fb3c33e7a99b826ddde4df6e4645d
---

# Implementation Plan

Nuovo tool MCP additivo: modulo `generateSbom` + handler + registrazione (24° tool). Trivy mockato nei test.

- [x] 1. Modulo `generateSbom`
  - [x] 1.1 Esportare `INSTALL_HINT` da `TrivyScanner`; creare `src/trivy/sbom.ts` (`generateSbom({projectPath, format?, outputPath?})`: whitelist formato con throw pre-esecuzione, `execFile` no-shell, default cyclonedx + path, scrittura file, parse component-count con degradazione, `INSTALL_HINT` su ENOENT) + `src/trivy/sbom.test.ts` (`execFile` mockato: cyclonedx→file+count da components; spdx-json→count da packages; formato non valido→throw; ENOENT→hint; JSON rotto→riepilogo senza count)
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R1.AC4`, `R2.AC1`, `R2.AC3`, `NFR1`
    - Design: Components And Interfaces → generateSbom
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/trivy/sbom.test.ts"]
        covers: ["R1.AC1", "R1.AC2", "R1.AC3", "R1.AC4", "R2.AC1", "R2.AC3", "NFR1"]

- [x] 2. Handler, registrazione e parità
  - [x] 2.1 Creare `src/mcp/handlers/trivy-sbom.handler.ts` (riepilogo testuale) + test; registrare `trivy_generate_sbom` in `ToolRouter` (`toolRoutes`) e in `tool-definitions.ts`; aggiornare `ToolRouter.test.ts` (23→24); poi build `strict` + suite completa verde
    - Requirements: `R2.AC2`, `R3.AC1`, `R3.AC2`, `NFR3`
    - Design: Components And Interfaces → handler / Router
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/mcp/handlers/trivy-sbom.handler.test.ts src/mcp/ToolRouter.test.ts"]
        covers: ["R2.AC2", "R3.AC1", "R3.AC2"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
        covers: ["NFR3"]
