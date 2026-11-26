import { ConvexError, type Value } from "convex/values";
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
  requestedUserId: Id<"users">;
  operation: "read" | "create" | "update" | "delete" | "recover";
  affectedCount: number;
  retryable: boolean;
}>;

/** 利用者の通常の操作で起き、画面が理由と次の操作を案内する失敗の分類。 */
export type ExpectedConvexErrorKind =
  | "plan_limit"
  | "business_rule"
  | "already_exists"
  | "stale_state"
  | "time_passed"
  | "rate_limited"
  | "auth_expired";

type ErrorPayload = {
  schemaVersion: typeof ERROR_SCHEMA_VERSION;
  functionKind: FunctionKind;
  failureKind: "expected" | "domain" | "unexpected" | "unknown";
  errorCode: string;
  context?: Record<string, ErrorContextPrimitive>;
};

const resolvedContexts = new WeakMap<object, Record<string, ErrorContextPrimitive>>();
const expectedErrorKinds = new WeakMap<object, ExpectedConvexErrorKind>();

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
  requestedUserId: { kind: "id", maxLength: MAX_ID_LENGTH },
  operation: { kind: "enum", values: ["read", "create", "update", "delete", "recover"] },
  affectedCount: { kind: "number" },
  retryable: { kind: "boolean" },
} as const;

/**
 * 引数のうち、この名前の項目だけを未検証の要求IDとして記録する。
 * 名前で限定し、token・氏名・メールアドレスなどの値を拾わない。
 */
const requestedIdArgFields = {
  organizationId: "requestedOrganizationId",
  expectedOrganizationId: "requestedExpectedOrganizationId",
  shopId: "requestedShopId",
  recruitmentId: "requestedRecruitmentId",
  staffId: "requestedStaffId",
  organizationPersonId: "requestedPersonId",
  personId: "requestedPersonId",
  invitationId: "requestedInvitationId",
  organizationInvitationId: "requestedInvitationId",
  notificationOutboxId: "requestedNotificationOutboxId",
  userId: "requestedUserId",
} as const satisfies Record<string, keyof ConvexFunctionErrorContext>;

// Convex document IDの形だけを許可し、任意の文字列をログへ書き込ませない。
const CONVEX_ID_PATTERN = /^[0-9a-z]{16,64}$/;

/** action境界で作り直され、WeakMapで追えない想定内の構造化エラーcode。 */
const expectedConvexErrorCodeKinds = new Map<string, ExpectedConvexErrorKind>([
  ["USAGE_LIMIT_EXCEEDED", "plan_limit"],
  ["LINE_LINKED_TO_OTHER_PERSON", "already_exists"],
  ["PROMOTION_CODE_INVALID", "business_rule"],
  ["RATE_LIMITED", "rate_limited"],
]);

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
  ["LINE_LINKED_TO_OTHER_PERSON", "line_linked_to_other_person"],
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

const convexErrorCode = (error: ConvexError<never>) => {
  const data = error.data as unknown;
  if (typeof data === "string") return data;
  return isRecord(data) && typeof data.code === "string" ? data.code : undefined;
};

const expectedErrorKind = (error: unknown) => {
  if (!(error instanceof ConvexError)) return undefined;
  const kind = expectedErrorKinds.get(error);
  if (kind) return kind;
  const code = convexErrorCode(error as ConvexError<never>);
  return code === undefined ? undefined : expectedConvexErrorCodeKinds.get(code);
};

/**
 * 利用者の通常の操作で起きる失敗を作る。
 * 画面へ届く内容は`new ConvexError(data)`と同じで、エラーログだけがwarnと分類名で記録される。
 */
export const expectedConvexError = <T extends Value>(kind: ExpectedConvexErrorKind, data: T) => {
  const error = new ConvexError(data);
  expectedErrorKinds.set(error, kind);
  return error;
};

const requestedIdContextFromArgs = (args: unknown) => {
  if (!isRecord(args)) return [];
  const entries = new Map<string, ErrorContextPrimitive>();
  for (const [argName, field] of Object.entries(requestedIdArgFields)) {
    const value = args[argName];
    // 別名の引数が同じfieldへ対応するときは、最初の値を残して上書きしない。
    if (!entries.has(field) && typeof value === "string" && CONVEX_ID_PATTERN.test(value)) entries.set(field, value);
  }
  return [...entries];
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
  args: unknown,
): ErrorPayload => {
  const expectedKind = expectedErrorKind(error);
  const failureKind = expectedKind
    ? "expected"
    : error instanceof ConvexError
      ? "domain"
      : error instanceof Error
        ? "unexpected"
        : "unknown";
  const knownCode = error instanceof ConvexError ? safeConvexErrorCode(error as ConvexError<never>) : undefined;
  const errorCode =
    expectedKind && knownCode === "convex_error"
      ? `expected_${expectedKind}`
      : (knownCode ?? (error instanceof Error ? "unexpected_error" : "unknown_throw"));
  const resolved = typeof ctx === "object" && ctx !== null ? resolvedContexts.get(ctx) : undefined;
  // serverで解決した値を先に置き、上限を超えたときは引数由来の未検証IDから落とす。
  const resolvedEntries = Object.entries(resolved ?? {});
  const resolvedKeys = new Set(resolvedEntries.map(([key]) => key));
  const context = takeBoundedFields([
    ...resolvedEntries,
    ...requestedIdContextFromArgs(args).filter(([key]) => !resolvedKeys.has(key)),
  ]);

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
    // 想定内の失敗はwarnに下げ、errorの件数を直すべき失敗だけにする。
    if (payload.failureKind === "expected") console.warn(CONVEX_FUNCTION_ERROR_MARKER, payload);
    else console.error(CONVEX_FUNCTION_ERROR_MARKER, payload);
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
