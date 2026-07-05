---
status: approved
approved_at: 2026-07-05T10:15:27Z
last_modified: 2026-07-05T10:15:27Z
approved_fingerprint: sha256:64b22a0e111eaa8383f577ffcfe4dc8b3a12536a75b7b13e5e1f82f6de1ef893
source_requirements_approved_at: 2026-07-05T10:12:24Z
source_requirements_fingerprint: sha256:727a3d43a67cc7ada55e23dd0cd025020f2feb8f8dada6200153890e64618c92
---

# Feature Design

## Overview

Tre interventi cosmetici indipendenti, nessun cambiamento di comportamento:
1. **Rimozione artefatto**: `git rm -r packages/core/html` + `packages/core/html/` in `.gitignore`.
2. **Branding**: sostituire i residui "SonarGuard"/"Bob the Builder" con "Bob the Fixer" nelle stringhe di report/banner e nel nome della classe server; aggiornare le asserzioni dei test corrispondenti.
3. **Description tool**: rimuovere il prefisso `[EN] ` dalle 23 description in `tool-definitions.ts`.

La parità è garantita dalla suite completa verde (solo stringhe/artefatti/nomi cambiano).

## Architecture

Nessun cambiamento architetturale: si tocca solo la superficie testuale (stringhe di report/banner, description dei tool), il nome di una classe (con i suoi riferimenti), e il tracking git di un artefatto. Flusso runtime, moduli e dipendenze restano identici.

## Options Considered

### Option A — Sostituzioni mirate string-by-string (SCELTA)

- Summary: editare i punti noti (report strings + classe + `[EN]`), aggiornare i test che asseriscono quelle stringhe.
- Why chosen: le occorrenze sono poche e localizzate (verificate); un intervento mirato è più sicuro di una sostituzione globale cieca.

### Option B — `sed` globale su tutto il repo

- Summary: sostituzione automatica di ogni "SonarGuard"/"Bob the Builder".
- Why rejected: rischio di toccare stringhe non previste o commenti; preferibile la precisione mirata su file noti.

## Simplicity And Elegance Review

- Simplest viable shape: sostituzioni mirate sui pochi file noti invece di un `sed` globale cieco.
- Coupling check: nessun accoppiamento nuovo; si rimuove l'alias legacy della classe (export diretto).
- Future-proofing: branding coerente riduce la confusione; nessun debito introdotto.

## Components And Interfaces

### Rimozione `packages/core/html/`

- Purpose: eliminare il report Vitest UI dal tracking.
- Azione: `git rm -r packages/core/html`; aggiungere `packages/core/html/` a `.gitignore`.
- Requirements: `R1.AC1`, `R1.AC2`

### Rebranding stringhe (src)

- Purpose: nome prodotto attuale nelle stringhe user-facing.
- File: `core/admin/DiagnosticsService.ts` ("SONARGUARD PERMISSION DIAGNOSTICS"), `core/project/ProjectSetup.ts` ("SONARGUARD ALREADY CONFIGURED", "BOB THE BUILDER AUTO-SETUP"), `core/project/ConfigManager.ts` ("SONARGUARD CONFIGURATION"), `reports/comprehensive-report.ts` ("SONARGUARD COMPREHENSIVE QUALITY REPORT") → "BOB THE FIXER ...".
- Classe: `universal/universal-mcp-server.ts` — `UniversalBobTheBuilderMCPServer` → `UniversalBobTheFixerMCPServer` (export diretto, rimosso l'alias legacy; aggiornato `main()`).
- Test da aggiornare: `DiagnosticsService.test.ts`, `ProjectSetup.test.ts`, `ConfigManager.test.ts` (asserzioni sulle stringhe).
- `.env.example`: `SONAR_PROJECT_KEY_PREFIX=sonarguard` (var di solo esempio, non usata a runtime) → valore attuale.
- Requirements: `R2.AC1`, `R2.AC2`, `R3.AC2`, `R3.AC3`

### Description tool

- Purpose: togliere `[EN] ` dalle description.
- File: `mcp/tool-definitions.ts` (23 occorrenze).
- Requirements: `R2.AC3`

## Data Models

Nessuno.

## Error Handling

Nessun cambiamento (solo stringhe).

## Failure Modes And Tradeoffs

- Failure mode: rinominare una stringa che è in realtà un identificatore funzionale.
  - Mitigation: verificato che le occorrenze sono cosmetiche (report/banner/classe); `SONAR_PROJECT_KEY_PREFIX` non è usato a runtime (**R3.AC3**).
  - Tradeoff: nessuno.

## Testing Strategy

- Aggiornare le asserzioni dei 3 test che verificano le stringhe di branding.
- Suite completa verde → parità (**R3.AC1/AC2**).

## Verification Plan

- **R1**: `git ls-files packages/core/html` vuoto; `packages/core/html` in `.gitignore`.
- **R2**: grep no "SonarGuard"/"Bob the Builder"/`[EN]` nel sorgente (non-test) e nelle description.
- **R3**: build `strict` + suite completa verdi.

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `git rm` html + `.gitignore` |
| `R2` | Rebranding stringhe/classe + rimozione `[EN]` |
| `R3` | Parità: test aggiornati + suite verde; guardrail su identificatori funzionali |
| `NFR1` | build `strict` |
| `NFR2` | nessun identificatore/config funzionale toccato |
