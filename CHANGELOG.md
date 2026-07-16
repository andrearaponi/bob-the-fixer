# Changelog

All notable changes to Bob the Fixer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-07-16

Bob learns to write back. This release closes the loop from "scan and fix" to
"scan, fix, and **persist the verdict**", adds a full dependency-security (SCA)
surface with Trivy, ships agent skills for the three flagship workflows, and
completes a major internal refactoring. MCP tools: **21 → 27**.

### Added

- **Issue & hotspot mutation tools** — persist a decided verdict to SonarQube so it survives the next scan and stays auditable:
  - `sonar_transition_issue` — `confirm` / `resolve` / `falsepositive` / `accept` / `reopen`, with an optional rationale comment. Dismissive verdicts (`falsepositive`, `accept`) require `confirm: true`.
  - `sonar_comment_issue` — attach an auditable rationale comment to an issue.
  - `sonar_change_hotspot_status` — `TO_REVIEW`, or `REVIEWED` with `SAFE` / `FIXED` / `ACKNOWLEDGED`; marking a hotspot `SAFE` requires `confirm: true`.
- **Dependency security (SCA) via Trivy**:
  - `trivy_scan_dependencies` — dependency vulnerabilities enriched with the full dependency path (`Via:`), the direct dependency to bump, and reachability triage (*reachable — imported in source* vs *dormant*).
  - `trivy_check_installation` — Trivy availability and version check, with install hints.
  - `trivy_generate_sbom` — CycloneDX / SPDX SBOM generation.
- **Agent skills** (`skills/`): `bob-zerodebt`, `bob-issuecoverage`, `bob-securitysweep` — workflow playbooks installed per detected coding agent (Claude Code, Gemini CLI, Codex CLI, GitHub Copilot CLI) by the installer. Security verdicts stay human; the skills now persist the user's decisions through the mutation tools.
- **CI hardening**: ESLint gate, Trivy security gate (fails the build on fixable HIGH/CRITICAL findings), `npm ci`, and a supported-Node matrix (20.x / 22.x).

### Changed

- Scanner architecture: an `IScanner` scan-and-return contract with a `ScannerRegistry`; SonarQube and Trivy are peer scanners behind one abstraction.
- The SonarQube client God object (3,288 lines) is now a thin facade (373 lines) over focused modules: `ScannerParameterBuilder`, `SonarSourceFetcher`, `SonarRuleApi`, `SonarIssueApi`, `SonarMeasureApi`, `SonarScanRunner`. Behavior unchanged, verified by full-suite parity.
- npm `overrides` are scoped per-parent instead of global (e.g. `ajv` is pinned only under `@modelcontextprotocol/sdk`).

### Fixed

- Five robustness/correctness bugs surfaced by a deep review, plus a latent logger crash on an undefined log path exposed by typed `fs` imports.
- Trivy dependency-path resolution names the real direct dependency to bump instead of the workspace/project package itself.
- `install.sh` declares `unzip` as a required dependency for sonar-scanner installation.

### Security

- Resolved all 63 known npm dependency vulnerabilities (63 → 0) via in-range updates and narrowly-scoped overrides; the CI Trivy gate keeps it that way.
- Fixed a command injection and a token leak in the .NET analysis path.
- Terminated flag parsing with `--` before user-supplied paths in Trivy invocations (argv flag-smuggling hardening).
- Removed a dead, unauthenticated `/api/issues` REST endpoint from the HTTP transport.

### Removed

- The inert TSyringe dependency-injection layer (`tsyringe`, `reflect-metadata`); the handler function map is the single wiring point.

[0.6.0]: https://github.com/andrearaponi/bob-the-fixer/compare/0.5.5...0.6.0
