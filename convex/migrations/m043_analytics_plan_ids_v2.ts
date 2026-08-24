import type { Infer } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import {
  ANALYTICS_PAYLOAD_VERSION,
  ANALYTICS_SCHEMA_VERSION,
  type analyticsSourceEventPayloadValidator,
} from "../analytics/model";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

type Payload = Infer<typeof analyticsSourceEventPayloadValidator>;

const CONFLICT_CODES = {
  versionMismatch: "analytics_plan_ids_v2_version_mismatch",
  canonicalPlanInLegacyPayload: "analytics_plan_ids_v2_canonical_plan_in_legacy_payload",
  legacyPlanInV2Payload: "analytics_plan_ids_v2_legacy_plan_in_v2_payload",
} as const;

const OWNED_CONFLICT_CODES = Object.values(CONFLICT_CODES);

/**
 * Widen後の新writerはv2を出すため、v1/v2の混在中も繰り返し実行できる。
 * post readinessでlegacy=0になるまで再実行し、materialized tablesはcalculationVersion=2 resetで再構築する。
 */
export const migration = migrations.define({
  table: "analyticsSourceEvents",
  migrateOne: async (ctx, event) => {
    const sourceId = String(event._id);
    const sourceType = "analyticsSourceEvent" as const;
    const isV2 = event.schemaVersion === ANALYTICS_SCHEMA_VERSION && event.payloadVersion === ANALYTICS_PAYLOAD_VERSION;
    const isLegacy = event.schemaVersion === 1 && event.payloadVersion === 1;
    if (!isV2 && !isLegacy) {
      await recordConflict(ctx, event.organizationId, sourceId, CONFLICT_CODES.versionMismatch);
      return;
    }

    const plan = planFromPayload(event.payload);
    if (isV2) {
      if (plan === "business") {
        await recordConflict(ctx, event.organizationId, sourceId, CONFLICT_CODES.legacyPlanInV2Payload);
        return;
      }
      await resolveOrganizationMigrationConflicts(ctx, { sourceType, sourceId, codes: OWNED_CONFLICT_CODES });
      return;
    }

    if (plan === "standard") {
      await recordConflict(ctx, event.organizationId, sourceId, CONFLICT_CODES.canonicalPlanInLegacyPayload);
      return;
    }
    const payload = migrateLegacyPayload(event.payload);
    await ctx.db.patch(event._id, {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      payloadVersion: ANALYTICS_PAYLOAD_VERSION,
      payload,
    });
    await resolveOrganizationMigrationConflicts(ctx, { sourceType, sourceId, codes: OWNED_CONFLICT_CODES });
  },
});

function planFromPayload(payload: Payload) {
  if (payload.kind === "organization") return payload.currentPlan;
  if (payload.kind === "plan") return payload.plan;
  return undefined;
}

function migrateLegacyPlan(plan: "trial" | "free" | "standard" | "pro" | "business") {
  if (plan === "standard") throw new Error("analytics_plan_ids_v2_unexpected_canonical_plan");
  if (plan === "pro") return "standard" as const;
  if (plan === "business") return "pro" as const;
  return plan;
}

function migrateLegacyPayload(payload: Payload): Payload {
  if (payload.kind === "organization" && payload.currentPlan) {
    return { ...payload, currentPlan: migrateLegacyPlan(payload.currentPlan) };
  }
  if (payload.kind === "plan" && payload.plan) {
    return { ...payload, plan: migrateLegacyPlan(payload.plan) };
  }
  return payload;
}

async function recordConflict(
  ctx: Pick<MutationCtx, "db">,
  organizationId: Parameters<typeof recordOrganizationMigrationConflict>[1]["organizationId"],
  sourceId: string,
  code: (typeof CONFLICT_CODES)[keyof typeof CONFLICT_CODES],
) {
  await resolveOrganizationMigrationConflicts(ctx, {
    sourceType: "analyticsSourceEvent",
    sourceId,
    codes: OWNED_CONFLICT_CODES.filter((candidate) => candidate !== code),
  });
  await recordOrganizationMigrationConflict(ctx, {
    organizationId,
    sourceType: "analyticsSourceEvent",
    sourceId,
    code,
  });
}
