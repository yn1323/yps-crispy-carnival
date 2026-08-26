import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  action as rawAction,
  internalAction as rawInternalAction,
  internalMutation as rawInternalMutation,
  internalQuery as rawInternalQuery,
  mutation as rawMutation,
  query as rawQuery,
} from "../_generated/server";

export const CONVEX_FUNCTION_ERROR_MARKER = "convex_function_error_context";

const ERROR_SCHEMA_VERSION = 1;
const MAX_CONTEXT_FIELDS = 12;
const MAX_ID_LENGTH = 128;

type FunctionKind = "query" | "mutation" | "action";
type ErrorContextPrimitive = string | number | boolean;

export type ConvexFunctionErrorContext = Partial<{
  actorKind: "authenticated" | "manager" | "staff" | "system";
  actorUserId: Id<"users">;
  actorPersonId: Id<"organizationPeople">;
  organizationId: Id<"organizations">;
  shopId: Id<"shops">;
  staffId: Id<"staffs">;
  recruitmentId: Id<"recruitments">;
  notificationOutboxId: Id<"notificationOutbox">;
  requestedOrganizationId: Id<"organizations">;
  requestedExpectedOrganizationId: Id<"organizations">;
  requestedShopId: Id<"shops">;
  requestedRecruitmentId: Id<"recruitments">;
  requestedStaffId: Id<"staffs">;
  requestedPersonId: Id<"organizationPeople">;
  requestedInvitationId: Id<"organizationInvitations">;
  requestedNotificationOutboxId: Id<"notificationOutbox">;
  operation: "read" | "create" | "update" | "delete" | "recover";
  affectedCount: number;
  retryable: boolean;
}>;

type ErrorPayload = {
  schemaVersion: typeof ERROR_SCHEMA_VERSION;
  functionKind: FunctionKind;
  failureKind: "domain" | "unexpected" | "unknown";
  errorCode: string;
  context?: Record<string, ErrorContextPrimitive>;
};

const resolvedContexts = new WeakMap<object, Record<string, ErrorContextPrimitive>>();

const safeContextFields = {
  actorKind: { kind: "enum", values: ["authenticated", "manager", "staff", "system"] },
  actorUserId: { kind: "id", maxLength: MAX_ID_LENGTH },
  actorPersonId: { kind: "id", maxLength: MAX_ID_LENGTH },
  organizationId: { kind: "id", maxLength: MAX_ID_LENGTH },
  shopId: { kind: "id", maxLength: MAX_ID_LENGTH },
  staffId: { kind: "id", maxLength: MAX_ID_LENGTH },
  recruitmentId: { kind: "id", maxLength: MAX_ID_LENGTH },
  notificationOutboxId: { kind: "id", maxLength: MAX_ID_LENGTH },
  requestedOrganizationId: { kind: "id", maxLength: MAX_ID_LENGTH },
  requestedExpectedOrganizationId: { kind: "id", maxLength: MAX_ID_LENGTH },
  requestedShopId: { kind: "id", maxLength: MAX_ID_LENGTH },
  requestedRecruitmentId: { kind: "id", maxLength: MAX_ID_LENGTH },
  requestedStaffId: { kind: "id", maxLength: MAX_ID_LENGTH },
  requestedPersonId: { kind: "id", maxLength: MAX_ID_LENGTH },
  requestedInvitationId: { kind: "id", maxLength: MAX_ID_LENGTH },
  requestedNotificationOutboxId: { kind: "id", maxLength: MAX_ID_LENGTH },
  operation: { kind: "enum", values: ["read", "create", "update", "delete", "recover"] },
  affectedCount: { kind: "number" },
  retryable: { kind: "boolean" },
} as const;

