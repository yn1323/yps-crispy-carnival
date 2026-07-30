import { afterEach, describe, expect, it, vi } from "vitest";
import { CONVEX_SITE_URL } from "@/src/configs/publicEnv";
import { submitAccountDeletionRequest } from "./submitAccountDeletionRequest";

const requestId = "6ec31541-7f1a-42d9-9659-a4cc66ab477f";
const token = "fresh-session-token";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitAccountDeletionRequest", () => {
  it("session tokenとrequest IDだけを受付HTTP Actionへ送る", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "accepted" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitAccountDeletionRequest({ requestId, token })).resolves.toEqual({ status: "accepted" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(`${CONVEX_SITE_URL}/account-deletion/request`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ requestId }),
    });
  });

  it("403のClerk再認証hintは分類せずそのまま返す", async () => {
    const hint = {
      clerk_error: {
        type: "forbidden",
        reason: "reverification-error",
        metadata: { reverification: { level: "strict" } },
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(hint), { status: 403 })));

    await expect(submitAccountDeletionRequest({ requestId, token })).resolves.toEqual(hint);
  });

  it.each([
    [400, "invalidRequest"],
    [401, "authenticationRequired"],
    [409, "associationChanged"],
    [429, "rateLimited"],
    [503, "unavailable"],
    [500, "unexpectedError"],
  ] as const)("HTTP %sを安全な失敗理由へ変換する", async (status, reason) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "provider_error",
            clerkUserId: "user_sensitive-provider-id",
            providerBody: "raw provider response",
          }),
          { status },
        ),
      ),
    );

    await expect(submitAccountDeletionRequest({ requestId, token })).resolves.toEqual({
      status: "rejected",
      reason,
    });
  });

  it("202でも受付DTOが不正なら成功扱いしない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "queued" }), { status: 202 })),
    );

    await expect(submitAccountDeletionRequest({ requestId, token })).resolves.toEqual({
      status: "rejected",
      reason: "unexpectedError",
    });
  });

  it.each([200, 201])("HTTP %sでaccepted DTOが返っても成功扱いしない", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "accepted" }), { status })));

    await expect(submitAccountDeletionRequest({ requestId, token })).resolves.toEqual({
      status: "rejected",
      reason: "unexpectedError",
    });
  });

  it("HTTP 204を成功扱いしない", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(submitAccountDeletionRequest({ requestId, token })).resolves.toEqual({
      status: "rejected",
      reason: "unexpectedError",
    });
  });

  it("不正な403 bodyをClerk再認証hintとして扱わない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            clerk_error: { type: "forbidden", reason: "provider-internal-error" },
            clerkUserId: "user_sensitive-provider-id",
          }),
          { status: 403 },
        ),
      ),
    );

    await expect(submitAccountDeletionRequest({ requestId, token })).resolves.toEqual({
      status: "rejected",
      reason: "unexpectedError",
    });
  });

  it("network errorを安全な失敗理由へ変換する", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider URL and token must not escape")));

    await expect(submitAccountDeletionRequest({ requestId, token })).resolves.toEqual({
      status: "rejected",
      reason: "networkError",
    });
  });
});
