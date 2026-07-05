---
status: approved
approved_at: 2026-07-05T10:12:24Z
last_modified: 2026-07-05T10:12:24Z
approved_fingerprint: sha256:727a3d43a67cc7ada55e23dd0cd025020f2feb8f8dada6200153890e64618c92
---

# Requirements Document

## Introduction

Pulizia di igiene del repository, tutta **cosmetica e a rischio zero** (nessun cambiamento di comportamento): (1) rimuovere il report della Vitest UI committato per errore in `packages/core/html/` (~824KB, non referenziato da codice runtime — verificato); (2) allineare il branding nelle stringhe user-facing (i residui **"SonarGuard"** e **"Bob the Builder"** → **"Bob the Fixer"**, incluso il nome della classe server); (3) rimuovere il tag artefatto **`[EN]`** dalle 23 description dei tool MCP (finisce nel testo visto dall'LLM).

Le occorrenze da rinominare sono state verificate come **cosmetiche** (header di report, banner, nome classe) — nessun identificatore funzionale o chiave di configurazione usata a runtime.

<!-- assumed: target di branding = "Bob the Fixer" / "BOB THE FIXER". `.env.example` (SONAR_PROJECT_KEY_PREFIX=sonarguard) è un valore di esempio, non un default funzionale. -->

## Requirements

### R1 Rimuovere l'artefatto di build committato

**User Story:** Come manutentore, voglio che il repo non tracci artefatti di build, così da tenere pulita la history e ridurre il peso.

#### Acceptance Criteria

1. `R1.AC1` The repository SHALL NOT track the Vitest UI report under `packages/core/html`.
2. `R1.AC2` The path `packages/core/html` SHALL be listed in `.gitignore`.

### R2 Branding attuale e coerente

**User Story:** Come utente, voglio vedere ovunque il nome corretto del prodotto, così da non trovare riferimenti a nomi legacy.

#### Acceptance Criteria

1. `R2.AC1` User-facing report and banner strings SHALL use the current product name ("Bob the Fixer") instead of the legacy "SonarGuard" or "Bob the Builder".
2. `R2.AC2` The MCP server class SHALL be named `UniversalBobTheFixerMCPServer`, with no legacy "Builder" identifier.
3. `R2.AC3` MCP tool descriptions SHALL NOT contain the `[EN]` artifact tag.

### R3 Nessun cambiamento di comportamento

**User Story:** Come manutentore, voglio che la pulizia sia trasparente, così da non introdurre regressioni.

#### Acceptance Criteria

1. `R3.AC1` The cleanup SHALL preserve all runtime behavior and the public API — only strings, build artifacts, and internal names change.
2. `R3.AC2` The full test suite SHALL pass after the affected string assertions are updated to the new branding.
3. `R3.AC3` IF a candidate string is used as a functional identifier or configuration key (not a display string), THEN the system SHALL leave it unchanged.

## Non-Functional Requirements

- `NFR1` The system SHALL preserve TypeScript `strict` compilation.
- `NFR2` The cleanup SHALL NOT change any functional identifier or configuration key that would affect existing installations (bridged by `R3.AC1`).

## Constraints And Dependencies

- `C1` Le occorrenze "SonarGuard"/"Bob the Builder" sono **cosmetiche** (stringhe di report/banner + nome classe server), verificate come non funzionali.
- `C2` `packages/core/html` **non è referenziato** da codice runtime (verificato) → rimozione sicura.
- `C3` I test che asseriscono le stringhe di branding (`DiagnosticsService`, `ProjectSetup`, `ConfigManager`, report) vanno aggiornati alle nuove stringhe.

## Out Of Scope

- Rinominare identificatori funzionali o chiavi di configurazione (rischio per installazioni esistenti).
- Le altre voci della review (bug 10k/CE, transport HTTP, split cluster A/C, nuove capacità MCP) — spec successivi.
