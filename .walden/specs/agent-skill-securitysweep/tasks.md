---
status: approved
approved_at: 2026-07-07T16:23:44Z
last_modified: 2026-07-07T16:24:53Z
approved_fingerprint: sha256:cb7092a474a2045c63faf8ad293cb376a86eb27bcd4eeb0eeb79945a95d49d15
source_design_approved_at: 2026-07-07T16:23:10Z
source_design_fingerprint: sha256:fa93132e794cb0d6a5a93957cce8631eaf741feecd940d27081f2fcc744abd65
---

# Implementation Plan

Terza skill + generalizzazione installer + README. Anti-deriva su tutte le skill in chiusura.

- [x] 1. Skill, installer e documentazione
  - [x] 1.1 Scrivere `skills/bob-securitysweep/SKILL.md` (frontmatter; fasi: inventory tre superfici → hotspot review human-in-the-loop → SAST fix con data flow → SCA path/reachability-first → verify doppio + SBOM; guardrail: verdetti umani, segreti → stop+report, test dopo fix/bump, no soppressioni) — ≤150 righe, inglese, parametri reali
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R1.AC4`, `R2.AC1`, `R2.AC2`, `R2.AC3`, `NFR1`
    - Design: Components And Interfaces → bob-securitysweep
    - Verification:
      - command: ["sh", "-c", "grep -q '^name: bob-securitysweep' skills/bob-securitysweep/SKILL.md && grep -q '^description:' skills/bob-securitysweep/SKILL.md"]
        covers: ["R1.AC1"]
      - command: ["sh", "-c", "[ $(wc -l < skills/bob-securitysweep/SKILL.md) -le 150 ]"]
        covers: ["NFR1"]
      - command: ["sh", "-c", "grep -q 'includeDataFlow' skills/bob-securitysweep/SKILL.md && grep -q 'trivy_generate_sbom' skills/bob-securitysweep/SKILL.md && grep -qi 'secret' skills/bob-securitysweep/SKILL.md"]
        covers: ["R1.AC3", "R1.AC4", "R2.AC2"]
  - [x] 1.2 Generalizzare il messaggio skills di `install.sh` (niente elenco hardcoded) e aggiornare il README (bullet `bob-securitysweep`, comando manuale Gemini generico); check anti-deriva su TUTTE le skill
    - Requirements: `R4.AC1`, `R4.AC2`, `R3.AC1`, `NFR2`
    - Design: Components And Interfaces → install.sh / README
    - Verification:
      - command: ["sh", "-c", "bash -n install.sh && ! grep -q 'bob-zerodebt, bob-issuecoverage' install.sh"]
        covers: ["R4.AC1", "NFR2"]
      - command: ["sh", "-c", "grep -q 'bob-securitysweep' README.md"]
        covers: ["R4.AC2"]
      - command: ["sh", "-c", "for t in $(grep -rhoE '(sonar|trivy)_[a-z_]+' skills/*/SKILL.md | sort -u); do grep -q \"name: '$t'\" packages/core/src/mcp/tool-definitions.ts || { echo missing:$t; exit 1; }; done"]
        covers: ["R3.AC1"]
