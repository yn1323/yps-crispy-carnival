import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { resolveOrganizationPersonEmail } from "../_lib/personIdentity";
import { normalizeEmail } from "../_lib/validation";
import { SHOP_MEMBERSHIP_STATS_ACTIVE_STAFF_LIMIT } from "../constants";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const M050_CONFLICT_CODES = [
  "m050_shop_unavailable",
  "m050_organization_unavailable",
  "m050_missing_email_identity",
  "m050_canonical_person_not_found",
  "m050_canonical_person_conflict",
  "m050_canonical_person_lifecycle_mismatch",
  "m050_staff_user_lifecycle_mismatch",
  "m050_staff_user_identity_mismatch",
  "m050_same_shop_active_staff_duplicate",
  "m050_same_shop_active_staff_scan_limit_exceeded",
] as const;

const RESOLVED_STAFF_LINK_CONFLICT_CODES = [
  "shop_without_organization",
  "missing_user",
  "ambiguous_user_person",
  "email_match_scan_limit_exceeded",
  "invalid_organization_person_link",
  "linked_person_user_mismatch",
  "ambiguous_email_person",
  "email_person_user_mismatch",
  "email_person_identity_mismatch",
  "linked_person_email_mismatch",
  "missing_email",
  "email_name_mismatch",
  "ambiguous_email_and_name",
  "narrow_prep_canonical_link_mismatch",
  "active_staff_matches_removed_person",
  ...M050_CONFLICT_CODES,
] as const;

type M050ConflictCode = (typeof M050_CONFLICT_CODES)[number];
type MigrationCtx = Pick<MutationCtx, "db">;

async function recordCurrentConflict(
  ctx: MigrationCtx,
  staff: Doc<"staffs">,
  args: { organizationId?: Id<"organizations">; code: M050ConflictCode },
) {
  // 再実行時はm050が以前記録した理由だけを更新し、m027までの未解消根拠は成功するまで残す。
  await resolveOrganizationMigrationConflicts(ctx, {
    sourceType: "staff",
    sourceId: staff._id,
    codes: M050_CONFLICT_CODES,
  });
  await recordOrganizationMigrationConflict(ctx, {
    organizationId: args.organizationId,
    sourceType: "staff",
    sourceId: staff._id,
    code: args.code,
  });
}

async function resolveStaffLinkConflicts(ctx: MigrationCtx, staffId: Id<"staffs">) {
  await resolveOrganizationMigrationConflicts(ctx, {
    sourceType: "staff",
    sourceId: staffId,
    codes: RESOLVED_STAFF_LINK_CONFLICT_CODES,
  });
}

/**
 * canonical IDが両方欠損するstaffだけを、既存の同一メール人物へ安全に結び直す。
 * 人物・user・statusは一切変更せず、人物の新規作成・統合とLINE/通知の副作用も行わない。
 */
