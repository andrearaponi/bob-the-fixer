---
status: approved
approved_at: 2026-07-06T19:19:49Z
last_modified: 2026-07-06T19:23:56Z
approved_fingerprint: sha256:0f4976fb865e07ae485b91bf36a257338cefd1a937d5b384773b6d4937ca8893
source_design_approved_at: 2026-07-06T19:18:45Z
source_design_fingerprint: sha256:f9213d61200d1c8c03e9d2c6b02049252491ee9b2d1580562c58f140e03e524f
---

# Implementation Plan

Contenuto (2 skill markdown) + distribuzione (README, install.sh). Check anti-deriva: ogni tool citato deve esistere in tool-definitions.ts.

- [x] 1. Le due skill
  - [x] 1.1 Scrivere `skills/bob-zerodebt/SKILL.md` (frontmatter name/description; playbook: preflight → baseline con debt/metrics/gate/SCA → triage per severità+pattern+direct-dependency → fix loop a lotti con issue details e re-scan `autoSetup: false` → verify & report; guardrail: no FP senza umano, no soppressioni, stop su issue nuove) — ≤150 righe, inglese, parametri reali
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R1.AC4`, `R3.AC1`, `NFR1`, `NFR2`, `NFR3`
    - Design: Components And Interfaces → bob-zerodebt
    - Verification:
      - command: ["sh", "-c", "grep -q '^name: bob-zerodebt' skills/bob-zerodebt/SKILL.md && grep -q '^description:' skills/bob-zerodebt/SKILL.md"]
        covers: ["R1.AC1"]
      - command: ["sh", "-c", "[ $(wc -l < skills/bob-zerodebt/SKILL.md) -le 150 ]"]
        covers: ["NFR1"]
      - command: ["sh", "-c", "for t in $(grep -ohE '(sonar|trivy)_[a-z_]+' skills/bob-zerodebt/SKILL.md | sort -u); do grep -q \"name: '$t'\" packages/core/src/mcp/tool-definitions.ts || { echo missing:$t; exit 1; }; done"]
        covers: ["R3.AC1"]
  - [x] 1.2 Scrivere `skills/bob-issuecoverage/SKILL.md` (frontmatter; playbook: measure con uncovered-files → target prioritizzati → per-file loop con coverage-gaps + test comportamentali → re-scan e delta; guardrail: test con asserzioni, no modifiche a produzione senza ok, no esclusioni per gonfiare) — ≤150 righe, inglese, parametri reali
    - Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`, `R3.AC1`, `NFR1`, `NFR2`, `NFR3`
    - Design: Components And Interfaces → bob-issuecoverage
    - Verification:
      - command: ["sh", "-c", "grep -q '^name: bob-issuecoverage' skills/bob-issuecoverage/SKILL.md && grep -q '^description:' skills/bob-issuecoverage/SKILL.md"]
        covers: ["R2.AC1"]
      - command: ["sh", "-c", "[ $(wc -l < skills/bob-issuecoverage/SKILL.md) -le 150 ]"]
        covers: ["NFR1"]
      - command: ["sh", "-c", "for t in $(grep -ohE '(sonar|trivy)_[a-z_]+' skills/bob-issuecoverage/SKILL.md | sort -u); do grep -q \"name: '$t'\" packages/core/src/mcp/tool-definitions.ts || { echo missing:$t; exit 1; }; done"]
        covers: ["R3.AC1"]

- [x] 2. Distribuzione e chiusura anti-deriva
  - [x] 2.1 Aggiungere la sezione "Agent Skills" al README (le due skill + installazione in `~/.claude/skills/`); aggiungere a `install.sh` la copia delle skill in checkout mode (best-effort, con messaggio); check anti-deriva su TUTTE le skill (fallisce su tool inesistente)
    - Requirements: `R4.AC1`, `R4.AC2`, `R3.AC2`
    - Design: Components And Interfaces → README + install.sh / Check anti-deriva
    - Verification:
      - command: ["sh", "-c", "grep -qi 'agent skills' README.md && grep -q 'bob-zerodebt' README.md && grep -q 'bob-issuecoverage' README.md"]
        covers: ["R4.AC1"]
      - command: ["sh", "-c", "grep -q 'skills' install.sh && bash -n install.sh"]
        covers: ["R4.AC2"]
      - command: ["sh", "-c", "for t in $(grep -rhoE '(sonar|trivy)_[a-z_]+' skills/*/SKILL.md | sort -u); do grep -q \"name: '$t'\" packages/core/src/mcp/tool-definitions.ts || { echo missing:$t; exit 1; }; done"]
        covers: ["R3.AC1", "R3.AC2"]
