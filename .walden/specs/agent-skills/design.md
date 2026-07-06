---
status: approved
approved_at: 2026-07-06T19:18:45Z
last_modified: 2026-07-06T19:18:45Z
approved_fingerprint: sha256:f9213d61200d1c8c03e9d2c6b02049252491ee9b2d1580562c58f140e03e524f
source_requirements_approved_at: 2026-07-06T19:17:17Z
source_requirements_fingerprint: sha256:bfd57d5e4057e018adf8c6943b7cd629f61bcdb895894c7ed0bba8d005bac0dc
---

# Feature Design

## Overview

Due file skill self-contained in `skills/` (`bob-zerodebt/SKILL.md`, `bob-issuecoverage/SKILL.md`), scritti in inglese, ≤150 righe ciascuno, fondati sui parametri reali dei 24 tool. Un check meccanico anti-deriva (script sh nei task Walden) estrae ogni nome `sonar_*`/`trivy_*` citato nelle skill e verifica che esista in `tool-definitions.ts`. Distribuzione: sezione "Agent Skills" nel README + step in `install.sh` che copia `skills/` in `~/.claude/skills/` quando gira da checkout.

## Architecture

```text
  skills/
    bob-zerodebt/SKILL.md        (debt loop: baseline → triage → fix batches → re-scan → report; + SCA cycle)
    bob-issuecoverage/SKILL.md   (coverage loop: uncovered files → per-file gaps → behavior tests → delta)
        │ install.sh (checkout mode) / README instructions
        ▼
  ~/.claude/skills/bob-zerodebt , ~/.claude/skills/bob-issuecoverage
        │ Claude Code carica la skill → orchestra i tool MCP di Bob
        ▼
  bob-the-fixer MCP server (24 tools)
```

## Options Considered

### Option A — Due SKILL.md self-contained e concisi (SCELTA)

- Summary: un solo file per skill, playbook diretto (fasi, tool con parametri veri, guardrail, criteri di stop).
- Why chosen: i playbook sono ~100-150 righe; `references/` e script separati sarebbero struttura senza contenuto; una skill concisa viene *seguita*, un manuale viene ignorato.

### Option B — Skill con references/ e script di supporto

- Summary: SKILL.md sottile + cartelle references/scripts (stile skill Cloudflare).
- Why rejected: adatto a superfici enormi (wrangler: 900+ righe); qui frammenterebbe due workflow lineari, aumentando la manutenzione senza valore.

## Simplicity And Elegance Review

- Simplest viable shape: 2 file markdown + 1 sezione README + ~10 righe in install.sh; nessun codice applicativo toccato.
- Coupling check: le skill dipendono solo dai *nomi/parametri* dei tool; il check anti-deriva rende il legame verificabile a ogni run Walden.
- Future-proofing: `bob-securitysweep` e il packaging plugin si aggiungono accanto senza rifare nulla.

## Components And Interfaces

### `skills/bob-zerodebt/SKILL.md`

- Frontmatter: `name: bob-zerodebt`, `description` con trigger espliciti ("zero out technical debt", "pay down debt", "fix all sonar issues").
- Playbook (fasi):
  1. **Preflight**: `sonar_config_manager (action: view)`; `trivy_check_installation` se si include l'SCA.
  2. **Baseline**: `sonar_scan_project` (primo scan `autoSetup: true`; sempre `projectPath` assoluto), `sonar_get_technical_debt (includeBudgetAnalysis: true)`, `sonar_get_project_metrics`, `sonar_get_quality_gate`, `trivy_scan_dependencies` → snapshot numerico (issue per severità, debito, gate, vuln).
  3. **Triage**: ordine BLOCKER/CRITICAL bugs+vulnerabilities → major ad alto ROI; `sonar_analyze_patterns (groupBy: rule)` per identificare fix seriali; SCA raggruppata per direct dependency dal dependency path del report.
  4. **Fix loop** (lotti 5–10): per issue `sonar_get_issue_details` (rule details + code examples + file path) → fix con gli strumenti di edit → dopo ogni lotto re-scan con `autoSetup: false` → confronto col baseline. SCA: bump della direct dependency indicata dal path (override per le transitive bloccate), poi re-scan Trivy.
  5. **Verify & report**: `sonar_get_quality_gate`, `sonar_generate_report`, delta finale vs baseline.
