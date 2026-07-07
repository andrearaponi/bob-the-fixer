---
status: approved
approved_at: 2026-07-07T16:22:17Z
last_modified: 2026-07-07T16:22:17Z
approved_fingerprint: sha256:8c20bd4e5a7a9d91f4167d20df78a518f71a22b0437080915c4a16456012abd5
---

# Requirements Document

## Introduction

Terza agent skill di prodotto: **`bob-securitysweep`** — lo sweep di sicurezza completo che unisce le tre superfici che Bob copre: **security hotspots** (review guidata, decisione umana), **vulnerabilità SAST** (fix col data flow), **SCA** (dependency path + reachability, chiusa con l'**SBOM** come attestato). Era il follow-up dichiarato fuori scope nello spec `agent-skills`. La distribuzione per-agent è già automatica (l'installer copia `skills/*`): restano da generalizzare il messaggio hardcoded dell'installer e da aggiornare il README.

## Requirements

### R1 Skill `bob-securitysweep`

**User Story:** Come utente di Bob, voglio una skill che guidi uno sweep di sicurezza end-to-end (hotspots + SAST + dipendenze), così da avere un workflow di security review ripetibile.

#### Acceptance Criteria

1. `R1.AC1` The repository SHALL ship a `bob-securitysweep` skill file (`skills/bob-securitysweep/SKILL.md`) with valid `name` and `description` frontmatter.
2. `R1.AC2` The skill SHALL define a sweep across the three surfaces: security hotspots review, SAST vulnerability fixes, and dependency (SCA) remediation.
3. `R1.AC3` The skill SHALL use the security-specific context: hotspot details for each reviewed hotspot, and data-flow context when fixing SAST vulnerabilities.
4. `R1.AC4` The skill SHALL close the sweep with a verification re-scan of both scanners and an SBOM as the supply-chain artifact.

### R2 Guardrail di sicurezza

**User Story:** Come security owner, voglio che le decisioni di sicurezza restino umane, così che l'agente non "chiuda" rischi da solo.

#### Acceptance Criteria

1. `R2.AC1` The skill SHALL forbid marking a hotspot as safe (or an issue as false positive) without explicit human confirmation.
2. `R2.AC2` IF exposed credentials or secrets are found during the sweep, THEN the skill SHALL direct the agent to stop remediation of that finding and report it to the user immediately.
3. `R2.AC3` The skill SHALL require running the project's test suite after security fixes and dependency bumps.

### R3 Coerenza con i tool reali

**User Story:** Come manutentore, voglio che anche questa skill citi solo tool esistenti, così che il check anti-deriva copra l'intero set.

#### Acceptance Criteria

1. `R3.AC1` Every `sonar_*`/`trivy_*` tool name referenced by the skill SHALL exist in the server's tool definitions.

### R4 Distribuzione e documentazione

**User Story:** Come utente, voglio la nuova skill installata come le altre e documentata.

#### Acceptance Criteria

1. `R4.AC1` The installer's skills step SHALL use a generic message (no hardcoded skill list), so new skills do not drift the text.
2. `R4.AC2` The README's Agent Skills section SHALL list `bob-securitysweep` alongside the existing skills.

## Non-Functional Requirements

- `NFR1` The skill SHALL stay concise (≈150 lines or fewer), in English, grounded in the real tool parameters (`statuses` for hotspots, `includeDataFlow` for issue details, `autoSetup: false` on re-scans).
- `NFR2` `install.sh` SHALL remain valid bash (`bash -n`).

## Constraints And Dependencies

- `C1` La distribuzione per-agent copia `skills/*` automaticamente (spec `skills-per-agent-install`): nessun nuovo ramo richiesto.
- `C2` Il check anti-deriva è lo stesso dello spec `agent-skills` (grep dei nomi tool contro `tool-definitions.ts`).
- `C3` La review degli hotspot è per natura decisionale: la skill guida la valutazione ma il verdetto safe/fix è dell'utente (R2.AC1).

## Out Of Scope

- Mutazione dello stato hotspot/issue via API (Bob oggi non espone tool di mutazione; la skill registra i verdetti dell'utente nel report).
- Packaging plugin/marketplace.
- Integrazione con scanner di segreti dedicati (trufflehog ecc.).
