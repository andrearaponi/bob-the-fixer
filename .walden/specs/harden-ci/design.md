---
status: approved
approved_at: 2026-07-06T18:16:22Z
last_modified: 2026-07-06T18:16:22Z
approved_fingerprint: sha256:d56ec91d7be18a55634189c8bbf751f3b7a300eed82277ac0c5b896c45c96ea7
source_requirements_approved_at: 2026-07-06T18:14:40Z
source_requirements_fingerprint: sha256:f7fb96bdea2ca8da536fd44923aa90f9574363c88ac6c32b8c7b07c2747e0144
---

# Feature Design

## Overview

Modifiche a `.github/workflows/ci.yml` e a `package.json`. Il job `build-and-test` passa a `npm ci`, matrix Node `[20.x, 22.x]`, con test/coverage aggiornati; si aggiunge un job `security` parallelo che esegue il gate Trivy (fail su HIGH/CRITICAL fixabili, escludendo le fixture). I manifest dichiarano `engines.node`. Nessun impatto su `validate-walden.yml`.

## Architecture

```text
  push / PR (main, develop)
        ├── job build-and-test  (matrix 20.x, 22.x)
        │     checkout → setup-node(cache npm) → npm ci → build
        │     → test (20.x) / coverage+codecov (22.x)
        └── job security  (ubuntu-latest)
              checkout → trivy-action(fs, vuln, HIGH/CRITICAL, ignore-unfixed,
              exit-code 1, skip-dirs packages/core/tests)  → fail se vuln fixabile
```

## Options Considered

### Option A — Gate Trivy come job separato + trivy-action ufficiale (SCELTA)

- Summary: un job `security` indipendente, `aquasecurity/trivy-action` pinnata, con gli input che mappano il comando verificato localmente.
- Why chosen: segnale di sicurezza isolato (non intreccia con build/test), gira in parallelo, l'action gestisce il download del DB; input espliciti = riproducibile (`NFR3`).

### Option B — Step Trivy dentro build-and-test

- Summary: aggiungere lo scan come step del job esistente, ripetuto sulla matrix.
- Why rejected: girerebbe N volte (una per versione Node) senza motivo, e mischia il gate sicurezza col build.

## Simplicity And Elegance Review

- Simplest viable shape: modifiche minime a un workflow esistente + un job aggiuntivo; nessun codice applicativo toccato.
- Coupling check: il gate sicurezza è un job separato (non intreccia build/test); `engines` nei manifest, non hardcoded altrove.
- Future-proofing: ESLint e strategia E2E restano blocchi successivi, agganciabili come job ulteriori senza rifare questo.

## Components And Interfaces

### `ci.yml` — job `build-and-test`

- `strategy.matrix.node-version`: `[18.x, 20.x]` → `[20.x, 22.x]` (`R1.AC2`, `R1.AC3`).
- Step install: `npm install` → `npm ci` (`R1.AC1`).
- Step test: `if: matrix.node-version == '20.x'`; step coverage + Codecov: `if: matrix.node-version == '22.x'` (`R3.AC1`).
- Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R3.AC1`

### `ci.yml` — nuovo job `security`

- `runs-on: ubuntu-latest`; steps: `actions/checkout@v4` → `aquasecurity/trivy-action@<pin>` con:
  - `scan-type: fs`, `scan-ref: .`, `scanners: vuln`, `severity: CRITICAL,HIGH`, `ignore-unfixed: true`, `exit-code: 1`, `skip-dirs: packages/core/tests`.
- Equivale al comando verificato: `trivy fs --scanners vuln --severity CRITICAL,HIGH --ignore-unfixed --exit-code 1 --skip-dirs packages/core/tests .` (`R2.AC1`, `R2.AC2`, `R2.AC3`, `NFR3`).
- Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`

### `package.json` (root + `packages/core`) — `engines`

- Aggiungere `"engines": { "node": ">=20" }` coerente con la matrix (`R1.AC4`).
- Requirements: `R1.AC4`

## Data Models

n/a (config CI + manifest).

## Error Handling

- Gate: `exit-code: 1` → build rossa su vuln fixabile (`R2.AC3`). `ignore-unfixed: true` evita rossi permanenti su vuln senza fix (`C3`).
- `npm ci` fallisce se il lockfile è fuori sync (comportamento voluto: intercetta la deriva).

## Security Considerations

`NFR1`: il gate non richiede secret; nessun echo di token. Il DB Trivy è scaricato dall'action. `NFR3`: action pinnata a una versione, input espliciti (niente default che possono cambiare).

## Failure Modes And Tradeoffs

- Failure mode: tag dell'action inesistente/spostato → job rosso su GitHub (non verificabile localmente, `C4`).
  - Mitigation: pin a una versione rilasciata nota; documentato che il tag va confermato.
- Failure mode: `--skip-dirs` non escludesse le fixture → gate rosso permanente.
  - Mitigation: scoping **verificato localmente** (exit 0 con skip, exit 1 senza).
- Tradeoff: `ignore-unfixed` non blocca vuln senza fix (accettato: non azionabili; restano visibili nel report Trivy).

## Testing Strategy

- Verifica locale (la CI gira su GitHub, `C4`):
  - `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` → YAML valido (`R3.AC2`).
  - `npm ci` in locale → install riproducibile OK (lockfile in sync, `R1.AC1`).
  - comando gate Trivy → exit 0 oggi (`R2.AC1`/`R2.AC2`); già dimostrato exit 1 senza skip.
  - grep: `ci.yml` contiene `npm ci`, `20.x`/`22.x`, il job `security`; `package.json` contiene `engines`.

## Verification Plan

- Requirement proof: grep sui file + YAML load + `npm ci` locale + comando gate locale.
- Test evidence: la suite unit resta verde (nessun codice toccato); i comandi CI verificati singolarmente.
- Operational evidence: l'esito reale su GitHub Actions è visibile alla prima push (fuori CI locale, `C4`).

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `npm ci` + matrix 20/22 + `engines.node` |
| `R2` | job `security` (trivy-action, severity/exit-code/skip-dirs) |
| `R3` | build/test/coverage/Codecov preservati + YAML valido |
| `NFR1` | nessun secret nel gate |
| `NFR2` | `validate-walden.yml` intatto |
| `NFR3` | action pinnata + input espliciti |
