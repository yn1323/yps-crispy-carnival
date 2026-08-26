import { ConvexError, v } from "convex/values";
import { customQuery } from "convex-helpers/server/customFunctions";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { PROMOTION_CODE_INVALID_ERROR_CODE } from "../setup/constants";
import {
  buildConvexFunctionErrorPayload,
  CONVEX_FUNCTION_ERROR_MARKER,
  observedMutation,
  observedQuery,
  registerConvexFunctionErrorContext,
} from "./errorObservability";

const invokeRegisteredHandler = async (registered: unknown, ctx: unknown, args: unknown) => {
  const convexFunction = registered as {
    _handler: (handlerCtx: unknown, handlerArgs: unknown) => Promise<unknown>;
  };
  return await convexFunction._handler(ctx, args);
};

describe("buildConvexFunctionErrorPayload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("明示登録したcontextだけを出力し、同名の未検証argsも既定で拒否する", () => {
    const ctx = {};
    registerConvexFunctionErrorContext(ctx, {
      actorKind: "manager",
      actorUserId: "users:manager" as Id<"users">,
      organizationId: "organizations:example" as Id<"organizations">,
      shopId: "shops:resolved" as Id<"shops">,
    });

    const payload = buildConvexFunctionErrorPayload("mutation", new Error("secret@example.com token-value"), ctx, {
      shopId: "shops:requested",
      recruitmentId: "recruitments:example",
      email: "secret@example.com",
      sessionToken: "token-value",
      body: "raw provider payload",
    });

    expect(payload).toEqual({
      schemaVersion: 1,
      functionKind: "mutation",
      failureKind: "unexpected",
      errorCode: "unexpected_error",
      context: {
        actorKind: "manager",
        actorUserId: "users:manager",
        organizationId: "organizations:example",
        shopId: "shops:resolved",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("secret@example.com");
    expect(JSON.stringify(payload)).not.toContain("token-value");
    expect(JSON.stringify(payload)).not.toContain("raw provider payload");
  });

  it("既知のConvexErrorだけを固定codeへ変換し、生messageを出力しない", () => {
    const known = buildConvexFunctionErrorPayload("query", new ConvexError("Not found"), {}, {});
    const structuredKnown = buildConvexFunctionErrorPayload(
      "mutation",
      new ConvexError({
        code: "USAGE_LIMIT_EXCEEDED",
        message: "利用人数を減らしてください",
        plan: "free",
      }),
      {},
      {},
    );
    const unavailableUsageEvaluation = buildConvexFunctionErrorPayload(
      "mutation",
      new ConvexError({
        code: "USAGE_LIMIT_EVALUATION_UNAVAILABLE",
        message: "利用数を確認できません",
        unknownDimensions: ["people"],
      }),
      {},
      {},
    );
    const invalidPromotionCode = buildConvexFunctionErrorPayload(
      "mutation",
      new ConvexError({ code: PROMOTION_CODE_INVALID_ERROR_CODE }),
      {},
      {},
    );
    const unknown = buildConvexFunctionErrorPayload(
      "query",
      new ConvexError("secret@example.com を確認してください"),
      {},
      {},
    );

    expect(known).toMatchObject({ failureKind: "domain", errorCode: "not_found" });
    expect(structuredKnown).toMatchObject({ failureKind: "domain", errorCode: "usage_limit_exceeded" });
    expect(unavailableUsageEvaluation).toMatchObject({
      failureKind: "domain",
      errorCode: "usage_limit_evaluation_unavailable",
    });
    expect(invalidPromotionCode).toMatchObject({ failureKind: "domain", errorCode: "promotion_code_invalid" });
    expect(JSON.stringify(structuredKnown)).not.toContain("利用人数を減らしてください");
    expect(JSON.stringify(unavailableUsageEvaluation)).not.toContain("利用数を確認できません");
    expect(unknown).toMatchObject({ failureKind: "domain", errorCode: "convex_error" });
    expect(JSON.stringify(unknown)).not.toContain("secret@example.com");
  });

  it("型を迂回した未許可enumも実行時に破棄する", () => {
    const ctx = {};
    registerConvexFunctionErrorContext(ctx, {
      actorKind: "secret@example.com",
      operation: "token-value",
    } as unknown as Parameters<typeof registerConvexFunctionErrorContext>[1]);

    const payload = buildConvexFunctionErrorPayload("query", new Error("failed"), ctx, {});

    expect(payload).not.toHaveProperty("context");
    expect(JSON.stringify(payload)).not.toContain("secret@example.com");
    expect(JSON.stringify(payload)).not.toContain("token-value");
  });

  it("IDとenumを上限長で切り詰め、context field数を固定上限へ抑える", () => {
    const longId = "x".repeat(200);
    const ctx = {};
    registerConvexFunctionErrorContext(ctx, {
      actorKind: "manager",
      actorUserId: longId as Id<"users">,
      actorPersonId: longId as Id<"organizationPeople">,
      organizationId: longId as Id<"organizations">,
      shopId: longId as Id<"shops">,
      staffId: longId as Id<"staffs">,
      recruitmentId: longId as Id<"recruitments">,
      notificationOutboxId: longId as Id<"notificationOutbox">,
      requestedOrganizationId: longId as Id<"organizations">,
      requestedExpectedOrganizationId: longId as Id<"organizations">,
      requestedShopId: longId as Id<"shops">,
      requestedRecruitmentId: longId as Id<"recruitments">,
      requestedStaffId: longId as Id<"staffs">,
      requestedPersonId: longId as Id<"organizationPeople">,
      requestedInvitationId: longId as Id<"organizationInvitations">,
      requestedNotificationOutboxId: longId as Id<"notificationOutbox">,
    });
    const payload = buildConvexFunctionErrorPayload("action", "failure", ctx, {});

    expect(payload.context && Object.keys(payload.context)).toHaveLength(12);
    expect(payload.context?.actorUserId).toHaveLength(128);
    expect(payload.context?.requestedShopId).toHaveLength(128);
  });
});

