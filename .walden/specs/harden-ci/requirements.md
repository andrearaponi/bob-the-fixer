---
status: approved
approved_at: 2026-07-06T18:14:40Z
last_modified: 2026-07-06T18:14:40Z
approved_fingerprint: sha256:f7fb96bdea2ca8da536fd44923aa90f9574363c88ac6c32b8c7b07c2747e0144
---

# Requirements Document

## Introduction

Rafforzare la CI GitHub Actions esistente (`.github/workflows/ci.yml`), blocco 1+2 del punto 7. Due obiettivi: (1) **CI sana** — install riproducibile e versioni Node supportate; (2) **gate di sicurezza** — uno scan Trivy delle dipendenze che fallisce la build su vulnerabilità HIGH/CRITICAL fixabili, così Bob mangia il proprio dogfood e blocca la reintroduzione di dipendenze vulnerabili. La CI gira su GitHub (fuori dalla portata locale): ogni comando che la CI eseguirà è **verificato localmente** (npm ci, il comando del gate Trivy, validità YAML).

## Requirements

### R1 Install riproducibile e Node supportato

**User Story:** Come manutentore, voglio build riproducibili su Node supportati, così da non avere "verde per finta" o rotture da versioni EOL.

#### Acceptance Criteria

1. `R1.AC1` The CI SHALL install dependencies with `npm ci` (lockfile-exact) instead of `npm install`.
2. `R1.AC2` The CI Node matrix SHALL include only supported versions (Node ≥ 20).
3. `R1.AC3` The CI Node matrix SHALL NOT include the EOL Node 18.
4. `R1.AC4` The package manifest SHALL declare `engines.node` consistent with the CI matrix.

### R2 Gate di sicurezza delle dipendenze

**User Story:** Come manutentore, voglio che la CI blocchi le dipendenze vulnerabili, così da non regredire dopo aver chiuso 63 vuln.

#### Acceptance Criteria

1. `R2.AC1` The CI SHALL run a Trivy filesystem dependency scan of the project's real dependencies.
2. `R2.AC2` The security gate SHALL exclude the intentionally-vulnerable test fixtures (under `packages/core/tests`), so it reflects only real dependencies.
3. `R2.AC3` IF the scan finds a fixable HIGH or CRITICAL vulnerability, THEN the CI SHALL fail (non-zero exit).

### R3 Preservare la pipeline esistente

**User Story:** Come manutentore, voglio che build/test/coverage restino, così da non perdere copertura.

#### Acceptance Criteria

1. `R3.AC1` The change SHALL preserve the existing build, test, and coverage steps (and Codecov upload).
2. `R3.AC2` The workflow SHALL remain valid GitHub Actions YAML.

## Non-Functional Requirements

- `NFR1` The workflow SHALL NOT leak secrets in logs (no echo of tokens; the security gate needs no secret).
- `NFR2` The separate `validate-walden.yml` workflow SHALL be left untouched.
- `NFR3` The security gate SHALL be reproducible: pinned action version and explicit severity/exit-code, not defaults that can drift.

## Constraints And Dependencies

- `C1` CI su GitHub Actions; Trivy via l'action ufficiale `aquasecurity/trivy-action` (scarica il DB in CI).
- `C2` Comando gate verificato localmente: `trivy fs --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --skip-dirs packages/core/tests .` → exit 0 oggi (deps reali pulite), exit 1 se una vuln fixabile viene reintrodotta; senza `--skip-dirs` fallirebbe per le fixture (verificato).
- `C3` `ignore-unfixed`: il gate fallisce solo su vuln con fix disponibile (evita rossi permanenti su vuln non risolvibili).
- `C4` La CI stessa gira su GitHub; la verifica locale copre i singoli comandi, non l'esecuzione GitHub Actions end-to-end.

## Out Of Scope

- ESLint / lint gate (blocco successivo del punto 7).
- Strategia E2E-in-CI (richiede indagine su servizi Sonar).
- CHANGELOG e automazione delle release.
