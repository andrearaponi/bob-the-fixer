# Bob the Fixer

Local-first SonarQube + MCP server that turns static analysis into **fix-ready context** for AI coding assistants — optimized to help you **pay down technical debt**.

Website: https://bobthefixer.dev  
Docs: https://bobthefixer.dev/docs

[![CI](https://github.com/andrearaponi/bob-the-fixer/actions/workflows/ci.yml/badge.svg)](https://github.com/andrearaponi/bob-the-fixer/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/andrearaponi/bob-the-fixer/branch/main/graph/badge.svg)](https://codecov.io/gh/andrearaponi/bob-the-fixer)
![Version](https://img.shields.io/badge/version-0.5.5-blue)
![License](https://img.shields.io/badge/license-AGPL--3.0-green)
![MCP](https://img.shields.io/badge/MCP-Compatible-brightgreen)

Bob runs SonarQube locally (containerized), scans your code, and exposes **24 MCP tools** so assistants like Claude Code, Copilot CLI, Gemini CLI, or OpenAI Codex CLI can:

- Scan a project and apply quality gates
- Pull rich issue details (rule info + **plain-text** code context)
- Prioritize work (patterns, tech debt, coverage gaps, duplication)
- Iterate: fix → test → re-scan

> Privacy note: Sonar analysis runs on your SonarQube instance (often `localhost`). If your AI assistant uses a cloud model, any code you send to the model follows that provider's policy.

---

## Not a 1:1 SonarQube MCP wrapper

Bob is intentionally **not** a direct “SonarQube API over MCP” server. It’s an opinionated workflow that:

- Orchestrates the full loop (local SonarQube + scan + results)
- Aggregates and formats context so an AI assistant can fix issues faster (issue context, prioritization, coverage/duplication/tech-debt views)
- Encourages an iterative remediation flow: fix → test → re-scan

If you already have SonarQube Cloud/Server set up and just want a general-purpose MCP connector to browse/manage projects/issues/rules, check SonarSource’s server: https://github.com/SonarSource/sonarqube-mcp-server

---

## Quick start (recommended)

Install Bob (sets up SonarQube + token + MCP integration):

```bash
curl -fsSL https://raw.githubusercontent.com/andrearaponi/bob-the-fixer/main/install.sh | bash
```

Then, open your AI CLI inside the repo you want to analyze and ask:

```
Scan this project with Bob the Fixer, then show me details for the top critical issue.
```

---

## Agent Skills

Bob ships agent skills — playbooks that teach your AI assistant the high-value workflows on top of Bob's MCP tools:

- **`bob-zerodebt`** — drive technical debt to zero in a measurable loop: baseline scan → prioritized triage → batched fixes with rich issue context → re-scan verification → delta report, including the dependency (SCA) cycle with direct-dependency bumps.
- **`bob-issuecoverage`** — close test-coverage gaps with behavior-asserting tests: prioritized uncovered files → per-file gap analysis → real tests → measured coverage delta.
- **`bob-securitysweep`** — end-to-end security sweep across the three surfaces: guided hotspot review (verdicts stay human), SAST vulnerability fixes with data-flow context, dependency remediation (reachability-first), closed by a double re-scan and a CycloneDX SBOM.

The installer sets them up for every detected coding agent, each through its native mechanism:

| Agent | Mechanism | Manual install |
| --- | --- | --- |
| Claude Code | Agent Skills (`~/.claude/skills/`) | `cp -r skills/* ~/.claude/skills/` |
| Gemini CLI (≥ 0.45) | Agent Skills standard | `gemini skills install ./skills/<name>` (one per skill directory) |
| Codex CLI | Custom prompts (`~/.codex/prompts/`) | copy each `skills/*/SKILL.md` body (without frontmatter) to `~/.codex/prompts/<name>.md`, then use `/bob-zerodebt` |
| Copilot CLI | — | not supported (no user-level skill/prompt mechanism today) |

Then just ask, e.g. *"zero out the technical debt in this repo"* — the skill guides the workflow.

---

## Documentation

- Docs: https://bobthefixer.dev/docs
- Manual install (offline): `docs/MANUAL_INSTALLATION.md`
- Issues: https://github.com/andrearaponi/bob-the-fixer/issues

---

## Contributing

PRs are welcome. Please keep changes focused and well-tested, and update docs when behavior changes.

---

## License

Licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0). If you run a modified version as a network service, the AGPL requires you to make the source available.

See `LICENSE`.

---

Not affiliated with SonarSource.
