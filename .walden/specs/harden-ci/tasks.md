---
status: approved
approved_at: 2026-07-06T18:22:24Z
last_modified: 2026-07-06T18:23:18Z
approved_fingerprint: sha256:84f5709965a0dcc13a31e8b735870f023bd6b503bc8b69c13fa55c928ef07ab6
source_design_approved_at: 2026-07-06T18:16:22Z
source_design_fingerprint: sha256:d56ec91d7be18a55634189c8bbf751f3b7a300eed82277ac0c5b896c45c96ea7
---

# Implementation Plan

Modifiche a `.github/workflows/ci.yml` + `package.json`. Nessun codice applicativo. Comandi verificati localmente (la CI gira su GitHub).

- [x] 1. CI sana: `npm ci`, Node 20/22, engines
  - [x] 1.1 In `ci.yml`: `npm install` → `npm ci`, matrix `[18.x, 20.x]` → `[20.x, 22.x]`, aggiornare le condizioni `if` di test (20.x) e coverage/Codecov (22.x); aggiungere `"engines": { "node": ">=20" }` a `package.json` (root) e `packages/core/package.json`
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R1.AC4`, `R3.AC1`, `R3.AC2`
    - Design: Components And Interfaces → build-and-test / engines
    - Verification:
      - command: ["ruby", "-ryaml", "-e", "YAML.load_file('.github/workflows/ci.yml')"]
        covers: ["R3.AC2"]
      - command: ["grep", "-q", "npm ci", ".github/workflows/ci.yml"]
        covers: ["R1.AC1"]
      - command: ["grep", "-q", "18.x", ".github/workflows/ci.yml"]
        expect_exit: 1
        covers: ["R1.AC3"]
      - command: ["sh", "-c", "grep -q '22.x' .github/workflows/ci.yml && grep -q '\"node\": \">=20\"' package.json && grep -q '\"node\": \">=20\"' packages/core/package.json"]
        covers: ["R1.AC2", "R1.AC4"]
      - command: ["sh", "-c", "npm ci"]
        covers: ["R1.AC1"]

- [x] 2. Gate di sicurezza Trivy
  - [x] 2.1 In `ci.yml`: aggiungere il job `security` (`actions/checkout` + `aquasecurity/trivy-action` pinnata con `scan-type: fs`, `scanners: vuln`, `severity: CRITICAL,HIGH`, `ignore-unfixed: true`, `exit-code: 1`, `skip-dirs: packages/core/tests`)
    - Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`, `NFR3`
    - Design: Components And Interfaces → job security
    - Verification:
      - command: ["sh", "-c", "grep -q 'trivy-action' .github/workflows/ci.yml && grep -q 'skip-dirs' .github/workflows/ci.yml && grep -q 'exit-code' .github/workflows/ci.yml"]
        covers: ["R2.AC1", "R2.AC2", "NFR3"]
      - command: ["sh", "-c", "trivy fs --quiet --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --offline-scan --skip-dirs packages/core/tests ."]
        covers: ["R2.AC3"]