const safeConvexErrorCodes = new Map<string, string>([
  ["Unauthenticated", "unauthenticated"],
  ["Not found", "not_found"],
  ["PROMOTION_CODE_INVALID", "promotion_code_invalid"],
  ["Session expired", "session_expired"],
  ["analytics_source_capture_start_invalid", "analytics_source_capture_start_invalid"],
  ["analytics_reset_guard_rejected", "analytics_reset_guard_rejected"],
  ["RATE_LIMITED", "rate_limited"],
  ["USAGE_LIMIT_EXCEEDED", "usage_limit_exceeded"],
  ["USAGE_LIMIT_EVALUATION_UNAVAILABLE", "usage_limit_evaluation_unavailable"],
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizePrimitive = (
  value: unknown,
  rule:
    | { kind: "id"; maxLength: number }
    | { kind: "enum"; values: readonly string[] }
    | { kind: "number" }
    | { kind: "boolean" },
): ErrorContextPrimitive | undefined => {
  if (rule.kind === "number") {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }
  if (rule.kind === "boolean") return typeof value === "boolean" ? value : undefined;
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (rule.kind === "enum") return rule.values.includes(value) ? value : undefined;
  return value.slice(0, rule.maxLength);
};

const takeBoundedFields = (entries: Iterable<readonly [string, ErrorContextPrimitive]>) => {
  const bounded: Record<string, ErrorContextPrimitive> = {};
  for (const [key, value] of entries) {
    if (Object.keys(bounded).length >= MAX_CONTEXT_FIELDS) break;
    bounded[key] = value;
  }
  return bounded;
};

const sanitizeResolvedContext = (context: ConvexFunctionErrorContext) => {
  const entries: Array<readonly [string, ErrorContextPrimitive]> = [];
  for (const [key, rule] of Object.entries(safeContextFields)) {
    const value = sanitizePrimitive(context[key as keyof ConvexFunctionErrorContext], rule);
    if (value !== undefined) entries.push([key, value]);
  }
  return takeBoundedFields(entries);
};

const safeConvexErrorCode = (error: ConvexError<never>) => {
  const data = error.data as unknown;
  if (typeof data === "string") return safeConvexErrorCodes.get(data) ?? "convex_error";
  if (!isRecord(data) || typeof data.code !== "string") return "convex_error";
  return safeConvexErrorCodes.get(data.code) ?? "convex_error";
};

export const buildConvexFunctionErrorPayload = (
  functionKind: FunctionKind,
  error: unknown,
  ctx: unknown,
  _args: unknown,
): ErrorPayload => {
  const failureKind = error instanceof ConvexError ? "domain" : error instanceof Error ? "unexpected" : "unknown";
  const errorCode =
    error instanceof ConvexError
      ? safeConvexErrorCode(error as ConvexError<never>)
      : error instanceof Error
        ? "unexpected_error"
        : "unknown_throw";
  const resolved = typeof ctx === "object" && ctx !== null ? resolvedContexts.get(ctx) : undefined;
  const context = takeBoundedFields(Object.entries(resolved ?? {}));

  return {
    schemaVersion: ERROR_SCHEMA_VERSION,
    functionKind,
    failureKind,
    errorCode,
    ...(Object.keys(context).length > 0 ? { context } : {}),
  };
};

export const registerConvexFunctionErrorContext = (ctx: object, context: ConvexFunctionErrorContext) => {
  try {
    const existing = resolvedContexts.get(ctx) ?? {};
    resolvedContexts.set(
      ctx,
      takeBoundedFields([...Object.entries(existing), ...Object.entries(sanitizeResolvedContext(context))]),
    );
  } catch {
    // 観測contextの登録失敗で、元のConvex functionを失敗させない。
  }
};

const logConvexFunctionError = (functionKind: FunctionKind, error: unknown, ctx: unknown, args: unknown) => {
  try {
    const payload = buildConvexFunctionErrorPayload(functionKind, error, ctx, args);
    console.error(CONVEX_FUNCTION_ERROR_MARKER, payload);
  } catch {
    // 観測処理の失敗で、元のConvex functionの例外を置き換えない。
  }
};

type RuntimeHandler = (...args: unknown[]) => unknown;

const wrapRuntimeHandler =
  (handler: RuntimeHandler, functionKind: FunctionKind): RuntimeHandler =>
  async (...handlerArgs: unknown[]) => {
    try {
      return await handler(...handlerArgs);
    } catch (error) {
      logConvexFunctionError(functionKind, error, handlerArgs[0], handlerArgs[1]);
      throw error;
    }
  };

const createObservedBuilder = <Builder>(builder: Builder, functionKind: FunctionKind): Builder => {
  const runtimeBuilder = builder as unknown as (definition: unknown) => unknown;
  return ((definition: unknown) => {
    if (typeof definition === "function") {
      return runtimeBuilder(wrapRuntimeHandler(definition as RuntimeHandler, functionKind));
    }
    if (!isRecord(definition) || typeof definition.handler !== "function") return runtimeBuilder(definition);
    return runtimeBuilder({
      ...definition,
      handler: wrapRuntimeHandler(definition.handler as RuntimeHandler, functionKind),
    });
  }) as unknown as Builder;
};

export const observedQuery = createObservedBuilder(rawQuery, "query");
export const observedMutation = createObservedBuilder(rawMutation, "mutation");
export const observedAction = createObservedBuilder(rawAction, "action");
export const observedInternalQuery = createObservedBuilder(rawInternalQuery, "query");
export const observedInternalMutation = createObservedBuilder(rawInternalMutation, "mutation");
export const observedInternalAction = createObservedBuilder(rawInternalAction, "action");