- Guardrail (R1.AC4): mai marcare false positive senza conferma umana; niente soppressioni (`// NOSONAR`) senza approvazione; re-scan dopo ogni lotto; se un lotto introduce issue nuove → stop e revisione; non toccare fixture di test volutamente vulnerabili.
- Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R1.AC4`, `NFR1`, `NFR2`, `NFR3`

### `skills/bob-issuecoverage/SKILL.md`

- Frontmatter: `name: bob-issuecoverage`, `description` con trigger ("close coverage gaps", "raise test coverage", "cover untested files").
- Playbook (fasi):
  1. **Measure**: scan aggiornato; `sonar_get_uncovered_files` (`targetCoverage`, `maxFiles`, `sortBy`, `includeNoCoverageData`) → lista prioritizzata.
  2. **Target**: preferire file critici a coverage 0/bassa e alto numero di righe scoperte; confermare la lista con l'utente se ampia.
  3. **Per-file loop**: `sonar_get_coverage_gaps (componentKey, minGapSize, includePartialBranch)` per le righe/branch scoperti → leggere il codice → scrivere test **comportamentali** (arrange/act/assert sui rami scoperti) nel framework del repo → eseguire i test in locale.
  4. **Re-scan & delta**: re-scan (`autoSetup: false`) → `sonar_get_project_metrics (metrics: coverage)` → delta per file e complessivo; iterare fino al target.
- Guardrail (R2.AC3): ogni test deve asserire comportamento (vietati test senza asserzioni/che eseguono e basta); non modificare codice di produzione per testabilità senza ok esplicito; non escludere file dalla coverage per gonfiare la metrica; seguire i pattern di test esistenti del repo.
- Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`, `NFR1`, `NFR2`, `NFR3`

### Check anti-deriva (verifica Walden, R3)

- Comando sh nei task: estrae `(sonar|trivy)_[a-z_]+` da `skills/*/SKILL.md`, e per ciascun nome verifica `grep "name: '<tool>'" tool-definitions.ts`; exit 1 al primo mancante (R3.AC2).
- Requirements: `R3.AC1`, `R3.AC2`

### README + install.sh (R4)

- README: sezione "Agent Skills" (cosa sono, le due skill, `cp -r skills/* ~/.claude/skills/`).
- install.sh: in checkout mode (`$SCRIPT_DIR/skills` esiste) copia le skill in `~/.claude/skills/` con messaggio; in curl-bootstrap mode il README resta la via (C3).
- Requirements: `R4.AC1`, `R4.AC2`

## Data Models

n/a (markdown + docs + shell).

## Error Handling

- Skill: ogni fase indica il criterio di stop (gate rosso persistente, lotto che introduce issue, tool non disponibile → riportare all'utente, non improvvisare).
- install.sh: copia skill best-effort con messaggio; non fallisce l'install se `~/.claude/skills` non è scrivibile.

## Failure Modes And Tradeoffs

- Failure mode: la superficie MCP cambia (tool rinominato) → skill in deriva.
  - Mitigation: check anti-deriva nei task Walden (fallisce al primo tool inesistente); rieseguibile a ogni modifica.
- Failure mode: skill troppo prescrittiva su progetti atipici.
  - Mitigation: le fasi sono guida, i guardrail sono vincolo; la skill dice quando chiedere all'utente.
- Tradeoff: il check meccanico non valuta la qualità semantica del playbook (C1) — resta alla review umana.

## Testing Strategy

- Frontmatter check (grep `^name:`/`^description:`) per ciascuna skill.
- Check anti-deriva (tool citati ⊆ tool definiti) su tutte le skill.
- `bash -n install.sh` (sintassi) + grep della sezione skills; grep README.
- Conteggio righe ≤ 150 per skill (NFR1).
- Nessun impatto su build/test del core (nessun codice toccato).

## Verification Plan

- Requirement proof: comandi di verifica nei task (frontmatter, anti-deriva, README, install.sh, line count).
- Test evidence: esecuzione dei comandi via `walden task complete`.
- Operational evidence: installazione locale delle skill (`cp` in `~/.claude/skills/`) come smoke opzionale post-merge.

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `skills/bob-zerodebt/SKILL.md` (playbook + SCA cycle + guardrail) |
| `R2` | `skills/bob-issuecoverage/SKILL.md` (coverage loop + guardrail) |
| `R3` | check anti-deriva sh nei task (estrazione nomi + grep tool-definitions) |
| `R4` | sezione README + step copia skill in install.sh |
| `NFR1` | line count ≤150 verificato nei task |
| `NFR2` | skill in inglese |
| `NFR3` | parametri presi da tool-definitions reali (autoSetup, targetCoverage, componentKey, …) |
