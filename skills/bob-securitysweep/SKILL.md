---
name: bob-securitysweep
description: Run an end-to-end security sweep with Bob the Fixer across SAST vulnerabilities, security hotspots, and dependency (SCA) findings. Use when the user asks for a security sweep, security review or audit, hotspot review, or to fix vulnerabilities across the project.
---

# Bob: Security Sweep

Sweep the three security surfaces Bob covers — SAST vulnerabilities, security hotspots, dependency vulnerabilities — and close with a verified re-scan and an SBOM. Security **verdicts stay human**: you assess, the user decides.

## Prerequisites

- The `bob-the-fixer` MCP server is connected. Check config with `sonar_config_manager` (`action: "view"`).
- For the dependency surface, confirm Trivy with `trivy_check_installation`.

## Phase 1 — Inventory (three surfaces)

1. Fresh scan: `sonar_scan_project` with an **absolute** `projectPath` (`autoSetup: false` unless first scan). Use `typeFilter: ["VULNERABILITY"]` to pull the SAST vulnerability list.
2. `sonar_get_security_hotspots` (`statuses: ["TO_REVIEW"]`) — code that *may* be dangerous and needs a human review.
3. `trivy_scan_dependencies` — dependency vulnerabilities, each with its dependency path (`Via:`) and reachability marker.
4. Record the baseline: vulnerabilities by severity, hotspots to review, dependency findings (reachable vs dormant). Every claim of progress is a delta against this.

## Phase 2 — Hotspot review (human-in-the-loop)

For each hotspot, in severity order:
1. `sonar_get_security_hotspot_details` — rule context, risk description, the exact code.
2. Read the surrounding source. Assess: is the risky pattern actually exploitable here (untrusted input? privileged sink?), or is it safe by construction?
3. Present your assessment and **ask the user for the verdict**: *fix*, *safe*, or *defer*. Never mark a hotspot safe on your own — record the user's verdicts for the final report.
4. For *fix* verdicts: remediate the root cause, then continue.

## Phase 3 — SAST vulnerabilities

Work in small batches, severity first:
1. For each vulnerability, `sonar_get_issue_details` with `includeDataFlow: "auto"` — the source→sink flow shows where untrusted data enters and where it lands. Fix at the right point of the flow (usually the sink, often also validating at the source).
2. Fix the root cause; never suppress. After each batch, re-scan (`autoSetup: false`) and confirm: fixed ones gone, no new issues.

## Phase 4 — Dependencies (SCA)

1. Group Trivy findings by the direct dependency in the `Via:` path; prioritize findings marked *reachable (imported in source)* over *dormant*.
2. Bump the direct dependency within its range; for transitives pinned by a parent, add the **narrowest** override that reaches the fixed version.
3. Upgrade **one package at a time** (install → build → tests → re-scan) so a breaking bump is immediately attributable and reversible; dependency upgrades are riskier than code fixes, so checkpoint with the user every few upgrades.
4. Re-run `trivy_scan_dependencies` until fixable HIGH/CRITICAL findings are gone.

## Phase 5 — Verify & attest

1. Re-scan both scanners; `sonar_get_quality_gate` for the verdict.
2. `trivy_generate_sbom` (`format: "cyclonedx"`) — the supply-chain artifact for this state of the tree.
3. `sonar_generate_report` (`format: "summary"`) plus the sweep report: baseline → now deltas per surface, the user's hotspot verdicts, and anything left open (deferred hotspots, unfixable vulns) with your recommendation.

## Guardrails (hard rules)

- **Security verdicts are human.** Never mark a hotspot safe or an issue false-positive yourself; Bob has no mutation tools — verdicts are the user's and live in the report.
- **Exposed secrets stop the line.** If you find credentials, tokens, or keys in code or config: stop remediating that finding, report it to the user immediately (rotation first), and never paste the secret itself into output, reports, or commits.
- **Tests after every security fix and dependency bump** — run the project's suite; broken behavior is not a remediation.
- **No suppressions** (`// NOSONAR`, disable comments) and no severity filtering to make the sweep look clean.
- Leave intentionally-vulnerable test fixtures untouched; they are test data.

## Stop conditions

Stop and hand back to the user when: exposed secrets are found (immediately); the gate is green and what remains needs product/security decisions; or a fix requires an architectural change (propose it instead).
