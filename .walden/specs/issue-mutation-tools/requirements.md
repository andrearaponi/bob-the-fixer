---
status: approved
approved_at: 2026-07-15T08:57:43Z
last_modified: 2026-07-15T08:57:43Z
approved_fingerprint: sha256:80a8e3403a63fbe6a4d59a514b96be35cc53d643135a8133f7f3e9130fc7140a
---

# Requirements Document

## Introduction

Bob today is **read + fix-context only**: it scans, enriches findings, and helps fix them, but it **cannot persist a verdict** back to SonarQube. The `bob-securitysweep` skill states this limitation outright — *"Bob has no mutation tools — verdicts are the user's and live in the report"* — so a human/agent decision (false positive, won't-fix, hotspot reviewed) never reaches the source of truth and is lost on the next scan.

This feature closes that loop with a small set of **write-back MCP tools** that let the caller persist a decided verdict to the connected SonarQube: transition an issue, attach rationale, and change a security hotspot's status. It reuses Bob's existing authenticated write path (`SonarAdmin`); it does not add SARIF export, bulk operations, or any inference-driven mutation (those are out of scope). The tools are the *mechanism*; the skills' human-verdict guardrail governs *when* they are used.

The supported vocabularies are grounded in the live API of the target SonarQube (verified on 25.8), not assumed.

## Requirements

### R1 Persist an issue verdict (transition)

**User Story:** As an AI assistant running a triage loop, I want to transition an issue to its decided state, so that the verdict (confirmed, resolved, false positive, accepted, reopened) persists in SonarQube instead of only in a throwaway report.

#### Acceptance Criteria

1. `R1.AC1` WHEN the caller invokes the issue-transition tool with an issue key and a supported transition, the system SHALL submit that transition to the connected SonarQube.
2. `R1.AC2` WHEN a transition succeeds, the system SHALL return the issue's resulting status.
3. `R1.AC3` IF the requested transition is not one of the supported values, THEN the system SHALL reject the request without contacting SonarQube.
4. `R1.AC4` IF SonarQube rejects the transition, THEN the system SHALL return the error message reported by SonarQube.

### R2 Attach rationale to an issue (comment)

**User Story:** As an AI assistant recording why a finding was decided a certain way, I want to attach a comment to an issue, so that the rationale is auditable in SonarQube alongside the verdict.

#### Acceptance Criteria

1. `R2.AC1` WHEN the caller invokes the issue-comment tool with an issue key and non-empty text, the system SHALL submit the comment to SonarQube.
2. `R2.AC2` IF the comment text is empty or only whitespace, THEN the system SHALL reject the request without contacting SonarQube.

### R3 Persist a hotspot verdict (change status)

**User Story:** As an AI assistant completing a human-in-the-loop hotspot review, I want to change a security hotspot's status, so that a reviewed-safe / fixed / acknowledged decision persists in SonarQube.

#### Acceptance Criteria

1. `R3.AC1` WHEN the caller invokes the hotspot-status tool with a hotspot key and a valid target status, the system SHALL submit the status change to SonarQube.
2. `R3.AC2` IF the target status is REVIEWED and no resolution of SAFE, FIXED, or ACKNOWLEDGED is provided, THEN the system SHALL reject the request without contacting SonarQube.
3. `R3.AC3` IF the target status is not one of the supported values, THEN the system SHALL reject the request without contacting SonarQube.

### R4 Confirmed, permission-aware, safe mutation

**User Story:** As a user whose SonarQube is the shared source of truth, I want dismissive verdicts to require explicit confirmation and permission failures to be actionable, so that a finding is never silently hidden and I know exactly what to fix when a write is denied.

#### Acceptance Criteria

1. `R4.AC1` IF a finding-hiding verdict (an issue transition of falsepositive or accept, or a hotspot resolution of SAFE) is requested without an explicit confirmation flag set to true, THEN the system SHALL reject the request without contacting SonarQube.
2. `R4.AC2` IF SonarQube responds that the token lacks permission to mutate the finding, THEN the system SHALL return an actionable error naming the required permission.
3. `R4.AC3` IF no SonarQube token is configured or the server is unreachable, THEN the system SHALL return an actionable configuration error without throwing.

## Non-Functional Requirements

- `NFR1` Every mutation tool SHALL be exercised by unit tests against a mocked SonarQube HTTP client, with no live-server dependency in CI.
- `NFR2` The system SHALL keep the caller's token and raw `Authorization` header out of every error message and log line emitted by the mutation tools.

## Constraints And Dependencies

- `C1` Mutation reuses the existing `SonarAdmin` axios client (Bearer token + `application/x-www-form-urlencoded`); no new credential mechanism is introduced.
- `C2` The supported vocabularies match what the connected SonarQube (verified on 25.8) accepts: issue transitions `{confirm, resolve, falsepositive, accept, reopen}`; hotspot status `{TO_REVIEW, REVIEWED}` with resolution `{SAFE, FIXED, ACKNOWLEDGED}`.
- `C3` These tools mutate shared server state; they act only on explicit caller intent (governed by the skills' human-verdict guardrail), never on Bob's own inference.

## Out Of Scope

- SARIF export of scan results (a separate follow-up increment — the interop moat).
- `issues/assign`, `set_severity`, `set_type`, `set_tags`, and `bulk_change` (beyond the verdict loop).
- Secret-pattern detection inside comment/rationale text.
- Any UI; these are MCP tools only.