export async function backfillStaffCanonicalLink(ctx: MigrationCtx, staff: Doc<"staffs">) {
  // partial rowや既にcanonicalなrowは、この限定backfillで推測修復しない。
  if (staff.organizationId !== undefined || staff.organizationPersonId !== undefined) return;

  const shop = await ctx.db.get(staff.shopId);
  if (!shop || shop.isDeleted || !shop.organizationId) {
    await recordCurrentConflict(ctx, staff, {
      organizationId: shop?.organizationId,
      code: "m050_shop_unavailable",
    });
    return;
  }

  const organizationId = shop.organizationId;
  const organization = await ctx.db.get(organizationId);
  if (!organization || organization.isDeleted) {
    await recordCurrentConflict(ctx, staff, {
      organizationId,
      code: "m050_organization_unavailable",
    });
    return;
  }

  const emailNormalized = normalizeEmail(staff.email);
  if (!emailNormalized) {
    await recordCurrentConflict(ctx, staff, {
      organizationId,
      code: "m050_missing_email_identity",
    });
    return;
  }
  const personResolution = await resolveOrganizationPersonEmail(ctx, {
    organizationId,
    emailNormalized,
  });
  if (personResolution.kind === "new") {
    await recordCurrentConflict(ctx, staff, {
      organizationId,
      code: "m050_canonical_person_not_found",
    });
    return;
  }
  if (personResolution.kind === "conflict") {
    await recordCurrentConflict(ctx, staff, {
      organizationId,
      code: "m050_canonical_person_conflict",
    });
    return;
  }

  const person = personResolution.person;
  if (
    person.organizationId !== organizationId ||
    person.emailNormalized !== emailNormalized ||
    normalizeEmail(person.email) !== emailNormalized ||
    person.status !== "active"
  ) {
    await recordCurrentConflict(ctx, staff, {
      organizationId,
      code: "m050_canonical_person_lifecycle_mismatch",
    });
    return;
  }

  const staffUserId = staff.userId;
  const [personMemberships, activeShopStaffs, staffUser, staffUserPeople, staffUserMemberships] = await Promise.all([
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", organizationId).eq("personId", person._id),
      )
      .take(2),
    !staff.isDeleted
      ? ctx.db
          .query("staffs")
          .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
          .take(SHOP_MEMBERSHIP_STATS_ACTIVE_STAFF_LIMIT + 1)
      : Promise.resolve([]),
    staffUserId ? ctx.db.get(staffUserId) : Promise.resolve(null),
    staffUserId
      ? ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_userId", (q) =>
            q.eq("organizationId", organizationId).eq("userId", staffUserId),
          )
          .take(2)
      : Promise.resolve([]),
    staffUserId
      ? ctx.db
          .query("organizationMembers")
          .withIndex("by_userId_and_organizationId", (q) =>
            q.eq("userId", staffUserId).eq("organizationId", organizationId),
          )
          .take(2)
      : Promise.resolve([]),
  ]);

  if (personMemberships.length > 1) {
    await recordCurrentConflict(ctx, staff, {
      organizationId,
      code: "m050_staff_user_identity_mismatch",
    });
    return;
  }
  const personMembership = personMemberships[0];
  if (personMembership && (!person.userId || personMembership.userId !== person.userId)) {
    await recordCurrentConflict(ctx, staff, {
      organizationId,
      code: "m050_staff_user_identity_mismatch",
    });
    return;
  }

  if (activeShopStaffs.length > SHOP_MEMBERSHIP_STATS_ACTIVE_STAFF_LIMIT) {
    await recordCurrentConflict(ctx, staff, {
      organizationId,
      code: "m050_same_shop_active_staff_scan_limit_exceeded",
    });
    return;
  }
  if (
    activeShopStaffs.some(
      (candidate) =>
        candidate._id !== staff._id &&
        (candidate.organizationPersonId === person._id || normalizeEmail(candidate.email) === emailNormalized),
    )
  ) {
    await recordCurrentConflict(ctx, staff, {
      organizationId,
      code: "m050_same_shop_active_staff_duplicate",
    });
    return;
  }

  if (staffUserId) {
    if (!staffUser || staffUser.isDeleted || staffUser.accountDeletionRequestedAt !== undefined) {
      await recordCurrentConflict(ctx, staff, {
        organizationId,
        code: "m050_staff_user_lifecycle_mismatch",
      });
      return;
    }
    if (
      person.userId !== staffUserId ||
      staffUserPeople.length !== 1 ||
      staffUserPeople[0]?._id !== person._id ||
      staffUserMemberships.length > 1 ||
      (staffUserMemberships[0] !== undefined && staffUserMemberships[0].personId !== person._id)
    ) {
      await recordCurrentConflict(ctx, staff, {
        organizationId,
        code: "m050_staff_user_identity_mismatch",
      });
      return;
    }
  }

  await ctx.db.patch(
    staff._id,
    staff.isDeleted
      ? { organizationId, organizationPersonId: person._id }
      : {
          organizationId,
          organizationPersonId: person._id,
          name: person.name,
          email: person.emailNormalized,
          emailNormalized: person.emailNormalized,
        },
  );
  await resolveStaffLinkConflicts(ctx, staff._id);
}

export const migration = migrations.define({
  table: "staffs",
  migrateOne: backfillStaffCanonicalLink,
});
