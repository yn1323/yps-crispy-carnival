---
name: shiftori-security-review
description: シフトリ / yps-crispy-carnival 固有のセキュリティ設計・コードレビュー・修正・自己更新を扱う。Use at the plan/spec/design stage before implementation when a task mentions or touches security, authn/authz, IDOR, magic link, token, invite, Webhook, LINE, Resend, billing, personal-data logs, Convex public query/mutation, staff token/session, manager/billing permissions, external HTTP actions, notification delivery, or registration/invitation flows. Also use during implementation/review of those areas and when the user corrects security perspective so this skill, references, and docs can self-repair.
---

# Shiftori Security Review

Use this skill to put a security lens into Shiftori work before a plan is finalized, then carry that lens through code review, implementation, tests, and skill/doc self-repair.

This is not a generic SAST skill. Treat it as Shiftori-specific application security guidance for a React + Convex + Clerk app with manager accounts, staff magic links, LINE/Resend notification delivery, store-scoped permissions, and billing-sensitive operations.

## First Read

1. Read `doc/rules/security-strategy.md`.
2. Read `doc/rules/testing-strategy.md` because security changes need the right test layer.
3. For Convex code, read `convex/AGENTS.md` and `convex/_generated/ai/guidelines.md`.
4. Read `references/shiftori-security-model.md` for the local trust boundaries.
5. Read `references/review-checklist.md` for plan/code review checks.
6. Inspect nearby public API, schema, helper, policy, tests, and scenario fixture before deciding.

Use `test-strategy` with this skill when choosing regression tests.
Use `shiftori-coding` with this skill when implementing repo code.
Use `convex-migration-helper` if a security fix changes persisted shape.

## Plan Stage Workflow

Run this before implementation plans are finalized for any security-sensitive task.

1. Classify the surface:
   - manager app with Clerk auth
   - staff magic-link or session flow
   - registration/invite flow
   - LINE/Resend/webhook/notification delivery
   - billing or paid-feature guard
   - public Convex query/mutation/action or HTTP action
   - logging or personal-data exposure
2. Write a short Security Lens in the plan:
   - Actor: who can call or trigger this?
   - Asset: what data, permission, delivery channel, or cost is protected?
   - Trust boundary: what user-controlled input crosses into server logic?
   - Abuse case: how could another shop, staff member, bot, or stale token misuse it?
   - Server-side check: what exact helper, relationship, token state, or rate limit must enforce the rule?
3. Decide the enforcement point before UI details:
   - Do not accept frontend visibility, local state, hidden form fields, long UUIDs, or route guards as authorization.
   - Prefer existing `managerQuery`, `managerMutation`, `staffSessionQuery`, `staffSessionMutation`, `rateLimit`, and internal functions.
4. Decide tests in the plan:
   - Function Test for single public query/mutation auth, IDOR, return DTO, token states, and rate limits.
   - Scenario Test for cross-use-case flows like notification fanout, staff sessions, dashboard, billing, and multi-shop isolation.

## Code Review Workflow

Review findings before summaries. For each finding, include the attack path, affected boundary, code pointer, fix shape, and regression test.

Check these first:

- Every public Convex function has runtime argument validators and only exposes needed fields.
- Every user-supplied ID is checked after fetch against `ctx.shop._id`, session shop, membership, owner relation, and `isDeleted` as applicable.
- Manager authority is derived from Clerk identity and active `shopMembers`, not client-provided `userId`, `shopId`, or role.
- Staff authority is derived from token/session rows plus staff/shop/recruitment consistency, not from staffId alone.
- Tokens are random, scoped, time-limited, revocable, and single-use when the flow requires it.
- Registration, invite, LINE linking, and legal consent tokens do not leak or grant cross-shop authority.
- Notification and external delivery flows have dedupe, rate limits, idempotency, and safe retry semantics.
- Logs avoid raw email addresses, tokens, webhook payloads, secrets, and third-party error bodies that may include PII.
- HTTP actions verify signatures/authentication/CORS intentionally and keep public route surface small.
- Billing-sensitive paths re-check server-side store membership and billing role/entitlement.

## Implementation Rules

- Prefer narrowing public surface with internal functions before adding a new public API.
- Use `ConvexError("Not found")` or the existing local pattern when distinguishing Forbidden would leak object existence.
- Return `null` or a minimal status object for public queries where the local pattern avoids throwing.
- Do not return full documents when a minimal DTO is enough.
- Use constants for TTL, limits, and retry windows.
- Keep security comments short and explain business rules or fragile assumptions.
- Add or update tests in the same change. Do not ship a security-sensitive behavior change without regression coverage unless the user explicitly accepts the risk.

## Self-Repair

When the user points out a missing security concern, weak threat model, unsafe wording, bad trigger condition, or preferred security pattern, do not stop at code changes.

1. Decide whether the feedback is one-off or durable guidance.
2. For durable guidance, update one or more of:
   - `references/review-checklist.md` for concrete review checks.
   - `references/shiftori-security-model.md` for trust-boundary or domain-model rules.
   - `doc/rules/security-strategy.md` for repo-level policy.
   - this `SKILL.md` and `agents/openai.yaml` if trigger wording or workflow changed.
3. Add a regression test when the feedback maps to code behavior.
4. State in the final response which code, tests, and skill/doc files changed.

## Validation

For skill/doc-only changes, run or explain why you could not run:

```bash
pnpm lint
pnpm type-check
```

For code touching Convex security boundaries, choose from:

```bash
pnpm test:convex:logic
pnpm test:convex:scenario
pnpm test:convex
```

Use `convex/_scenario/securityBoundaries.test.ts` as the first place to look for cross-shop, token/session, and notification-target regression patterns.
