# Shiftori Security Review Checklist

Use this checklist for both pre-implementation plans and code review. Focus on the sections matching the touched surface.

## Planning Checklist

- [ ] Name the actor, asset, trust boundary, abuse case, and server-side check.
- [ ] Identify every public Convex function or HTTP action involved.
- [ ] Decide whether any new function can be internal instead of public.
- [ ] Decide which ID fields are user-controlled and how each is authorized after fetch.
- [ ] Decide token TTL, scope, used/revoked behavior, and rate limit before implementation.
- [ ] Decide what logs are needed and which PII/secrets must be excluded.
- [ ] Decide the test layer with `test-strategy` before implementation.

## Public Convex API

- [ ] Has `args` validation, including `args: {}` where no args are expected.
- [ ] Does not trust client-provided `userId`, `shopId`, role, staffId, recruitmentId, or token context.
- [ ] Fetches by ID and then verifies relationship to `ctx.shop`, membership, or staff session.
- [ ] Handles `isDeleted` for every related document.
- [ ] Avoids leaking object existence through different errors when unauthorized.
- [ ] Returns minimal DTOs instead of full documents.
- [ ] Uses indexes and limits instead of unbounded `.collect()` on attacker-influenced paths.

## Manager / Billing Authorization

- [ ] Uses `managerQuery` / `managerMutation` or an equivalent verified helper.
- [ ] Resolves selected `shopId` through active membership.
- [ ] Does not rely on frontend route guards or hidden controls.
- [ ] Billing-sensitive operations re-check billing role/entitlement server-side.
- [ ] Multi-store users cannot accidentally operate on the first membership when a selected shop is required.

## Staff Token / Session Flow

- [ ] Token/session lookup is server-side only.
- [ ] Checks `expiresAt`, `usedAt`, `revokedAt`, and `accessKind` where relevant.
- [ ] Re-fetches staff, shop, and recruitment and checks matching `shopId` plus non-deleted state.
- [ ] Submit and view flows cannot be swapped.
- [ ] Verification or resend paths are rate-limited.
- [ ] Response does not enable account/email/token enumeration beyond the intended UX.

## Registration / Invite / Legal Consent / LINE Link Tokens

- [ ] Token is random and scoped to store and subject.
- [ ] Token has TTL and explicit revoke/reuse handling.
- [ ] Single-use flows persist and check `usedAt`.
- [ ] Reissue/newest-only flows revoke older unused tokens.
- [ ] Manager invites require logged-in identity and server-side email or membership matching.
- [ ] Staff registration approval remains manager-controlled and store-scoped.

## Notification / LINE / Resend / Webhook

- [ ] User-triggered send/retry paths have rate limits and idempotency/dedupe keys.
- [ ] Repeated clicks cannot schedule duplicate expensive jobs.
- [ ] Webhook routes verify provider signature before parsing or mutating state.
- [ ] External API errors are sanitized before returning to clients or manager UI.
- [ ] Logs avoid raw email addresses, tokens, authorization headers, and webhook bodies.
- [ ] Notification target queries exclude deleted staff, other-store staff, and wrong-channel targets.
- [ ] UI text distinguishes accepted/scheduled/retrying from delivered.

## HTTP Actions / CORS

- [ ] Every route in `convex/http.ts` has an explicit reason to be public HTTP.
- [ ] Authenticated HTTP routes use `ctx.auth.getUserIdentity()` or a verified provider signature.
- [ ] CORS origins are explicit, not wildcard for credentialed or sensitive routes.
- [ ] Request body size and method are appropriate for the route.
- [ ] OPTIONS handling does not grant broader methods/headers than needed.

## Logging / Observability

- [ ] Authn/authz failures and suspicious business-flow attempts are observable.
- [ ] Logs include safe who/what/where/when context when useful.
- [ ] Logs exclude secrets, raw tokens, full email addresses, full webhook payloads, and sensitive third-party response bodies.
- [ ] Client-facing errors do not reveal internal configuration, provider secrets, or object existence.

## Test Mapping

- [ ] Function Test covers single API authn/authz, IDOR, token states, return DTO, and rate limits.
- [ ] Scenario Test covers multi-step store isolation, notification target filtering, staff sessions, billing flows, and dashboard effects.
- [ ] Existing `convex/_scenario/securityBoundaries.test.ts` was checked before adding a new security scenario file.
- [ ] The regression test would fail on the unsafe implementation.

## Review Output Format

Use this order when reviewing:

1. Findings, ordered by severity.
2. Open questions or assumptions.
3. Security Lens summary if the task is still in planning.
4. Test plan.
5. Skill/doc self-repair note if user feedback changed durable guidance.
