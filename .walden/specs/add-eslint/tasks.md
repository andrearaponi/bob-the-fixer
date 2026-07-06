---
status: approved
approved_at: 2026-07-06T19:01:27Z
last_modified: 2026-07-06T19:07:04Z
approved_fingerprint: sha256:74ae3239efe20c32eab604ecc44c89a82de7ce2ccd0ff02e570ba55799da9e36
source_design_approved_at: 2026-07-06T19:00:39Z
source_design_fingerprint: sha256:61c9be5e455cb95b3f36c029e6dd1a4d9529f496dab6a9815a9ec449195d51b2
---

# Implementation Plan

Config + script + fix dei 7 → gate lint verde; poi job CI. Override ajv già scoped, dev deps già installate.

- [x] 1. Config, script `lint`, fix dei 7 errori
  - [x] 1.1 Confermare `eslint.config.mjs` (recommended, `no-explicit-any: off`, `no-unused-vars: warn` con ignore `^_`); aggiungere `"lint": "eslint packages/core/src"` al root `package.json`; fixare i 7 errori (`no-require-imports` ×6 → import o disable mirato con motivazione; `no-empty-object-type` ×1) → `npm run lint` esce 0
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R2.AC1`, `R2.AC2`, `R2.AC3`, `NFR3`
    - Design: Components And Interfaces → config / script / fix
    - Verification:
      - command: ["sh", "-c", "grep -q '\"lint\"' package.json && grep -q 'no-explicit-any' eslint.config.mjs && grep -q 'no-unused-vars' eslint.config.mjs"]
        covers: ["R1.AC1", "R1.AC3", "R2.AC2", "NFR3"]
      - command: ["sh", "-c", "npm run lint"]
        covers: ["R1.AC2", "R2.AC1", "R2.AC3"]

- [x] 2. Job CI `lint` e parità
  - [x] 2.1 Aggiungere il job `lint` a `ci.yml` (checkout → setup-node → `npm ci` → `npm run lint`); poi verificare build `strict` + suite completa + gate Trivy verdi
    - Requirements: `R3.AC1`, `NFR1`, `NFR2`
    - Design: Components And Interfaces → job lint
    - Verification:
      - command: ["sh", "-c", "grep -q 'npm run lint' .github/workflows/ci.yml && ruby -ryaml -e \"YAML.load_file('.github/workflows/ci.yml')\""]
        covers: ["R3.AC1"]
      - command: ["sh", "-c", "npm run build && cd packages/core && npx vitest run"]
        covers: ["NFR2"]
      - command: ["sh", "-c", "trivy fs --quiet --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --offline-scan --skip-dirs packages/core/tests ."]
        covers: ["NFR1"]
