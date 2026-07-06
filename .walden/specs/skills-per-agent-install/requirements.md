---
status: approved
approved_at: 2026-07-06T19:59:57Z
last_modified: 2026-07-06T19:59:57Z
approved_fingerprint: sha256:e9577dcf32a8d73fa9f9db88a3401b2a191823812bc158c81eda4cac8800e23a
---

# Requirements Document

## Introduction

`install.sh` registra il server MCP per **quattro** coding agent (Claude, Gemini, Codex, Copilot) ma installa le agent skill **solo per Claude Code** (`~/.claude/skills/`). Questo spec rende l'installazione delle skill **per-agent**, usando il meccanismo nativo di ciascuno — verificato empiricamente sulle versioni installate: Gemini CLI 0.45 ha `gemini skills install <path>` (standard Agent Skills, stesso formato SKILL.md); Codex 0.142 non ha skills ma supporta i custom prompt `~/.codex/prompts/<name>.md` (il body della skill diventa lo slash-prompt `/bob-zerodebt`); Copilot CLI non espone alcun meccanismo skill/prompt user-level e viene documentato come non supportato.

## Requirements

### R1 Installazione skill per-agent

**User Story:** Come utente con più coding agent, voglio che l'installer dia i playbook di Bob a ogni agent che li supporta, così da avere lo stesso workflow ovunque.

#### Acceptance Criteria

1. `R1.AC1` WHERE the `claude` CLI is available, the installer SHALL copy the skills into `~/.claude/skills/` (native SKILL.md format).
2. `R1.AC2` WHERE the `gemini` CLI is available, the installer SHALL install each skill via `gemini skills install <local-path>`.
3. `R1.AC3` WHERE the `codex` CLI is available, the installer SHALL generate `~/.codex/prompts/<skill-name>.md` from each skill's body (YAML frontmatter stripped).
4. `R1.AC4` The README SHALL document which agents receive the skills and through which mechanism (including Copilot as unsupported).

### R2 Robustezza (mai rompere l'install)

**User Story:** Come utente, voglio che un problema nell'installazione delle skill non faccia fallire l'installazione di Bob.

#### Acceptance Criteria

1. `R2.AC1` IF a per-agent skill installation step fails (old CLI version, unwritable directory), THEN the installer SHALL print a warning with the manual command and continue.
2. `R2.AC2` The skills step SHALL always return success to the main installer flow (best-effort semantics).

## Non-Functional Requirements

- `NFR1` `install.sh` SHALL remain valid bash (`bash -n`).
- `NFR2` The generated Codex prompt SHALL be the skill body unchanged except for the stripped frontmatter (single source of truth: `skills/*/SKILL.md`).
- `NFR3` The skills step SHALL not print secrets and SHALL not require network access.

## Constraints And Dependencies

- `C1` Meccanismi verificati sulle versioni locali: gemini 0.45 (`skills install` presente), codex 0.142 (nessun subcomando skills → prompts dir), copilot 1.0.68 (nessun meccanismo). Versioni più vecchie di Gemini senza `skills` ricadono nel warning di R2.
- `C2` Vale in checkout mode (`$SCRIPT_DIR/skills` esiste); in curl-bootstrap il README resta la via (come oggi).
- `C3` Lo smoke test della funzione usa una `HOME` temporanea per non toccare le directory reali dell'utente durante la verifica.

## Out Of Scope

- Supporto Copilot (nessun meccanismo user-level oggi; si documenta).
- Conversione in formati terzi (TOML Gemini legacy commands, plugin Codex).
- Disinstallazione/aggiornamento automatico delle skill.
