# Shiftori Security Review Checklist

Use this checklist for both pre-implementation plans and code review. Focus on the sections matching the touched surface.

## Planning Checklist

- [ ] Name the actor, asset, trust boundary, abuse case, and server-side check.
- [ ] Identify every public Convex function or HTTP action involved.
- [ ] Decide whether any new function can be internal instead of public.
- [ ] Decide which ID fields are user-controlled and how each is authorized after fetch.
- [ ] Decide token TTL, scope, used/revoked behavior, and rate limit before implementation.
- [ ] Decide authority revocation, workflow recovery, retention, and deletion behavior where applicable.
- [ ] Decide what logs are needed and which PII/secrets must be excluded.
- [ ] Decide the test layer with `test-strategy` before implementation.

## Public Convex API

- [ ] Has `args` validation, including `args: {}` where no args are expected.
- [ ] Has a `returns` validator matching the minimal public DTO.
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
- [ ] Store-scoped APIs require the selected shop, and first-membership fallback is limited to bootstrap flows.
- [ ] Stripe test/live selection is derived from the secret key, and Price, Customer, Subscription, Checkout, and webhook `livemode` values are checked against it.
- [ ] A new-sales stop archives the configured Price without disabling webhook or existing-contract safety processing; already-created open Checkout Sessions have a separate expiry procedure.

## Staff Token / Session Flow

- [ ] Token/session lookup is server-side only.
- [ ] Checks `expiresAt`, `usedAt`, `revokedAt`, and `accessKind` where relevant.
- [ ] Re-fetches staff, shop, and recruitment and checks matching `shopId` plus non-deleted state.
- [ ] Submit and view flows cannot be swapped.
- [ ] Verification or resend paths are rate-limited.
- [ ] Response does not enable account/email/token enumeration beyond the intended UX.

## Registration / Invite / Legal Consent / LINE Link Tokens

- [ ] Token is random and scoped to store and subject.
- [ ] Persisted capability secrets use a digest unless raw retention has an explicit reason and expiry.
- [ ] Token has TTL and explicit revoke/reuse handling.
- [ ] Single-use flows persist and check `usedAt`.
- [ ] Reissue/newest-only flows revoke older unused tokens.
- [ ] Reusable public links have manager-controlled disable and rotation.
- [ ] Anonymous registration has bot proof, layered rate limits, generic responses, and a bounded pending queue.
- [ ] Manager invites require logged-in identity and server-side email or membership matching.
- [ ] Staff registration approval remains manager-controlled and store-scoped.

## Notification / LINE / Resend / Webhook

- [ ] User-triggered send/retry paths have rate limits and idempotency/dedupe keys.
- [ ] Repeated clicks cannot schedule duplicate expensive jobs.
- [ ] Webhook routes verify provider signature before parsing or mutating state.
- [ ] External API errors are sanitized before returning to clients or manager UI.
- [ ] Logs avoid raw email addresses, tokens, authorization headers, and webhook bodies.
- [ ] Notification target queries exclude deleted staff, other-store staff, and wrong-channel targets.
- [ ] Internal state distinguishes accepted/scheduled/retrying from delivered. Manager UI may say `送りました` / `再送しました` after a successful send action, but does not claim `届きました` without delivery confirmation.
- [ ] Fanout progress is persisted and can resume without duplicating or dropping recipients.
- [ ] Processing claims have expiring leases and stale workers cannot finalize them.
- [ ] Provider idempotency keys stay stable across retries where the provider supports them.
- [ ] Deleted or deactivating shops and staff cannot be enqueued or delivered to without an explicit in-flight policy.

## HTTP Actions / CORS

- [ ] Every route in `convex/http.ts` has an explicit reason to be public HTTP.
- [ ] Authenticated HTTP routes use `ctx.auth.getUserIdentity()` or a verified provider signature.
- [ ] Service routes verify a server-side credential or signed request and define rotation and revocation.
- [ ] Timestamp, nonce, or event ID checks reject replay when the caller provides them.
- [ ] CORS origins are explicit, not wildcard for credentialed or sensitive routes.
- [ ] Request body size and method are appropriate for the route.
- [ ] OPTIONS handling does not grant broader methods/headers than needed.

## Logging / Observability

- [ ] Authn/authz failures and suspicious business-flow attempts are observable.
- [ ] Logs include safe who/what/where/when context when useful.
- [ ] Logs exclude secrets, raw tokens, full email addresses, full webhook payloads, and sensitive third-party response bodies.
- [ ] Client-facing errors do not reveal internal configuration, provider secrets, or object existence.
- [ ] Auth UI masks email addresses and phone numbers at the rendering boundary, even when an identity provider labels a returned value as safe or masked.
- [ ] Retention and redaction rules cover notification payloads, expired tokens, sessions, and provider errors.
- [ ] Cleanup and tenant-erasure jobs are bounded, idempotent, and resumable.

## Test Mapping

- [ ] Function Test covers single API authn/authz, IDOR, token states, return DTO, HTTP signature/credential/replay, rate limits, and lease transitions.
- [ ] Scenario Test covers multi-step store isolation, capability rotation, workflow recovery, deletion races, retention jobs, notification target filtering, staff sessions, billing flows, and dashboard effects.
- [ ] Existing `convex/_scenario/securityBoundaries.test.ts` was checked before adding a new security scenario file.
- [ ] The regression test would fail on the unsafe implementation.

## Review Output Format

Use this order when reviewing:

1. Findings, ordered by severity.
2. Open questions or assumptions.
3. Security Lens summary if the task is still in planning.
4. Test plan.
5. Skill/doc self-repair note if user feedback changed durable guidance.