describe("observed Convex function builders", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queryの元例外を同一objectのまま再送出し、安全なcontextを1件記録する", async () => {
    const originalError = new Error("raw error must not be logged");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const registered = observedQuery({
      args: { shopId: v.string(), sessionToken: v.string() },
      handler: async () => {
        throw originalError;
      },
    });

    await expect(
      invokeRegisteredHandler(
        registered,
        {},
        {
          shopId: "secret@example.com",
          sessionToken: "secret-token",
        },
      ),
    ).rejects.toBe(originalError);
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(CONVEX_FUNCTION_ERROR_MARKER, {
      schemaVersion: 1,
      functionKind: "query",
      failureKind: "unexpected",
      errorCode: "unexpected_error",
    });
  });

  it("観測用consoleが失敗してもmutationの元例外を置き換えない", async () => {
    const originalError = new Error("original");
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("logging failed");
    });
    const registered = observedMutation({
      args: {},
      handler: async () => {
        throw originalError;
      },
    });

    await expect(invokeRegisteredHandler(registered, {}, {})).rejects.toBe(originalError);
  });

  it("customQueryのscope解決contextを外側のobserved builderへ引き継ぐ", async () => {
    const originalError = new Error("handler failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const scopedQuery = customQuery(observedQuery, {
      args: { organizationId: v.id("organizations") },
      input: async (ctx, { organizationId }) => {
        registerConvexFunctionErrorContext(ctx, {
          actorKind: "manager",
          actorUserId: "users:manager" as Id<"users">,
          organizationId,
          requestedOrganizationId: organizationId,
        });
        return { ctx: {}, args: {} };
      },
    });
    const registered = scopedQuery({
      args: { shopId: v.id("shops") },
      handler: async () => {
        throw originalError;
      },
    });

    await expect(
      invokeRegisteredHandler(
        registered,
        {},
        {
          organizationId: "organizations:example" as Id<"organizations">,
          shopId: "shops:example" as Id<"shops">,
        },
      ),
    ).rejects.toBe(originalError);
    expect(consoleError).toHaveBeenCalledWith(CONVEX_FUNCTION_ERROR_MARKER, {
      schemaVersion: 1,
      functionKind: "query",
      failureKind: "unexpected",
      errorCode: "unexpected_error",
      context: {
        actorKind: "manager",
        actorUserId: "users:manager",
        organizationId: "organizations:example",
        requestedOrganizationId: "organizations:example",
      },
    });
  });
});
