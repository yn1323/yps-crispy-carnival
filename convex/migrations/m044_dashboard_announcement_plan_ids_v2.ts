import type { MutationCtx } from "../_generated/server";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const CONFLICT_CODES = {
  emptyTargets: "dashboard_announcement_plan_ids_v2_empty_targets",
  unknownTarget: "dashboard_announcement_plan_ids_v2_unknown_target",
  canonicalTargetWithoutVersion: "dashboard_announcement_plan_ids_v2_canonical_target_without_version",
  legacyTargetWithVersion: "dashboard_announcement_plan_ids_v2_legacy_target_with_version",
  versionWithoutTargets: "dashboard_announcement_plan_ids_v2_version_without_targets",
} as const;

const OWNED_CONFLICT_CODES = Object.values(CONFLICT_CODES);
type ConflictCode = (typeof CONFLICT_CODES)[keyof typeof CONFLICT_CODES];

export const migration = migrations.define({
  table: "dashboardAnnouncements",
  migrateOne: async (ctx, announcement) => {
    const sourceId = String(announcement._id);
    if (announcement.organizationPlan === undefined) {
      if (announcement.planIdVersion === 2) {
        await recordConflict(ctx, sourceId, CONFLICT_CODES.versionWithoutTargets);
      } else {
        await resolveOrganizationMigrationConflicts(ctx, {
          sourceType: "dashboardAnnouncement",
          sourceId,
          codes: OWNED_CONFLICT_CODES,
        });
      }
      return;
    }

    const targets = parseTargets(announcement.organizationPlan);
    if (targets.length === 0) {
      await recordConflict(ctx, sourceId, CONFLICT_CODES.emptyTargets);
      return;
    }
    if (announcement.planIdVersion === 2) {
      if (targets.some((target) => target === "business")) {
        await recordConflict(ctx, sourceId, CONFLICT_CODES.legacyTargetWithVersion);
        return;
      }
      if (targets.some((target) => !isCanonicalTarget(target))) {
        await recordConflict(ctx, sourceId, CONFLICT_CODES.unknownTarget);
        return;
      }
      await resolveOrganizationMigrationConflicts(ctx, {
        sourceType: "dashboardAnnouncement",
        sourceId,
        codes: OWNED_CONFLICT_CODES,
      });
      return;
    }
    if (targets.some((target) => target === "standard")) {
      await recordConflict(ctx, sourceId, CONFLICT_CODES.canonicalTargetWithoutVersion);
      return;
    }
    if (targets.some((target) => !isLegacyTarget(target))) {
      await recordConflict(ctx, sourceId, CONFLICT_CODES.unknownTarget);
      return;
    }

    const canonicalTargets = targets.map((target) =>
      target === "pro" ? "standard" : target === "business" ? "pro" : target,
    );
    await ctx.db.patch(announcement._id, {
      organizationPlan: [...new Set(canonicalTargets)].join(","),
      planIdVersion: 2,
    });
    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "dashboardAnnouncement",
      sourceId,
      codes: OWNED_CONFLICT_CODES,
    });
  },
});

function parseTargets(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((target) => target.trim())
        .filter(Boolean),
    ),
  ];
}

function isLegacyTarget(target: string): target is "trial" | "free" | "pro" | "business" {
  return target === "trial" || target === "free" || target === "pro" || target === "business";
}

function isCanonicalTarget(target: string): target is "trial" | "free" | "standard" | "pro" {
  return target === "trial" || target === "free" || target === "standard" || target === "pro";
}

async function recordConflict(ctx: Pick<MutationCtx, "db">, sourceId: string, code: ConflictCode) {
  await resolveOrganizationMigrationConflicts(ctx, {
    sourceType: "dashboardAnnouncement",
    sourceId,
    codes: OWNED_CONFLICT_CODES.filter((candidate) => candidate !== code),
  });
  await recordOrganizationMigrationConflict(ctx, {
    sourceType: "dashboardAnnouncement",
    sourceId,
    code,
  });
}
