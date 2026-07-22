# Shiftori Security Model

This reference records the durable security model for Shiftori. Use it when planning, reviewing, or changing auth, authorization, tokens, delivery, billing, or logs.

## Sources Of Truth

Local rules:

- `doc/rules/security-strategy.md`
- `doc/rules/convex-design-strategy.md`
- `convex/AGENTS.md`
- `convex/_generated/ai/guidelines.md`
- `convex/_lib/functions.ts`
- `convex/_lib/rateLimits.ts`
- `convex/_scenario/securityBoundaries.test.ts`

External baselines to refresh when needed:

- OWASP ASVS
- OWASP API Security Top 10
- OWASP Authorization Cheat Sheet
- OWASP IDOR Cheat Sheet
- OWASP Forgot Password Cheat Sheet
- OWASP Logging Cheat Sheet
- Convex Auth, Validation, Internal Functions, HTTP Actions, Abuse Protection, Environment Variables docs
- Clerk + Convex integration docs

## Trust Boundaries

### Manager Boundary

Managers are authenticated by Clerk, but Clerk identity alone is not store authority.

Canonical chain:

```text
Clerk identity -> identity.tokenIdentifier -> users.authTokenIdentifier -> shopMembers -> shops
```

Rules:

- Use `identity.tokenIdentifier` for auth-linked lookup.
- Do not accept `userId` for authorization from clients.
- Treat `shopId` from clients as a selected target that still needs membership verification.
- Require the selected `shopId` for store-scoped manager APIs. Limit first-membership fallback to bootstrap flows before a target store is established.
- Resolve store authority through active `shopMembers` and non-deleted `shops`.
- Store-scoped roles belong on `shopMembers.role` as the product evolves; avoid global role shortcuts for billing-sensitive paths.

### Store Boundary

`shopId` is the tenant boundary. Every object reached by user-provided ID must be checked against the caller's store or session context.

Common protected objects:

- staff
- recruitment
- position
- shift submissions and assignments
- notification outbox, delivery events, and failure inbox
- registration requests and links
- billing state and portal/session targets
- legal consent state and tokens

Rules:

- Fetch object, then verify `shopId` and `isDeleted`.
- Do not rely on unguessable IDs as authorization.
- Prefer `Not found` when the distinction between missing and forbidden would reveal another store's data.
- Do not query broad tables and filter in memory when an index can scope by `shopId`.

### Staff Boundary

Staff do not have Clerk accounts by default. Staff authority comes from magic links and sessions.

Rules:

- Validate token/session at the server.
- Check token/session `staffId`, `shopId`, `recruitmentId`, `accessKind`, `expiresAt`, `usedAt`, and `revokedAt` as applicable.
- Re-fetch staff/shop/recruitment and verify non-deleted state and matching relationships.
- Submit and view access are different capabilities. Do not let one token kind perform the other action.
- Rate-limit token verification and token-consuming flows.

### Registration And Invite Boundary

Registration, manager invite, LINE link, and legal consent flows use bearer-style tokens.

Rules:

- Tokens must be random, scoped to the specific store and subject, expire, and be revocable.
- Persist a digest instead of the raw token when the server only needs equality lookup and does not need to redisplay the secret.
- Define each capability as single-use or reusable, and newest-only or multiple-active.
- Single-use flows must persist `usedAt` and reject reuse.
- Reissuing a newest-only token should revoke older unused tokens for the same scope.
- Reusable public links need manager-controlled disable and rotation, plus an explicit expiry or a documented reason for long-lived access.
- Prune expired, used, and revoked capabilities in bounded batches after their audit-retention window.
- Manager invite links should be consumed after login and server-side identity/email matching, not as unauthenticated shared admin links.
- Staff registration links intentionally allow unknown staff to request access, but approval stays manager-controlled and store-scoped.
- Anonymous registration should use generic responses, bot proof, layered link/email/IP/store/global rate limits, and a bounded pending queue.

### Notification And Delivery Boundary

Notifications can expose shift data and create delivery cost or spam. Treat them as both data-security and abuse-risk surfaces.

Rules:

- Use dedupe keys and idempotency for scheduling and retrying.
- Add rate limits for user-triggered send/retry paths.
- Distinguish accepted/scheduled/retrying from actual delivery success.
- Persist fanout progress with a cursor when one action cannot safely own the whole operation.
- Give processing claims expiring leases, reclaim stale claims, and reject completion from stale workers.
- Re-check shop and recipient state before external delivery, and prevent enqueue after deletion or deactivation starts.
- Document in-flight semantics because an external request that already started cannot always be canceled.
- Do not expose raw outbox internals or third-party errors in manager-facing DTOs unless needed and sanitized.
- LINE URLs that open app auth flows must use the project LINE external-browser helper where required.
- Webhooks must verify provider signatures before parsing or mutating state.

### HTTP Action And Service Boundary

Every route in `convex/http.ts` is a public surface even when only another service is expected to call it.

Rules:

- Define method, path, content type, request and event limits, CORS, response shape, and rate limits per route.
- Verify provider signatures over the expected raw payload before DB mutation.
- Use timestamp tolerance, nonce, or event ID dedupe to reject replay when the provider exposes them.
- Keep service credentials in server-side environment variables, never query strings, and define comparison, rotation, and revocation behavior.
- Pass state changes to internal mutations only after authentication and request validation.
- Never log raw credentials, signatures, request bodies, or credential-bearing URLs.

### Billing Boundary

Billing is store/customer-scoped, not person-scoped.

Rules:

- Check billing authority server-side, not only by hiding UI.
- Treat `billingManager` as a store membership role/permission, not a global user role.
- Stripe Customer Portal or equivalent billing sessions must use the shop's billing state and customer context.
- Prevent broad manager changes from accidentally granting billing power.
- Derive the Stripe environment from the secret key (`sk_test_` or `sk_live_`) instead of maintaining a separate test/live switch, and verify that Price, Customer, Subscription, Checkout, and webhook `livemode` values match it.
- Stop new sales by archiving the configured Price while keeping webhook handling and existing-contract convergence active. Expire already-created open Checkout Sessions separately when an immediate stop is required.

### Logging And Personal Data

Logs help incident response, but Shiftori handles names, email addresses, staff identities, tokens, and notification errors.

Rules:

- Do not log raw tokens, full email addresses, webhook bodies, authorization headers, or secrets.
- Prefer IDs plus safe metadata, such as email domain, status, event type, and shop/staff IDs when needed.
- Log authz failures and suspicious business-flow attempts with enough context to debug, without leaking sensitive values.
- Avoid returning third-party error bodies directly to clients.

### Data Lifecycle Boundary

Logical deletion stops product access but does not by itself complete personal-data erasure.

Rules:

- Define purpose, retention, redaction, audit retention, and deletion behavior for each table containing personal data or capability secrets.
- Separate notification payloads from the metadata needed for audit, retry, and aggregate reporting.
- Redact recipients, message bodies, raw capability URLs, and provider errors after the operational retention window.
- Run bulk cleanup and tenant-erasure work as bounded, idempotent, resumable jobs with persisted progress.
- Keep only non-PII audit facts after erasure when legal and operational policy permits it.

## Security Lens Template

Use this in plans and design docs:

```md
### Security Lens

- Actor:
- Asset:
- Trust boundary:
- Abuse case:
- Server-side check:
- Rate limit / idempotency:
- Lifecycle / recovery:
- Logs / PII:
- Regression test:
```
