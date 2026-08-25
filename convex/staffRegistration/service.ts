import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { normalizeEmail } from "../_lib/validation";
import { ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT } from "../constants";
import { resolveOrganizationPersonEmail } from "../organization/personIdentity";

type DbCtx = {
  db: GenericDatabaseReader<DataModel>;
};

export const STAFF_REGISTRATION_APPROVAL_DISABLED_REASON = "この申請は現在承認できません。不要な申請は却下できます。";

export type StaffRegistrationApprovalAvailability = {
  canApprove: boolean;
  approveDisabledReason: string | null;
};

export const STAFF_REGISTRATION_APPROVAL_AVAILABLE: StaffRegistrationApprovalAvailability = {
  canApprove: true,
  approveDisabledReason: null,
};

export const STAFF_REGISTRATION_APPROVAL_UNAVAILABLE: StaffRegistrationApprovalAvailability = {
  canApprove: false,
  approveDisabledReason: STAFF_REGISTRATION_APPROVAL_DISABLED_REASON,
};

/** 管理画面の事前表示用。承認mutationは同じ条件を改めて検証する。 */
export async function resolveStaffRegistrationApprovalAvailability(
  ctx: DbCtx,
  args: {
    organizationId: Id<"organizations">;
    targetShopId: Id<"shops">;
    emailNormalized: string;
  },
): Promise<StaffRegistrationApprovalAvailability> {
  if (await hasActiveStaffByEmail(ctx, args.targetShopId, args.emailNormalized)) {
    return STAFF_REGISTRATION_APPROVAL_UNAVAILABLE;
  }

  const personResolution = await resolveOrganizationPersonEmail(ctx, {
    organizationId: args.organizationId,
    emailNormalized: args.emailNormalized,
  });
  if (personResolution.kind === "conflict") return STAFF_REGISTRATION_APPROVAL_UNAVAILABLE;

  const person = personResolution.kind === "new" ? null : personResolution.person;
  if (!person) return STAFF_REGISTRATION_APPROVAL_AVAILABLE;

  const staffRows = await ctx.db
    .query("staffs")
    .withIndex("by_organizationId_and_organizationPersonId", (q) =>
      q.eq("organizationId", args.organizationId).eq("organizationPersonId", person._id),
    )
    .take(ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT + 1);
  if (staffRows.length > ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT) {
    return STAFF_REGISTRATION_APPROVAL_UNAVAILABLE;
  }

  const activeStaffRows = staffRows.filter((staff) => !staff.isDeleted);
  if (activeStaffRows.some((staff) => staff.shopId === args.targetShopId)) {
    return STAFF_REGISTRATION_APPROVAL_UNAVAILABLE;
  }

  if (person.status === "removed") {
    if (activeStaffRows.length > 0) return STAFF_REGISTRATION_APPROVAL_UNAVAILABLE;

    const managerMemberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", args.organizationId).eq("personId", person._id),
      )
      .take(ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT + 1);
    if (managerMemberships.length > ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT) {
      return STAFF_REGISTRATION_APPROVAL_UNAVAILABLE;
    }
    if (managerMemberships.some((membership) => membership.status !== "removed")) {
      return STAFF_REGISTRATION_APPROVAL_UNAVAILABLE;
    }

    if (person.userId) {
      const user = await ctx.db.get(person.userId);
      if (!user || user.isDeleted || user.accountDeletionRequestedAt !== undefined) {
        return STAFF_REGISTRATION_APPROVAL_UNAVAILABLE;
      }
    }

    const activeLineLink = await ctx.db
      .query("organizationPersonLineLinks")
      .withIndex("by_organizationPersonId_and_isDeleted", (q) =>
        q.eq("organizationPersonId", person._id).eq("isDeleted", false),
      )
      .first();
    return activeLineLink ? STAFF_REGISTRATION_APPROVAL_UNAVAILABLE : STAFF_REGISTRATION_APPROVAL_AVAILABLE;
  }

  const otherActiveStaffShopIds = [
    ...new Set(activeStaffRows.filter((staff) => staff.shopId !== args.targetShopId).map((staff) => staff.shopId)),
  ];
  const otherShops = await Promise.all(otherActiveStaffShopIds.map(async (shopId) => await ctx.db.get(shopId)));
  if (otherShops.some((shop) => !shop || shop.organizationId !== args.organizationId)) {
    return STAFF_REGISTRATION_APPROVAL_UNAVAILABLE;
  }
  return STAFF_REGISTRATION_APPROVAL_AVAILABLE;
}

async function hasActiveStaffByEmail(ctx: DbCtx, shopId: Id<"shops">, emailNormalized: string): Promise<boolean> {
  const byNormalized = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_emailNormalized_isDeleted", (q) =>
      q.eq("shopId", shopId).eq("emailNormalized", emailNormalized).eq("isDeleted", false),
    )
    .first();
  if (byNormalized) return true;

  const byExactEmail = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_email_isDeleted", (q) =>
      q.eq("shopId", shopId).eq("email", emailNormalized).eq("isDeleted", false),
    )
    .first();
  if (byExactEmail) return true;

  const shopStaffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT + 1);
  if (shopStaffs.length > ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT) return true;
  return shopStaffs.some((staff) => normalizeEmail(staff.email) === emailNormalized);
}
