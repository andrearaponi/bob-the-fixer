---
status: approved
approved_at: 2026-07-06T20:02:06Z
last_modified: 2026-07-06T20:02:42Z
approved_fingerprint: sha256:57c9336ce7546ed0fca4ef7f473d499287aaec03353173b9ef4599a9260a6420
source_design_approved_at: 2026-07-06T20:00:52Z
source_design_fingerprint: sha256:b07f8e0e315035648237f6744934216245c1f4cc31823fa42847f5a3754c231c
---

# Implementation Plan

Riscrittura di `install_agent_skills()` (dispatcher per-agent) + matrice README. Smoke hermetico con HOME temporanea e stub CLI.

- [x] 1. Dispatcher per-agent e documentazione
  - [x] 1.1 Riscrivere `install_agent_skills()` in `install.sh`: ramo claude (copia `~/.claude/skills/`), ramo gemini (`gemini skills install <dir>` per skill), ramo codex (awk strip-frontmatter → `~/.codex/prompts/<name>.md`); ogni ramo best-effort con warning + comando manuale, `return 0` finale; aggiornare la sezione Agent Skills del README con la matrice per-agent (Copilot non supportato)
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R1.AC4`, `R2.AC1`, `R2.AC2`, `NFR1`, `NFR2`, `NFR3`
    - Design: Components And Interfaces
    - Verification:
      - command: ["bash", "-n", "install.sh"]
        covers: ["NFR1"]
      - command: ["sh", "-c", "sed -n '/^install_agent_skills()/,/^}/p' install.sh > /tmp/ias.fn && grep -q 'command -v claude' /tmp/ias.fn && grep -q 'command -v gemini' /tmp/ias.fn && grep -q 'command -v codex' /tmp/ias.fn"]
        covers: ["R1.AC1", "R1.AC2", "R1.AC3"]
      - command: ["sh", "-c", "grep -q 'gemini skills install' README.md && grep -qi 'copilot' README.md && grep -q '.codex/prompts' README.md"]
        covers: ["R1.AC4"]
      - command: ["sh", "-c", "FH=$(mktemp -d) && export FH && mkdir -p \"$FH/bin\" && printf '#!/bin/sh\\nexit 0\\n' > \"$FH/bin/claude\" && cp \"$FH/bin/claude\" \"$FH/bin/codex\" && chmod +x \"$FH/bin/claude\" \"$FH/bin/codex\" && sed -n '/^install_agent_skills()/,/^}/p' install.sh > \"$FH/fn.sh\" && HOME=\"$FH\" PATH=\"$FH/bin:/usr/bin:/bin\" SCRIPT_DIR=\"$PWD\" bash -c 'print_step() { :; }; print_success() { :; }; print_warning() { :; }; . \"$FH/fn.sh\"; install_agent_skills' && test -f \"$FH/.claude/skills/bob-zerodebt/SKILL.md\" && test -f \"$FH/.codex/prompts/bob-zerodebt.md\" && test -f \"$FH/.codex/prompts/bob-issuecoverage.md\" && ! grep -q '^name:' \"$FH/.codex/prompts/bob-zerodebt.md\" && grep -q 'Zero Debt' \"$FH/.codex/prompts/bob-zerodebt.md\""]
        covers: ["R1.AC1", "R1.AC3", "R2.AC1", "R2.AC2", "NFR2"]
