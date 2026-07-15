---
status: approved
approved_at: 2026-07-15T09:06:23Z
last_modified: 2026-07-15T09:21:41Z
approved_fingerprint: sha256:ff16fc0776bf578f940ac558b3ad2a15af7e29f5220763862cc27c8b48764e3e
source_design_approved_at: 2026-07-15T09:02:27Z
source_design_fingerprint: sha256:2dd1c9e7c255e9fcbac66c6db44fa5cc436fbdd2c9e60fe23f59582f6427c475
---

# Implementation Plan

Three write-back MCP tools that persist a finding verdict to SonarQube. Build order: core write layer (mutator + schemas) → MCP surface (handlers + tool defs + router) → verify (build + full suite + live operational proof against the 25.8 instance).

- [x] 1. Core write layer
  - [x] 1.1 `SonarFindingMutator` (`packages/core/src/sonar/api/SonarFindingMutator.ts`) + unit tests: constructor `(client)`; `transitionIssue`/`commentIssue`/`changeHotspotStatus` as form-encoded POSTs to `issues/do_transition`, `issues/add_comment`, `hotspots/change_status`; read resulting status from `response.data.issue.status`; `translateSonarError` maps no-response → config (`R4.AC3`), 403 → required-permission (`R4.AC2`), else `data.errors[].msg` (`R1.AC4`), never leaking the token (`NFR2`)
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC4`, `R2.AC1`, `R3.AC1`, `R4.AC2`, `R4.AC3`, `NFR2`
    - Design: Components And Interfaces → `SonarFindingMutator`; Error Handling
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/sonar/api/SonarFindingMutator.test.ts"]
        covers: ["R1.AC1", "R1.AC2", "R1.AC4", "R2.AC1", "R3.AC1", "R4.AC2", "R4.AC3", "NFR2"]
  - [x] 1.2 Zod schemas in `mcp-schemas.ts` + tests: `SonarTransitionIssueSchema` (enum transitions, `superRefine` confirm for `falsepositive`/`accept`), `SonarCommentIssueSchema` (trimmed non-empty text), `SonarChangeHotspotStatusSchema` (status/resolution enums, `superRefine` resolution-required-when-REVIEWED and confirm-when-SAFE)
    - Requirements: `R1.AC3`, `R2.AC2`, `R3.AC2`, `R3.AC3`, `R4.AC1`, `C2`, `C3`
    - Design: Components And Interfaces → Schemas; Data Models
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/shared/validators/mcp-schemas.test.ts"]
        covers: ["R1.AC3", "R2.AC2", "R3.AC2", "R3.AC3", "R4.AC1"]
      - command: ["sh", "-c", "grep -q \"'falsepositive'\" packages/core/src/shared/validators/mcp-schemas.ts && grep -q \"'ACKNOWLEDGED'\" packages/core/src/shared/validators/mcp-schemas.ts && grep -q \"'REVIEWED'\" packages/core/src/shared/validators/mcp-schemas.ts"]
        covers: ["C2", "C3"]
- [x] 2. MCP surface
  - [x] 2.1 Three handlers (`transition-issue`, `comment-issue`, `change-hotspot-status`) + tests: each validates via its schema, builds `SonarAdmin` from env and passes `admin.client` into `SonarFindingMutator` (`C1`), formats success text with the resulting status/confirmation, and returns `{ isError: true }` with the translated actionable message on failure (`R4.AC2`, `R4.AC3`)
    - Requirements: `R4.AC2`, `R4.AC3`, `C1`
    - Design: Components And Interfaces → Handlers
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/mcp/handlers/transition-issue.handler.test.ts src/mcp/handlers/comment-issue.handler.test.ts src/mcp/handlers/change-hotspot-status.handler.test.ts"]
        covers: ["R4.AC2", "R4.AC3", "C1"]
  - [x] 2.2 Register the three tools in `tool-definitions.ts` (descriptions state the vocab and that dismissive verdicts need `confirm`) and wire them in `ToolRouter.ts`; update `ToolRouter.test.ts` count 24 → 27
    - Requirements: `R1.AC1`, `R2.AC1`, `R3.AC1`
    - Design: Components And Interfaces → Tool definitions + router
    - Verification:
      - command: ["sh", "-c", "cd packages/core && npx vitest run src/mcp/ToolRouter.test.ts"]
        covers: ["R1.AC1", "R2.AC1", "R3.AC1"]
      - command: ["sh", "-c", "grep -q \"name: 'sonar_transition_issue'\" packages/core/src/mcp/tool-definitions.ts && grep -q \"name: 'sonar_comment_issue'\" packages/core/src/mcp/tool-definitions.ts && grep -q \"name: 'sonar_change_hotspot_status'\" packages/core/src/mcp/tool-definitions.ts"]
        covers: ["R1.AC1", "R2.AC1", "R3.AC1"]
- [x] 3. Verify
  - [x] 3.1 Full build + complete test suite green (no live-server dependency in CI)
    - Requirements: `NFR1`
    - Design: Testing Strategy; Verification Plan
    - Verification:
      - command: ["npm", "run", "build"]
        expect_exit: 0
      - command: ["sh", "-c", "cd packages/core && npx vitest run"]
        expect_exit: 0
        covers: ["NFR1"]
  - [x] 3.2 Live operational proof against the 25.8 instance: `scripts/verify-mutation-live.sh` scans a fixture to create a real issue + hotspot, drives the three mutations, and asserts via `api/issues/search` / `api/hotspots/search` that status/comment actually changed
    - Requirements: `R1.AC1`, `R2.AC1`, `R3.AC1`
    - Design: Verification Plan → Operational evidence
    - Verification:
      - command: ["sh", "-c", "bash scripts/verify-mutation-live.sh"]
        expect_exit: 0
        covers: ["R1.AC1", "R2.AC1", "R3.AC1"]
