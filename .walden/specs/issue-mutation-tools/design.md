---
status: approved
approved_at: 2026-07-15T09:02:27Z
last_modified: 2026-07-15T09:02:27Z
approved_fingerprint: sha256:2dd1c9e7c255e9fcbac66c6db44fa5cc436fbdd2c9e60fe23f59582f6427c475
source_requirements_approved_at: 2026-07-15T08:57:43Z
source_requirements_fingerprint: sha256:80a8e3403a63fbe6a4d59a514b96be35cc53d643135a8133f7f3e9130fc7140a
---

# Feature Design

## Overview

Three write-back MCP tools close Bob's loop: `sonar_transition_issue`, `sonar_comment_issue`, `sonar_change_hotspot_status`. Each follows the existing write-handler shape (`delete-project.handler.ts`): `validateInput(schema)` → build `SonarAdmin` from env → delegate → `MCPResponse`. The three POSTs are concentrated in one new focused class, `SonarFindingMutator`, the write-side counterpart to the read modules under `sonar/api/*`. It receives the **authenticated axios client from `SonarAdmin`** (Bearer + `x-www-form-urlencoded`), so no new credential path is introduced (`C1`).

Two behaviors distinguish these from the existing writes:

1. **Errors must surface, not be swallowed.** `SonarAdmin.deleteProject` returns `false` on failure, discarding SonarQube's message. The mutation methods instead throw a translated error so the handler can honor `R1.AC4` (surface Sonar's rejection) and `R4.AC2` (403 → name the missing permission). A single `translateSonarError` extracts only HTTP status + `data.errors[].msg` and never stringifies the axios error/config, keeping the token out of messages (`NFR2`).
2. **A conditional confirmation guard.** `delete_project` requires `confirm === true` unconditionally. Here `confirm` is required **only** for finding-hiding verdicts (issue `falsepositive`/`accept`, hotspot resolution `SAFE`) via a Zod `superRefine`, enforced pre-network (`R4.AC1`).

## Architecture

```text
MCP tool call
  → ToolRouter  (sonar_transition_issue | sonar_comment_issue | sonar_change_hotspot_status)
    → handler
        1. validateInput(Schema, args)      // enum vocab (C2) + conditional confirm guard (R4.AC1), pre-network
        2. new SonarAdmin(SONAR_URL, SONAR_TOKEN)   // token resolution + authed axios (C1)
        3. new SonarFindingMutator(admin.client)
        4. await mutator.<op>(...)          // form-encoded POST to Sonar web API
    ← MCPResponse (resulting status | actionable error; token redacted)

SonarFindingMutator (packages/core/src/sonar/api/SonarFindingMutator.ts)
  transitionIssue(key, transition, comment?)  → POST api/issues/do_transition  [+ api/issues/add_comment if comment]
  commentIssue(key, text)                       → POST api/issues/add_comment
  changeHotspotStatus(key, status, resolution?, comment?) → POST api/hotspots/change_status
  translateSonarError(err)  →  no response → config error (R4.AC3)
                               403          → "token needs 'Administer Issues'/'Administer Security Hotspots'" (R4.AC2)
                               other        → data.errors[].msg (R1.AC4)   // never includes token/headers (NFR2)
```

## Options Considered

### Option A — Dedicated `SonarFindingMutator` reusing `SonarAdmin`'s client (SCELTA)

- Summary: a focused write-side class (issues + hotspots) that takes the authed `AxiosInstance` from `SonarAdmin`; handlers wire `new SonarFindingMutator(admin.client)`.
- Why chosen: mirrors the read-side split (`SonarIssueApi`, `SonarRuleApi`, …) the codebase just adopted; keeps `SonarAdmin` focused on project/token lifecycle; the mutator depends only on an axios instance, so it is trivially unit-testable with a mock (`NFR1`); reuses the existing credential path verbatim (`C1`).

### Option B — Add `transitionIssue`/`commentIssue`/`changeHotspotStatus` methods to `SonarAdmin`

