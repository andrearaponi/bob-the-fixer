---
status: approved
approved_at: 2026-07-06T20:00:52Z
last_modified: 2026-07-06T20:00:52Z
approved_fingerprint: sha256:b07f8e0e315035648237f6744934216245c1f4cc31823fa42847f5a3754c231c
source_requirements_approved_at: 2026-07-06T19:59:57Z
source_requirements_fingerprint: sha256:e9577dcf32a8d73fa9f9db88a3401b2a191823812bc158c81eda4cac8800e23a
---

# Feature Design

## Overview

Riscrivere `install_agent_skills()` in `install.sh` come dispatcher per-agent: ramo `claude` (copia in `~/.claude/skills/`, come oggi), ramo `gemini` (`gemini skills install <path>` per ogni skill), ramo `codex` (genera `~/.codex/prompts/<name>.md` dal body della SKILL.md, frontmatter YAML strippato via awk). Ogni ramo è indipendente e best-effort (warning + comando manuale, mai exit≠0). Il README aggiorna la sezione Agent Skills con la matrice per-agent (Copilot: non supportato). Smoke test hermetico: la funzione viene estratta ed eseguita con `HOME` temporanea e un `PATH` finto contenente stub `claude`/`codex` (niente `gemini`), così si verificano copia, generazione prompt, strip del frontmatter e skip del ramo assente senza toccare il sistema reale.

## Architecture

```text
  install.sh main → install_agent_skills()
    ├─ command -v claude → cp -R skills/. ~/.claude/skills/           (SKILL.md nativo)
    ├─ command -v gemini → for d in skills/*/: gemini skills install d (Agent Skills standard)
    ├─ command -v codex  → for f in skills/*/SKILL.md:
    │                        awk strip-frontmatter > ~/.codex/prompts/<name>.md   (/bob-zerodebt)
    └─ copilot: nessun ramo (documentato nel README)
  ogni ramo: successo → print_success; fallimento → print_warning + comando manuale; return 0 sempre
```

## Options Considered

### Option A — Dispatcher per-agent dentro l'unica funzione esistente (SCELTA)

- Summary: tre rami `command -v` nella `install_agent_skills()` già chiamata da `main`.
- Why chosen: riusa il punto di aggancio già esistente; ogni ramo è poche righe; la rilevazione `command -v` è la stessa usata dal resto dello script.

### Option B — Conversioni per formati legacy (TOML Gemini, plugin Codex)

- Summary: generare comandi TOML per Gemini e plugin per Codex.
- Why rejected: Gemini 0.45 accetta direttamente il formato SKILL.md (`gemini skills install`) — la conversione TOML è lavoro morto; i plugin Codex sono un altro meccanismo, i custom prompt bastano e mantengono la single source of truth.

## Simplicity And Elegance Review

- Simplest viable shape: una funzione, tre rami, un awk; nessun file duplicato nel repo (i prompt Codex sono generati all'install, non versionati).
- Coupling check: ogni ramo dipende solo dal proprio CLI; un ramo che fallisce non tocca gli altri.
- Future-proofing: quando Codex adotterà lo standard Agent Skills basterà cambiare il ramo; Copilot si aggiunge come nuovo ramo.

## Components And Interfaces

### `install_agent_skills()` (install.sh, riscritta)

- Guard: `[ -d "$SCRIPT_DIR/skills" ] || return 0` (curl-bootstrap mode → no-op, C2).
- Ramo Claude (`R1.AC1`): `mkdir -p ~/.claude/skills && cp -R "$skills_src/." ~/.claude/skills/`.
- Ramo Gemini (`R1.AC2`): loop sulle directory `skills/*/` → `gemini skills install "$dir"` (output soppresso); un fallimento qualsiasi → warning con comando manuale.
- Ramo Codex (`R1.AC3`): `mkdir -p ~/.codex/prompts`; per ogni `skills/*/SKILL.md` → awk che salta il primo blocco `--- … ---` e scrive `~/.codex/prompts/<dirname>.md` (NFR2: body invariato).
- Tutti i rami: warning non fatale su errore (`R2.AC1`), `return 0` finale (`R2.AC2`).

### README — sezione Agent Skills (matrice)

- Tabella/elenco per-agent: Claude (skills dir), Gemini (`gemini skills install`), Codex (custom prompt `/bob-zerodebt`), Copilot (non supportato — nessun meccanismo user-level).
- Requirements: `R1.AC4`

## Data Models

n/a (shell + docs).

## Error Handling

- Ogni ramo: fallimento → `print_warning` con il comando manuale equivalente; la funzione ritorna sempre 0 (`R2`).
- Gemini < 0.45 (senza `skills`): il comando fallisce → ramo warning (C1).

## Security Considerations

`NFR3`: nessun segreto nel ramo skills; nessuna rete (installazioni da path locale); i file generati sono derivati del repo.

## Failure Modes And Tradeoffs

- Failure mode: `gemini skills install` cambia sintassi in versioni future.
  - Mitigation: best-effort con warning + comando manuale; il README documenta la via manuale.
- Failure mode: l'awk di strip frontmatter incontra un file senza frontmatter.
  - Mitigation: l'awk stampa tutto il file se non inizia con `---` (comportamento neutro).
- Tradeoff: i prompt Codex sono generati (non versionati) → nessuna divergenza da mantenere, ma un utente che modifica il prompt locale perde le modifiche a una reinstall (accettato: la fonte è la skill).

## Testing Strategy

- `bash -n install.sh` (sintassi).
- Grep: i tre rami presenti nella funzione; README con la matrice.
- **Smoke hermetico (C3)**: estrai la funzione (`sed -n '/^install_agent_skills()/,/^}/p'`), eseguila con stub `print_*`, `HOME=$(mktemp -d)` e `PATH` finto con soli stub `claude`/`codex` → asserzioni: `SKILL.md` copiata sotto la HOME fake, prompt Codex generato **senza** frontmatter (`! grep '^name:'`), ramo gemini saltato senza errori.

## Verification Plan

- Requirement proof: comandi dei task (bash -n, grep rami/README, smoke hermetico con asserzioni sui file generati).
- Test evidence: esecuzione via `walden task complete`.
- Operational evidence: run reale di `install_agent_skills` sul sistema (HOME reale) come smoke finale post-task, così le skill risultano installate per gli agent presenti.

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | dispatcher per-agent in `install_agent_skills()` + matrice README |
| `R2` | warning non fatali + `return 0` (smoke: ramo mancante non rompe) |
| `NFR1` | `bash -n install.sh` |
| `NFR2` | awk strip-frontmatter (asserzione smoke: niente `^name:` nel prompt) |
| `NFR3` | nessun segreto/rete nel ramo skills |
