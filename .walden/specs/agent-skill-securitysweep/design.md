---
status: approved
approved_at: 2026-07-07T16:23:10Z
last_modified: 2026-07-07T16:23:10Z
approved_fingerprint: sha256:fa93132e794cb0d6a5a93957cce8631eaf741feecd940d27081f2fcc744abd65
source_requirements_approved_at: 2026-07-07T16:22:17Z
source_requirements_fingerprint: sha256:8c20bd4e5a7a9d91f4167d20df78a518f71a22b0437080915c4a16456012abd5
---

# Feature Design

## Overview

Una terza skill self-contained `skills/bob-securitysweep/SKILL.md` (≤150 righe, inglese), stessa forma delle prime due: fasi + tool con parametri reali + guardrail + stop conditions. Il flusso: inventory delle tre superfici (SAST vulns, hotspots, SCA) → **hotspot review human-in-the-loop** → fix SAST col data flow → remediation SCA path/reachability-first → verify (re-scan doppio) → **SBOM come attestato**. In `install.sh` il messaggio dello step skills diventa generico (niente elenco hardcoded); il README aggiunge la skill e rende generico il comando manuale Gemini.

## Architecture

```text
  skills/bob-securitysweep/SKILL.md
    Phase 1 Inventory: sonar_scan_project (typeFilter VULNERABILITY) + sonar_get_security_hotspots
                       (statuses TO_REVIEW) + trivy_scan_dependencies → snapshot
    Phase 2 Hotspots:  per hotspot → sonar_get_security_hotspot_details → assessment → VERDETTO UTENTE
    Phase 3 SAST:      per vuln → sonar_get_issue_details (includeDataFlow) → fix root cause → re-scan batch
    Phase 4 SCA:       group by direct dependency (Via path), reachable first → bump/override → build+test → re-scan
    Phase 5 Attest:    re-scan sonar+trivy, sonar_get_quality_gate, trivy_generate_sbom, report con verdetti
```

## Options Considered

### Option A — Skill autonoma con hotspot-review human-in-the-loop (SCELTA)

- Summary: terza skill parallela a zerodebt/issuecoverage; la review hotspot produce verdetti dell'utente registrati nel report (Bob non ha tool di mutazione).
- Why chosen: la sicurezza ha un workflow proprio (review decisionale, data flow, attestato SBOM) che in zerodebt sarebbe rumore; la separazione rispetta "una skill = un job".

### Option B — Estendere bob-zerodebt con una sezione security

- Summary: un'unica mega-skill debt+security.
- Why rejected: gonfia zerodebt oltre le ~150 righe, mescola un loop autonomo (fix issue) con uno decisionale (verdetti hotspot), e diluisce i trigger di attivazione.

## Simplicity And Elegance Review

- Simplest viable shape: un file markdown nuovo + 1 riga di messaggio generalizzata in install.sh + 2 ritocchi README.
- Coupling check: nessun nuovo ramo installer (copia `skills/*` già generica, C1); il check anti-deriva copre la nuova skill senza modifiche.
- Future-proofing: messaggio installer generico → le prossime skill non toccano più install.sh.

## Components And Interfaces

### `skills/bob-securitysweep/SKILL.md`

- Frontmatter: `name: bob-securitysweep`, `description` con trigger ("security sweep/review/audit", "review hotspots", "fix vulnerabilities").
- Fasi come da Architecture; parametri reali: `typeFilter: ["VULNERABILITY"]`, `statuses: ["TO_REVIEW"]`, `includeDataFlow: "auto"`, `autoSetup: false` sui re-scan, `format: "cyclonedx"` per l'SBOM.
- Guardrail (R2): verdetti hotspot/FP solo umani; segreti esposti → stop di quel finding + report immediato (senza incollare il segreto); test suite dopo ogni fix/bump; niente soppressioni; fixture vulnerabili intoccabili; vietato "ripulire" filtrando severità.
- Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R1.AC4`, `R2.AC1`, `R2.AC2`, `R2.AC3`, `NFR1`

### `install.sh` — messaggio generico

- `print_step "Installing Bob agent skills (bob-zerodebt, bob-issuecoverage)..."` → `print_step "Installing Bob agent skills..."` (R4.AC1). Nessun altro cambiamento (la copia è già `skills/*`).
- Requirements: `R4.AC1`, `NFR2`

### README — Agent Skills

- Bullet per `bob-securitysweep` accanto alle altre due; comando manuale Gemini reso generico (`gemini skills install ./skills/<name>`), così l'elenco non va in deriva (R4.AC2).
- Requirements: `R4.AC2`

## Data Models

n/a (markdown + docs + 1 riga shell).

## Error Handling

- La skill definisce stop conditions: segreti trovati (priorità assoluta), fix architetturale richiesto, superfici pulite/residui decisionali.
- Installer: invariato (best-effort già in essere).

## Security Considerations

La skill stessa è un artefatto di security process: codifica che i verdetti restino umani, che i segreti non vengano ri-esposti nel report, e che ogni remediation sia verificata da test + re-scan.

## Failure Modes And Tradeoffs

- Failure mode: l'agente marca "safe" un hotspot per eccesso di zelo.
  - Mitigation: guardrail esplicito e ripetuto (fase 2 + sezione guardrail); i verdetti sono registrati come dell'utente.
- Failure mode: la skill cita un tool inesistente.
  - Mitigation: check anti-deriva nei task (C2).
- Tradeoff: senza tool di mutazione, i verdetti non aggiornano SonarQube — registrati nel report finale (dichiarato Out Of Scope; futuro punto 5 roadmap).

## Testing Strategy

- Frontmatter check + line count ≤150 + anti-deriva sul nuovo file.
- `bash -n install.sh`; grep che il messaggio hardcoded non c'è più; grep README (`bob-securitysweep`).
- Anti-deriva su TUTTE le skill (chiusura).

## Verification Plan

- Requirement proof: comandi dei task (grep/wc/anti-drift/bash -n).
- Test evidence: `walden task complete`.
- Operational evidence: run reale di `install_agent_skills` post-merge per distribuire la nuova skill ai 3 agent (come per le prime due).

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `skills/bob-securitysweep/SKILL.md` (fasi + data flow + SBOM) |
| `R2` | sezione guardrail della skill (verdetti umani, segreti, test) |
| `R3` | check anti-deriva nei task |
| `R4` | messaggio installer generico + README aggiornato |
| `NFR1` | line count + inglese + parametri reali |
| `NFR2` | `bash -n install.sh` |
