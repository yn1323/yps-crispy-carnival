import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modules, schema } from "../_test/setup.test-helper";
import {
  type AccountDeletionAuthAdapter,
  type ClerkRequestStateLike,
  createClerkRequestAuthAdapter,
  handleAccountDeletionOptions,
  handleAccountDeletionRequest,
} from "./httpActions";

const ORIGIN = "https://shiftori.example";
const REQUEST_ID = "718cf80f-d4fb-4a5d-bf20-ad48044f31eb";

describe("accountDeletion/httpActions", () => {
  beforeEach(() => {
    vi.stubEnv("APP_URL", ORIGIN);
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_example");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://issuer.example");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("session token限定とauthorizedPartiesを渡し、検証済み主体だけで202を返す", async () => {
    const runMutation = vi.fn(async () => ({ status: "accepted" as const }));
    const authenticate = vi.fn(async () => ({
      status: "authenticated" as const,
      issuer: "https://issuer.example",
      clerkUserId: "user_test",
    }));

    const response = await handleAccountDeletionRequest(
      { runMutation } as unknown as Parameters<typeof handleAccountDeletionRequest>[0],
      validRequest(),
      { authenticate },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), {
      acceptsToken: "session_token",
      authorizedParties: [ORIGIN],
    });
    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        issuer: "https://issuer.example",
        clerkUserId: "user_test",
        requestId: REQUEST_ID,
        rateLimitKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("requestId以外のtarget fieldを受け付けない", async () => {
    const adapter = fakeAdapter();
    const runMutation = vi.fn();
    const response = await handleAccountDeletionRequest(
      { runMutation } as unknown as Parameters<typeof handleAccountDeletionRequest>[0],
      validRequest({ clerkUserId: "user_attacker_selected" }),
      adapter,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
    expect(adapter.authenticate).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("所属を含む削除ではscopeとpreview fingerprintだけを認証済みmutationへ渡す", async () => {
    const runMutation = vi.fn(async () => ({ status: "accepted" as const }));
    const previewFingerprint = "a".repeat(64);
    const response = await handleAccountDeletionRequest(
      { runMutation } as unknown as Parameters<typeof handleAccountDeletionRequest>[0],
      validRequest({ scope: "accountAndAssociations", previewFingerprint }),
      fakeAdapter(),
    );

    expect(response.status).toBe(202);
    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requestId: REQUEST_ID,
        scope: "accountAndAssociations",
        previewFingerprint,
      }),
    );
  });

  it.each([
    ["scopeだけ", { scope: "accountAndAssociations" }],
    ["preview fingerprintだけ", { previewFingerprint: "a".repeat(64) }],
    ["短いpreview fingerprint", { scope: "accountAndAssociations", previewFingerprint: "a".repeat(63) }],
    ["非hexのpreview fingerprint", { scope: "accountAndAssociations", previewFingerprint: "g".repeat(64) }],
    ["未知のscope", { scope: "accountOnly", previewFingerprint: "a".repeat(64) }],
    [
      "余分なtarget ID",
      {
        scope: "accountAndAssociations",
        previewFingerprint: "a".repeat(64),
        organizationId: "attacker-selected",
      },
    ],
  ] as const)("不正なcombined payload（%s）は認証・mutation前に拒否する", async (_label, body) => {
    const adapter = fakeAdapter();
    const runMutation = vi.fn();
    const response = await handleAccountDeletionRequest(
      { runMutation } as unknown as Parameters<typeof handleAccountDeletionRequest>[0],
      validRequest(body),
      adapter,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
    expect(adapter.authenticate).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });

  it.each([
    ["POST以外", () => requestWith({ method: "GET", body: null }), 405],
    ["content-typeなし", () => requestWith({ omitContentType: true }), 400],
    ["JSON以外のcontent-type", () => requestWith({ contentType: "text/plain" }), 400],
    ["body上限超過", () => requestWith({ rawBody: JSON.stringify({ padding: "x".repeat(600) }) }), 400],
    ["不正JSON", () => requestWith({ rawBody: "{" }), 400],
    ["UUIDでないrequestId", () => requestWith({ rawBody: JSON.stringify({ requestId: "not-a-uuid" }) }), 400],
  ] as const)("%sは認証・mutation前に拒否する", async (_label, makeRequest, expectedStatus) => {
    const adapter = fakeAdapter();
    const runMutation = vi.fn();
    const response = await handleAccountDeletionRequest(
      { runMutation } as unknown as Parameters<typeof handleAccountDeletionRequest>[0],
      makeRequest(),
      adapter,
    );

    expect(response.status).toBe(expectedStatus);
    expect(adapter.authenticate).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });

  it.each([
    ["unauthenticated", 401, "unauthenticated"],
    ["unavailable", 503, "service_unavailable"],
  ] as const)("認証adapterの%sはmutationを呼ばず安全に返す", async (status, expectedStatus, error) => {
    const runMutation = vi.fn();
    const response = await handleAccountDeletionRequest(
      { runMutation } as unknown as Parameters<typeof handleAccountDeletionRequest>[0],
      validRequest(),
      { authenticate: vi.fn(async () => ({ status })) },
    );

    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toEqual({ error });
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("認証adapterの例外を401へ閉じ、mutationを呼ばない", async () => {
    const runMutation = vi.fn();
    const response = await handleAccountDeletionRequest(
      { runMutation } as unknown as Parameters<typeof handleAccountDeletionRequest>[0],
      validRequest(),
      { authenticate: vi.fn(async () => Promise.reject(new Error("raw token validation detail"))) },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthenticated" });
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("OPTIONSは許可Originへ必要最小限のCORSだけを返す", () => {
    const response = handleAccountDeletionOptions(
      new Request(`${ORIGIN}/account-deletion/request`, { method: "OPTIONS", headers: { origin: ORIGIN } }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe("authorization, content-type");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("HTTP routerがOPTIONSをaccount deletion handlerへ接続する", async () => {
    const t = convexTest(schema, modules);

    const optionsResponse = await t.fetch("/account-deletion/request", {
      method: "OPTIONS",
      headers: { origin: ORIGIN },
    });

    expect(optionsResponse.status).toBe(204);
    expect(optionsResponse.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(optionsResponse.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(optionsResponse.headers.get("access-control-allow-headers")).toBe("authorization, content-type");
    expect(optionsResponse.headers.get("vary")).toBe("Origin");
    expect(optionsResponse.headers.get("cache-control")).toBe("no-store");

    const deniedResponse = await t.fetch("/account-deletion/request", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    expect(deniedResponse.status).toBe(403);
    expect(deniedResponse.headers.get("access-control-allow-origin")).toBeNull();
    expect(deniedResponse.headers.get("cache-control")).toBe("no-store");
  });

  it("HTTP routerがPOSTをaccount deletion handlerへ接続する", async () => {
    const t = convexTest(schema, modules);

    const postResponse = await t.fetch("/account-deletion/request", {
      method: "POST",
      headers: {
        origin: ORIGIN,
        authorization: "Bearer session-token-not-forwarded",
        "content-type": "application/json",
      },
      body: "{",
    });

    expect(postResponse.status).toBe(400);
    expect(postResponse.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(postResponse.headers.get("cache-control")).toBe("no-store");
    await expect(postResponse.json()).resolves.toEqual({ error: "invalid_request" });
  });

  it("不許可OriginをCORS許可せずno-storeで拒否する", async () => {
    const adapter = fakeAdapter();
    const request = validRequest();
    request.headers.set("origin", "https://evil.example");
    const response = await handleAccountDeletionRequest(
      { runMutation: vi.fn() } as unknown as Parameters<typeof handleAccountDeletionRequest>[0],
      request,
      adapter,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vary")).toBe("Origin");
    expect(adapter.authenticate).not.toHaveBeenCalled();
  });

  it("strict reverification不足ではClerkの403 bodyとheadersを保ってCORSだけ追加する", async () => {
    const clerkResponse = new Response(JSON.stringify({ clerk_error: { reason: "reverification-error" } }), {
      status: 403,
      headers: { "content-type": "application/json", "x-clerk-hint": "strict" },
    });
    const adapter: AccountDeletionAuthAdapter = {
      authenticate: vi.fn(async () => ({ status: "reverificationRequired" as const, response: clerkResponse })),
    };
    const runMutation = vi.fn();
    const response = await handleAccountDeletionRequest(
      { runMutation } as unknown as Parameters<typeof handleAccountDeletionRequest>[0],
      validRequest(),
      adapter,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("x-clerk-hint")).toBe("strict");
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    await expect(response.json()).resolves.toEqual({ clerk_error: { reason: "reverification-error" } });
    expect(runMutation).not.toHaveBeenCalled();
  });

  it.each([
    ["RequestState token type", { stateTokenType: "api_key" }, "unauthenticated"],
    ["Auth token type", { authTokenType: "api_key" }, "unauthenticated"],
    ["userId", { userId: null }, "unauthenticated"],
    ["sessionId", { sessionId: null }, "unauthenticated"],
    ["issuer", { issuer: "https://other-issuer.example" }, "unauthenticated"],
    ["impersonation actor", { actor: { sub: "user_support" } }, "unauthenticated"],
    ["impersonation claim", { act: { sub: "user_support" } }, "unauthenticated"],
    ["通常sessionのnull actor", { actor: null, act: null }, "authenticated"],
    ["strict reverification", { strict: false }, "reverificationRequired"],
    ["全契約", {}, "authenticated"],
  ] as const)("実Clerk adapterが%sをfail closedで検証する", async (_label, overrides, expectedStatus) => {
    const { state, has } = clerkState(overrides);
    const authenticateRequest = vi.fn(async () => state);
    const adapter = createClerkRequestAuthAdapter(authenticateRequest);

    const result = await adapter.authenticate(validRequest(), {
      acceptsToken: "session_token",
      authorizedParties: [ORIGIN],
    });

    expect(result.status).toBe(expectedStatus);
    expect(authenticateRequest).toHaveBeenCalledWith(
      expect.any(Request),
      { acceptsToken: "session_token", authorizedParties: [ORIGIN] },
      { secretKey: "sk_test_example", publishableKey: "pk_test_example" },
    );
    if (expectedStatus === "reverificationRequired" || expectedStatus === "authenticated") {
      expect(has).toHaveBeenCalledWith({ reverification: "strict" });
    } else {
      expect(has).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["conflict", 409, "account_not_eligible"],
    ["rateLimited", 429, "rate_limited"],
    ["unavailable", 503, "service_unavailable"],
  ] as const)("internal result %sを安全なHTTP errorへ変換する", async (status, expectedStatus, error) => {
    const response = await handleAccountDeletionRequest(
      { runMutation: vi.fn(async () => ({ status })) } as unknown as Parameters<typeof handleAccountDeletionRequest>[0],
      validRequest(),
      fakeAdapter(),
    );
    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toEqual({ error });
  });
});

function validRequest(extraBody: Record<string, unknown> = {}) {
  return new Request(`${ORIGIN}/account-deletion/request`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      authorization: "Bearer session-token-not-forwarded",
      "content-type": "application/json",
    },
    body: JSON.stringify({ requestId: REQUEST_ID, ...extraBody }),
  });
}

function requestWith({
  method = "POST",
  rawBody = JSON.stringify({ requestId: REQUEST_ID }),
  contentType = "application/json",
  omitContentType = false,
  body = rawBody,
}: {
  method?: string;
  rawBody?: string;
  contentType?: string;
  omitContentType?: boolean;
  body?: BodyInit | null;
} = {}) {
  const headers = new Headers({ origin: ORIGIN, authorization: "Bearer session-token-not-forwarded" });
  if (!omitContentType) headers.set("content-type", contentType);
  return new Request(`${ORIGIN}/account-deletion/request`, { method, headers, body });
}

function fakeAdapter(): AccountDeletionAuthAdapter & { authenticate: ReturnType<typeof vi.fn> } {
  return {
    authenticate: vi.fn(async () => ({
      status: "authenticated" as const,
      issuer: "https://issuer.example",
      clerkUserId: "user_test",
    })),
  };
}

function clerkState(
  overrides: {
    stateTokenType?: string;
    authTokenType?: string;
    userId?: string | null;
    sessionId?: string | null;
    issuer?: string;
    actor?: unknown;
    act?: unknown;
    strict?: boolean;
  } = {},
): { state: ClerkRequestStateLike; has: ReturnType<typeof vi.fn> } {
  const has = vi.fn(() => overrides.strict ?? true);
  return {
    state: {
      isAuthenticated: true,
      tokenType: overrides.stateTokenType ?? "session_token",
      toAuth: () => ({
        isAuthenticated: true,
        tokenType: overrides.authTokenType ?? "session_token",
        userId: overrides.userId === undefined ? "user_test" : overrides.userId,
        sessionId: overrides.sessionId === undefined ? "session_test" : overrides.sessionId,
        ...(overrides.actor !== undefined ? { actor: overrides.actor } : {}),
        sessionClaims: {
          iss: overrides.issuer ?? "https://issuer.example",
          ...(overrides.act !== undefined ? { act: overrides.act } : {}),
        },
        has,
      }),
    },
    has,
  };
}