- Summary: no new class; three methods on the existing write client.
- Why rejected: re-bloats the class the recent refactor worked to keep single-purpose, mixes finding-mutation with project/token admin, and offers no testability gain (the mutator already reuses `SonarAdmin`'s client, so Option A duplicates nothing).

## Simplicity And Elegance Review

- Simplest viable shape: one small class (three thin POSTs + one error translator), three handlers that clone the proven `delete_project` shape, three Zod schemas, three tool defs, one router wire-up. No service layer, no new axios/credential code, no persistence.
- Coupling check: the mutator's only dependency is an `AxiosInstance`; it is blind to env, config, and MCP types. Handlers own env→client assembly; schemas own validation. Vocabulary lives in one place (Zod enums) reused by tool-def descriptions.
- Future-proofing: SARIF export and bulk/assign/severity mutations are intentionally deferred (declared Out Of Scope); `SonarFindingMutator` is the natural home if they are added later, without touching handlers already shipped.

## Components And Interfaces

### `SonarFindingMutator` — `packages/core/src/sonar/api/SonarFindingMutator.ts`

- Purpose: perform the three finding-mutation POSTs and translate SonarQube errors into safe, actionable messages.
- Inputs/Outputs: constructor `(client: AxiosInstance)`. Methods:
  - `transitionIssue(issueKey, transition, comment?)` → `Promise<{ status?: string; transition: string }>` (status read from `response.data.issue.status`); posts `add_comment` after a successful transition when `comment` is present.
  - `commentIssue(issueKey, text)` → `Promise<void>`.
  - `changeHotspotStatus(hotspotKey, status, resolution?, comment?)` → `Promise<void>`.
- Dependencies: the authed axios client from `SonarAdmin`; `URLSearchParams` for form encoding (as `deleteProject` does).
- Requirements: `R1`, `R2`, `R3`, `NFR2`

### Handlers — `packages/core/src/mcp/handlers/{transition-issue,comment-issue,change-hotspot-status}.handler.ts`

- Purpose: validate, assemble `SonarAdmin` + `SonarFindingMutator`, call the op, format `MCPResponse`.
- Inputs/Outputs: `handle*(args, correlationId?) → MCPResponse`; success text states the resulting status/confirmation; `catch` returns `{ isError: true }` with the translated message.
- Dependencies: `validateInput`, `sanitizeUrl`, `SonarAdmin`, `SonarFindingMutator`.
- Requirements: `R1`, `R2`, `R3`, `R4`, `C1`

### Schemas — `packages/core/src/shared/validators/mcp-schemas.ts`

- `SonarTransitionIssueSchema`: `issue: z.string().min(1)`, `transition: z.enum(['confirm','resolve','falsepositive','accept','reopen'])`, `comment: z.string().min(1).optional()`, `confirm: z.boolean().optional()`, `.superRefine` → require `confirm===true` when `transition ∈ {falsepositive, accept}`.
- `SonarCommentIssueSchema`: `issue: z.string().min(1)`, `text: z.string().trim().min(1)` (empty/whitespace rejected, `R2.AC2`).
- `SonarChangeHotspotStatusSchema`: `hotspot: z.string().min(1)`, `status: z.enum(['TO_REVIEW','REVIEWED'])`, `resolution: z.enum(['SAFE','FIXED','ACKNOWLEDGED']).optional()`, `comment: z.string().min(1).optional()`, `confirm: z.boolean().optional()`, `.superRefine` → require resolution when `status==='REVIEWED'` (`R3.AC2`) and `confirm===true` when `resolution==='SAFE'` (`R4.AC1`).
- Requirements: `R1`, `R2`, `R3`, `R4`, `C2`

### Tool definitions + router — `tool-definitions.ts`, `ToolRouter.ts` (+ `ToolRouter.test.ts`)

- Purpose: register the three tools (count 24 → 27); descriptions state the vocab and that dismissive verdicts need `confirm`.
- Requirements: `R1`, `R2`, `R3`

## Data Models

- Issue transition (`C2`): `confirm | resolve | falsepositive | accept | reopen`. `accept` is 25.8's modern "won't fix"; legacy `wontfix` is intentionally not exposed.
- Hotspot status/resolution (`C2`): status `TO_REVIEW | REVIEWED`; resolution `SAFE | FIXED | ACKNOWLEDGED` (required iff `REVIEWED`).
- SonarQube error shape consumed: `{ errors: [{ msg: string }] }` under `error.response.data`.

## Error Handling

- `translateSonarError(error, ctx)` (module-private in the mutator):
  - no `error.response` (ECONNREFUSED/timeout) → config/reachability error (`R4.AC3`).
  - `status === 403` → actionable message naming the required permission ("Administer Issues" for issues, "Administer Security Hotspots" for hotspots) (`R4.AC2`).
  - otherwise → `data.errors?.[0]?.msg` or a generic fallback (`R1.AC4`).
  - It reads only `status` + `data.errors[].msg`; it never spreads/stringifies `error` or `error.config`, so the `Authorization` header/token cannot leak (`NFR2`).
- Missing token / bad URL: `SonarAdmin` builds with an undefined token → the first call yields 401/config error, surfaced via the same translator; handler wraps in `isError` (`R4.AC3`).
- Pre-network validation (enum, empty text, conditional confirm, resolution-required) is enforced by `validateInput`; a `ValidationError` is caught and returned as `isError` without any HTTP call.

## Security Considerations

- These tools mutate the shared source of truth. Defenses: the conditional `confirm` guard on finding-hiding verdicts (`R4.AC1`); explicit-intent only — no inference-driven mutation (`C3`), reinforced by the skills' human-verdict guardrail; token redaction in all error paths (`NFR2`); reuse of the vetted `SonarAdmin` auth path with `URLSearchParams` (values form-encoded, not interpolated), so no injection via issue key or comment text.

## Failure Modes And Tradeoffs

- Failure mode: transition succeeds but the follow-up `add_comment` fails. Mitigation: the transition (the primary verdict) is already persisted; the handler reports the comment failure as a warning rather than failing the whole call. Tradeoff: accepted non-atomicity to stay within the two documented endpoints instead of `bulk_change` (out of scope).
- Failure mode: a state-invalid transition (e.g., resolving an already-resolved issue). Mitigation: SonarQube rejects it; `translateSonarError` surfaces the reason (`R1.AC4`) — Bob does not pre-model per-issue state.
- Failure mode: caller marks a finding false-positive/safe by over-eagerness. Mitigation: `confirm` guard + the skills' human-verdict rule; the action is reversible (`reopen` / `resetastoreview`).
- Tradeoff: the exposed transition set is curated (5 of 9) to match the fix loop; niche transitions (`resolveasreviewed`, `resetastoreview`, `wontfix`) are omitted for a smaller, clearer surface.

## Testing Strategy

- Unit (mutator): mock `AxiosInstance`; assert correct endpoint + form params per method; assert the resulting status is read from the response; assert `translateSonarError` maps no-response → config, 403 → permission, other → `data.errors[].msg`; assert a rejected error carrying an `Authorization` header/token produces a message that does **not** contain the token (`NFR2`).
- Unit (schemas): reject bad enum, empty comment/whitespace, `REVIEWED` without resolution, and finding-hiding verdicts without `confirm`; accept the valid happy paths.
- Unit (handlers): mock the mutator; success → text with status; thrown error → `isError` with the translated message; missing token → config error.
- Router: `ToolRouter.test.ts` count 24 → 27; the three names resolve to their handlers.
- No live-server dependency in CI (`NFR1`).

## Verification Plan

- Requirement proof: schema tests prove `R1.AC3`, `R2.AC2`, `R3.AC2/AC3`, `R4.AC1`; mutator/handler tests prove `R1.AC1/AC2/AC4`, `R2.AC1`, `R3.AC1`, `R4.AC2/AC3`, `NFR2`.
- Test evidence: `npm test` (vitest) green including the new suites; `walden task complete` per task.
- Operational evidence: against the live 25.8 instance — scan a fixture to create a real issue + hotspot, then `sonar_transition_issue` (verify status flips in `api/issues/search`), `sonar_comment_issue` (verify via `api/issues/search` comments), `sonar_change_hotspot_status` (verify via `api/hotspots/search`). This also confirms the `response.data.issue.status` extraction path for `R1.AC2`.

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `SonarFindingMutator.transitionIssue` + `transition-issue.handler` + `SonarTransitionIssueSchema` + tool def |
| `R2` | `SonarFindingMutator.commentIssue` + `comment-issue.handler` + `SonarCommentIssueSchema` + tool def |
| `R3` | `SonarFindingMutator.changeHotspotStatus` + `change-hotspot-status.handler` + `SonarChangeHotspotStatusSchema` + tool def |
| `R4` | schemas' conditional `confirm`/resolution `superRefine` (AC1) + `translateSonarError` (AC2 permission, AC3 config) |
| `NFR1` | mutator/handler/schema unit tests with mocked axios; no live-server dependency |
| `NFR2` | `translateSonarError` reads only status + `data.errors[].msg`; test asserts token absent from message |
| `C1` | handlers pass `SonarAdmin.client` into `SonarFindingMutator` |
| `C2` | Zod enums for transition/status/resolution |
| `C3` | `confirm` guard + skills' human-verdict guardrail (no inference-driven mutation) |
