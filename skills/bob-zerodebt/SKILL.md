---
name: bob-zerodebt
description: Systematically drive a project's technical debt to zero with Bob the Fixer (SonarQube + Trivy MCP tools). Use when the user asks to zero out or pay down technical debt, fix all sonar issues, clean up code quality, or resolve dependency vulnerabilities in bulk.
---

# Bob: Zero Debt

Drive technical debt down in a measurable loop: baseline → triage → batched fixes → re-scan → report. Never "fix" blind; every batch is verified against the previous scan.

## Prerequisites

- The `bob-the-fixer` MCP server is connected (27 Sonar/Trivy tools available).
- Check config with `sonar_config_manager` (`action: "view"`); if broken, run `sonar_diagnose_permissions`.
- For the dependency cycle, confirm Trivy first with `trivy_check_installation`.

## Phase 1 — Baseline (numbers first)

1. Scan: `sonar_scan_project` with an **absolute** `projectPath`. Use `autoSetup: true` only on the very first scan of a project; **every** subsequent scan uses `autoSetup: false`.
2. Snapshot the debt:
   - `sonar_get_technical_debt` (`includeBudgetAnalysis: true`) — effort, ROI, prioritized plan.
   - `sonar_get_project_metrics` — bugs, vulnerabilities, code smells, coverage, duplication.
   - `sonar_get_quality_gate` — the pass/fail verdict you are trying to turn green.
   - `trivy_scan_dependencies` — dependency vulnerabilities (SCA).
3. Record the baseline numbers (issues by severity/type, debt effort, gate status, vuln count). Every later claim of progress is a delta against this.

## Phase 2 — Triage

Order of attack:
1. **BLOCKER/CRITICAL bugs and vulnerabilities** — correctness and security first.
2. **Serial fixes**: run `sonar_analyze_patterns` (`groupBy: "rule"`, `includeImpact: true`). One rule violated in 30 places is one fix pattern applied 30 times — batch these.
3. **High-ROI code smells** from the technical-debt plan.
4. **Dependencies**: group Trivy findings by the direct dependency shown in the report's `Via:` path and "bump X" hints; prioritize findings marked *reachable (imported in source)* over *dormant*.

Present the plan (what, in which order, expected batches) before editing.

## Phase 3 — Fix loop (code issues)

Work in batches of 5–10 issues:
1. For each issue, call `sonar_get_issue_details` (rule details, compliant/non-compliant examples, file path, data flow when present). Fix the **root cause** in the source with your editing tools — never suppress.
2. After each batch: re-scan with `autoSetup: false`, then compare against the baseline:
   - fixed issues gone? no **new** issues introduced?
3. If a batch introduces new issues: stop, review the offending fix, correct it before the next batch.

## Phase 4 — Dependency cycle (SCA)

1. From the Trivy report, bump the **direct dependency** named by the dependency path (not the transitive package itself) within its manifest range when possible.
2. For transitives pinned by a parent, add a scoped override/resolution to the fixed version — keep overrides as narrow as possible.
3. Reinstall, build, run the project's test suite, then `trivy_scan_dependencies` again. Repeat until fixable HIGH/CRITICAL findings are gone.
4. Optionally produce the compliance artifact: `trivy_generate_sbom` (`format: "cyclonedx"` or `"spdx-json"`).

## Phase 5 — Verify & report

1. `sonar_get_quality_gate` — aim for green.
2. `sonar_generate_report` (`format: "summary"`) plus the measured delta vs the baseline (issues by severity, debt effort, vulns closed).
3. List anything intentionally left open (won't-fix candidates, unfixable vulns) for the user to decide. Once the user confirms a finding is a false positive or won't-fix, persist that verdict with `sonar_transition_issue` (`transition: "falsepositive"` or `"accept"`, `confirm: true`, `comment:` the reason) so it stops recurring and the decision stays auditable.

## Guardrails (hard rules)

- **Never** mark an issue false-positive or won't-fix on your own; only after explicit human confirmation, then persist it via `sonar_transition_issue` (`confirm: true`). Never dismiss findings to hit the target or turn the gate green.
- **No suppressions** (`// NOSONAR`, disable comments, coverage/lint exclusions) without explicit approval — fix the cause, not the signal.
- **Re-scan after every batch**; never report progress from memory.
- **Stop on regressions**: a batch that adds new issues gets reviewed before anything else proceeds.
- Leave intentionally-vulnerable test fixtures untouched (they are test data, not debt).
- Run the project's own test suite after risky fixes and after every dependency bump; a green scan with red tests is not progress.

## Stop conditions

Stop and hand back to the user when: the quality gate is green and remaining findings need product decisions; a fix requires an architectural change; or the same issue survives two fix attempts (explain what you tried).
