import { createClerkClient } from "@clerk/backend";
import { reverificationErrorResponse } from "@clerk/shared/authorization-errors";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { httpAction } from "../_generated/server";
import { readBoundedJsonBody } from "../_lib/httpBody";
import { sha256Hex } from "../_lib/sha256";
import { getAccountDeletionConfiguration } from "./config";
import { ACCOUNT_DELETION_HTTP_BODY_MAX_BYTES } from "./constants";
import { accountDeletionRequestSchema } from "./schemas";

type AccountDeletionHttpCtx = Pick<ActionCtx, "runMutation">;

export type AccountDeletionAuthOptions = {
  acceptsToken: "session_token";
  authorizedParties: string[];
};

export type AccountDeletionAuthResult =
  | { status: "authenticated"; issuer: string; clerkUserId: string }
  | { status: "unauthenticated" }
  | { status: "reverificationRequired"; response: Response }
  | { status: "unavailable" };

export interface AccountDeletionAuthAdapter {
  authenticate(request: Request, options: AccountDeletionAuthOptions): Promise<AccountDeletionAuthResult>;
}

type ClerkAuthObjectLike = {
  isAuthenticated: boolean;
  tokenType: string | null;
  userId: string | null;
  sessionId: string | null;
  actor?: unknown;
  sessionClaims?: { iss?: unknown; act?: unknown };
  has(input: { reverification: "strict" }): boolean;
};

export type ClerkRequestStateLike = {
  isAuthenticated: boolean;
  tokenType: string | null;
  toAuth(): ClerkAuthObjectLike;
};

export type AuthenticateClerkRequest = (
  request: Request,
  options: AccountDeletionAuthOptions,
  keys: { secretKey: string; publishableKey: string },
) => Promise<ClerkRequestStateLike>;

export const requestAccountDeletion = httpAction(async (ctx, request) => {
  return await handleAccountDeletionRequest(ctx, request, createClerkRequestAuthAdapter());
});

export const options = httpAction(async (_ctx, request) => {
  return handleAccountDeletionOptions(request);
});

export function handleAccountDeletionOptions(request: Request): Response {
  if (request.method !== "OPTIONS") {
    return safeJsonResponse(null, { error: "invalid_request" }, { status: 405, headers: { allow: "OPTIONS" } });
  }
  const config = getAccountDeletionConfiguration();
  if (!config.appOrigin) return safeJsonResponse(null, { error: "service_unavailable" }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin !== config.appOrigin) return forbiddenOriginResponse();
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function handleAccountDeletionRequest(
  ctx: AccountDeletionHttpCtx,
  request: Request,
  authAdapter: AccountDeletionAuthAdapter,
): Promise<Response> {
  if (request.method !== "POST") {
    return safeJsonResponse(null, { error: "invalid_request" }, { status: 405, headers: { allow: "POST" } });
  }
  const config = getAccountDeletionConfiguration();
  if (!config.appOrigin) return safeJsonResponse(null, { error: "service_unavailable" }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin !== config.appOrigin) return forbiddenOriginResponse();

  const body = await readBoundedJsonBody(request, ACCOUNT_DELETION_HTTP_BODY_MAX_BYTES);
  if (!body.ok) return safeJsonResponse(origin, { error: "invalid_request" }, { status: 400 });
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body.rawBody) as unknown;
  } catch {
    return safeJsonResponse(origin, { error: "invalid_request" }, { status: 400 });
  }
  const parsed = accountDeletionRequestSchema.safeParse(parsedJson);
  if (!parsed.success) return safeJsonResponse(origin, { error: "invalid_request" }, { status: 400 });

  let authentication: AccountDeletionAuthResult;
  try {
    authentication = await authAdapter.authenticate(request, {
      acceptsToken: "session_token",
      authorizedParties: [origin],
    });
  } catch {
    return safeJsonResponse(origin, { error: "unauthenticated" }, { status: 401 });
  }
  if (authentication.status === "unavailable") {
    return safeJsonResponse(origin, { error: "service_unavailable" }, { status: 503 });
  }
  if (authentication.status === "unauthenticated") {
    return safeJsonResponse(origin, { error: "unauthenticated" }, { status: 401 });
  }
  if (authentication.status === "reverificationRequired") {
    return responseWithCors(authentication.response, origin);
  }

  const result = await ctx.runMutation(internal.accountDeletion.mutations.accept, {
    issuer: authentication.issuer,
    clerkUserId: authentication.clerkUserId,
    requestId: parsed.data.requestId,
    ...("scope" in parsed.data ? { scope: parsed.data.scope, previewFingerprint: parsed.data.previewFingerprint } : {}),
    rateLimitKey: await sha256Hex(`${authentication.issuer}|${authentication.clerkUserId}`),
  });
  if (result.status === "accepted") return safeJsonResponse(origin, { status: "accepted" }, { status: 202 });
  if (result.status === "conflict") {
    return safeJsonResponse(origin, { error: "account_not_eligible" }, { status: 409 });
  }
  if (result.status === "rateLimited") {
    return safeJsonResponse(origin, { error: "rate_limited" }, { status: 429 });
  }
  return safeJsonResponse(origin, { error: "service_unavailable" }, { status: 503 });
}

export function createClerkRequestAuthAdapter(
  authenticateRequest: AuthenticateClerkRequest = authenticateClerkRequest,
): AccountDeletionAuthAdapter {
  return {
    async authenticate(request, options) {
      const config = getAccountDeletionConfiguration();
      if (!config.secretKey || !config.publishableKey || !config.expectedIssuer) return { status: "unavailable" };
      const state = await authenticateRequest(request, options, {
        secretKey: config.secretKey,
        publishableKey: config.publishableKey,
      });
      if (!state.isAuthenticated || state.tokenType !== "session_token") return { status: "unauthenticated" };

      const auth = state.toAuth();
      const issuer = typeof auth.sessionClaims?.iss === "string" ? auth.sessionClaims.iss : null;
      if (
        !auth.isAuthenticated ||
        auth.tokenType !== "session_token" ||
        !auth.userId ||
        !auth.sessionId ||
        issuer !== config.expectedIssuer ||
        auth.actor != null ||
        auth.sessionClaims?.act != null
      ) {
        return { status: "unauthenticated" };
      }
      if (!auth.has({ reverification: "strict" })) {
        return { status: "reverificationRequired", response: reverificationErrorResponse("strict") };
      }
      return { status: "authenticated", issuer, clerkUserId: auth.userId };
    },
  };
}

const authenticateClerkRequest: AuthenticateClerkRequest = async (request, options, keys) => {
  const client = createClerkClient(keys);
  return (await client.authenticateRequest(request, options)) as ClerkRequestStateLike;
};

function corsHeaders(origin: string) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
    vary: "Origin",
  };
}

function safeJsonResponse(origin: string | null, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(origin ? corsHeaders(origin) : {}),
      ...init.headers,
    },
  });
}

function forbiddenOriginResponse() {
  return new Response(null, {
    status: 403,
    headers: { "cache-control": "no-store", vary: "Origin" },
  });
}

function responseWithCors(response: Response, origin: string) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
