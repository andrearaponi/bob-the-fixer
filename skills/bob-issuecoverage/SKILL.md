---
name: bob-issuecoverage
description: Close test-coverage gaps with Bob the Fixer's SonarQube tools by writing behavior-asserting tests for uncovered code. Use when the user asks to raise test coverage, close coverage gaps, cover untested files, or reach a coverage target.
---

# Bob: Issue Coverage

Raise real test coverage in a measurable loop: find the uncovered code, write tests that assert behavior, re-scan, report the delta. Coverage is the by-product of good tests — never the goal of a fake one.

## Prerequisites

- The `bob-the-fixer` MCP server is connected.
- The project has a working test command (find it in the project's manifest/README) — every new test must run green locally before it counts.
- Coverage data appears in SonarQube only if the scan ingests a coverage report; if metrics show no coverage at all, fix the project's coverage wiring first and tell the user.

## Phase 1 — Measure

1. Fresh scan: `sonar_scan_project` with an **absolute** `projectPath` (`autoSetup: false` unless this is the very first scan).
2. `sonar_get_uncovered_files` (`targetCoverage`, `maxFiles`, `sortBy: "coverage"`, `includeNoCoverageData: true`) — the prioritized list of files below target.
3. `sonar_get_project_metrics` (`metrics: ["coverage"]`) — record the baseline overall coverage.

## Phase 2 — Pick targets

- Prefer files with **0% or very low coverage and many uncovered lines**, and core logic over glue/config.
- Skip generated code, type-only files, and thin wrappers — testing them is coverage theater.
- If the candidate list is long, present the top targets and confirm the batch with the user before writing tests.

## Phase 3 — Per-file loop

For each target file:
1. `sonar_get_coverage_gaps` (`componentKey` for the file, `minGapSize`, `includePartialBranch: true`) — the exact uncovered lines and half-covered branches.
2. Read the source. Understand what each uncovered region *does* (branches, error paths, edge cases) before writing anything.
3. Write **behavior-asserting tests** in the repo's existing test framework and conventions: arrange/act/assert on the uncovered branches, including the failure paths. Name tests after the behavior, not the line numbers.
4. Run the project's test command locally; all new tests must pass (and fail if the behavior breaks — spot-check by mentally inverting an assertion).

## Phase 4 — Re-scan & delta

1. Re-scan with `autoSetup: false`.
2. `sonar_get_project_metrics` (`metrics: ["coverage"]`) and `sonar_get_uncovered_files` again — report the per-file and overall delta vs the baseline.
3. Iterate Phases 2–4 until the target is reached or only low-value files remain (say so explicitly).

## Guardrails (hard rules)

- **Every test asserts behavior.** Assertion-free tests, snapshot-everything tests, or tests that merely execute code to inflate the percentage are forbidden.
- **Do not modify production code** for testability (exports, seams, DI changes) without explicit user approval — propose the change and wait.
- **No coverage exclusions** (config that hides files from coverage) to hit the target.
- Follow the repo's existing test patterns (framework, file naming, mock style); don't introduce a second test stack.
- Flaky tests are worse than missing tests: no timing-dependent or order-dependent assertions.

## Stop conditions

Stop and hand back to the user when: the coverage target is reached; the remaining uncovered code needs production refactoring to be testable (propose it instead); or coverage data is not flowing into SonarQube despite a correct local run.
