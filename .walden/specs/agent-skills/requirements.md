---
status: approved
approved_at: 2026-07-06T19:17:17Z
last_modified: 2026-07-06T19:17:17Z
approved_fingerprint: sha256:bfd57d5e4057e018adf8c6943b7cd629f61bcdb895894c7ed0bba8d005bac0dc
---

# Requirements Document

## Introduction

Bob shippa 24 tool MCP ma **zero playbook**: l'agente riceve gli attrezzi, non i workflow. Questo spec aggiunge le prime **agent skill di prodotto** — markdown installabili in `~/.claude/skills/` che codificano i cicli di lavoro ad alto valore sui tool di Bob: **`bob-zerodebt`** (azzerare il debito tecnico in modo misurabile: scan → triage → fix a lotti con contesto ricco → re-scan → report, incluso il ciclo SCA con dependency path/reachability) e **`bob-issuecoverage`** (chiudere i gap di test coverage: gaps prioritizzati → test comportamentali → delta misurato). È il moltiplicatore del fossato: i tool sono copiabili, i playbook che li orchestrano sono il valore composto.

<!-- assumed: "issuecoverage" = chiudere i gap di TEST COVERAGE (sonar_get_coverage_gaps / sonar_get_uncovered_files), non "fixare tutte le issue" (già coperto da zerodebt). -->

## Requirements

### R1 Skill `bob-zerodebt`

**User Story:** Come utente di Bob, voglio una skill che guidi l'agente ad azzerare il debito tecnico in modo misurabile, così da non dipendere da prompt improvvisati.

#### Acceptance Criteria

1. `R1.AC1` The repository SHALL ship a `bob-zerodebt` skill file (`skills/bob-zerodebt/SKILL.md`) with valid `name` and `description` frontmatter.
2. `R1.AC2` The skill SHALL define a measurable debt-reduction loop: baseline scan and debt snapshot, prioritized triage, batched fixes using rich issue context, re-scan verification, and a final delta report.
3. `R1.AC3` The skill SHALL include the SCA cycle (dependency scan, direct-dependency bump via the dependency path, re-scan) alongside the code-issue cycle.
4. `R1.AC4` The skill SHALL state guardrails: never mark false positives without human confirmation, re-scan after every batch, and stop when a batch introduces new issues.

### R2 Skill `bob-issuecoverage`

**User Story:** Come utente di Bob, voglio una skill che guidi l'agente a chiudere i gap di test coverage con test veri, così da alzare la coverage senza gaming.

#### Acceptance Criteria

1. `R2.AC1` The repository SHALL ship a `bob-issuecoverage` skill file (`skills/bob-issuecoverage/SKILL.md`) with valid `name` and `description` frontmatter.
2. `R2.AC2` The skill SHALL define a coverage loop: measure gaps, pick prioritized targets, write behavior-asserting tests for uncovered code, re-scan, and report the coverage delta.
3. `R2.AC3` The skill SHALL state guardrails: tests must assert behavior (no assertion-free coverage gaming), and production code is not modified for testability without explicit user approval.

### R3 Coerenza con i tool reali

**User Story:** Come manutentore, voglio che le skill citino solo tool che esistono, così da non andare in deriva quando la superficie MCP cambia.

#### Acceptance Criteria

1. `R3.AC1` Every `sonar_*`/`trivy_*` tool name referenced by a shipped skill SHALL exist in the server's tool definitions.
2. `R3.AC2` IF a skill references a tool name that does not exist in the tool definitions, THEN the verification SHALL fail.

### R4 Distribuzione e documentazione

**User Story:** Come utente, voglio installare le skill facilmente, così da usarle da Claude Code subito dopo l'install.

#### Acceptance Criteria

1. `R4.AC1` The README SHALL document the shipped skills and how to install them into `~/.claude/skills/`.
2. `R4.AC2` WHERE the installer script is used, it SHALL offer to install the skills into the user's skills directory.

## Non-Functional Requirements

- `NFR1` Each skill SHALL stay concise (≈150 lines or fewer) so it loads as guidance, not documentation.
- `NFR2` The skills SHALL be written in English, consistent with the product surface (README, tool descriptions).
- `NFR3` The skill content SHALL be grounded in the real tool parameters (e.g. `autoSetup: false` on re-scans, absolute `projectPath`), not invented flags.

## Constraints And Dependencies

- `C1` Le skill sono markdown: la verifica meccanica copre struttura (frontmatter) e riferimenti ai tool (grep contro `tool-definitions.ts`); la qualità semantica resta responsabilità della review.
- `C2` I nomi tool provengono da `packages/core/src/mcp/tool-definitions.ts` (24 tool attuali).
- `C3` L'aggancio a `install.sh` copia `skills/` in `~/.claude/skills/` (lo script gira sia da checkout sia via curl-bootstrap: la copia vale nel modo checkout; nel modo curl la documentazione README resta la via).

## Out Of Scope

- Packaging come plugin/marketplace Claude Code (possibile evoluzione).
- Una terza skill `bob-securitysweep` (hotspots + SCA sweep dedicata) — follow-up naturale, non in questo spec.
- Auto-update delle skill installate.
