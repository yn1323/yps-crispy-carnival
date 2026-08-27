import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { type OrganizationBillingState, resolveOrganizationBillingPlans } from "../organizationBilling/policy";
import { getAnalyticsSourceCaptureStartAt } from "./config";
import {
  ANALYTICS_PAYLOAD_VERSION,
  ANALYTICS_SCHEMA_VERSION,
  type analyticsSourceEventPayloadValidator,
  type analyticsSourceEventTypeValidator,
} from "./model";
import { ANALYTICS_POLICY } from "./registry";

export type AnalyticsSourceEventType = Infer<typeof analyticsSourceEventTypeValidator>;
export type AnalyticsSourceEventPayload = Infer<typeof analyticsSourceEventPayloadValidator>;

function assertBoundedPayload(payload: AnalyticsSourceEventPayload) {
  const maxItems = ANALYTICS_POLICY.batch.sourceEvents;
  if (payload.kind === "staffMembershipBatch" && payload.memberships.length > maxItems) {
    throw new Error("analytics_staff_membership_batch_too_large");
  }
  if (payload.kind === "lineAccountBatch" && payload.accounts.length > maxItems) {
    throw new Error("analytics_line_account_batch_too_large");
  }
}

function canonicalPayloadJson(value: AnalyticsSourceEventPayload): string {
  const normalize = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(normalize);
    if (current !== null && typeof current === "object") {
      return Object.fromEntries(
        Object.entries(current)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return current;
  };
  return JSON.stringify(normalize(value));
}

type AnalyticsSubjectId = Id<"organizationPeople"> | Id<"organizationMembers"> | Id<"staffs">;

export type AnalyticsSourceEventInput = {
  eventKey: string;
  eventType: AnalyticsSourceEventType;
  occurredAt: number;
  organizationId?: Id<"organizations">;
  shopId?: Id<"shops">;
  recruitmentId?: Id<"recruitments">;
  subjectId?: AnalyticsSubjectId;
  payload: AnalyticsSourceEventPayload;
};

function expectedEventType(payload: AnalyticsSourceEventPayload): AnalyticsSourceEventType {
  switch (payload.kind) {
    case "organization":
      return "organization.changed";
    case "shop":
      return "shop.changed";
    case "person":
      return "person.changed";
    case "managerMembership":
      return "managerMembership.changed";
    case "staffMembership":
    case "staffMembershipBatch":
      return "staffMembership.changed";
    case "plan":
      return "plan.changed";
    case "cycle":
      return "cycle.changed";
    case "submissionFirst":
      return "submission.first";
    case "lineAccount":
    case "lineAccountBatch":
      return "lineAccount.changed";
  }
}

/**
 * 運用mutationと同じtransactionで一行だけ追記するdurable boundary。
 * eventKeyは呼び出し元のaudit ID、作成document ID、または安定operation IDから作る。
 */
export async function recordAnalyticsSourceEvent(ctx: MutationCtx, args: AnalyticsSourceEventInput) {
  if (expectedEventType(args.payload) !== args.eventType) {
    throw new Error("analytics_source_event_type_mismatch");
  }
  const sourceCaptureStartAt = getAnalyticsSourceCaptureStartAt();
  if (sourceCaptureStartAt !== undefined && args.occurredAt < sourceCaptureStartAt) return null;
  const existing = await ctx.db
    .query("analyticsSourceEvents")
    .withIndex("by_eventKey", (q) => q.eq("eventKey", args.eventKey))
    .unique();
  if (existing) {
    const sameEvent =
      existing.eventType === args.eventType &&
      existing.occurredAt === args.occurredAt &&
      existing.organizationId === args.organizationId &&
      existing.shopId === args.shopId &&
      existing.recruitmentId === args.recruitmentId &&
      existing.subjectId === args.subjectId &&
      canonicalPayloadJson(existing.payload) === canonicalPayloadJson(args.payload);
    if (!sameEvent) throw new Error("analytics_source_event_key_conflict");
    return existing._id;
  }
  return await insertAnalyticsSourceEvent(ctx, args);
}

/**
 * 同じtransactionで直前にinsertしたorganizationAuditEventsのIDをeventKeyにする専用append。
 * 新規document IDが一意性を保証するためdedupe readを重ねない。
 */
export async function appendAnalyticsSourceEventForNewAudit(ctx: MutationCtx, args: AnalyticsSourceEventInput) {
  if (!args.eventKey.startsWith("organizationAudit:")) {
    throw new Error("analytics_audit_event_key_invalid");
  }
  const sourceCaptureStartAt = getAnalyticsSourceCaptureStartAt();
  if (sourceCaptureStartAt !== undefined && args.occurredAt < sourceCaptureStartAt) return null;
  return await insertAnalyticsSourceEvent(ctx, args);
}

async function insertAnalyticsSourceEvent(ctx: MutationCtx, args: AnalyticsSourceEventInput) {
  assertBoundedPayload(args.payload);
  if (expectedEventType(args.payload) !== args.eventType) {
    throw new Error("analytics_source_event_type_mismatch");
  }
  return await ctx.db.insert("analyticsSourceEvents", {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    eventKey: args.eventKey,
    eventType: args.eventType,
    occurredAt: args.occurredAt,
    ...(args.organizationId ? { organizationId: args.organizationId } : {}),
    ...(args.shopId ? { shopId: args.shopId } : {}),
    ...(args.recruitmentId ? { recruitmentId: args.recruitmentId } : {}),
    ...(args.subjectId ? { subjectId: args.subjectId } : {}),
    payloadVersion: ANALYTICS_PAYLOAD_VERSION,
    payload: args.payload,
    createdAt: Date.now(),
  });
}

export function analyticsPlanForBillingState(
  state: OrganizationBillingState,
): "trial" | "free" | "standard" | "pro" | undefined {
  return resolveOrganizationBillingPlans(state).targetingPlan ?? undefined;
}
