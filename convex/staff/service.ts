import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * シフト対象スタッフかどうか（論理削除されておらず、シフト対象外でもない）。
 * シフトボード表示・募集/催促/確定などシフト関連通知の対象判定に使う。
 */
export function isShiftTargetStaff(staff: { isDeleted: boolean; excludedFromShift?: boolean }) {
  return !staff.isDeleted && !staff.excludedFromShift;
}

export async function findActiveStaffByEmail(
  ctx: { db: MutationCtx["db"] },
  shopId: Id<"shops">,
  emailNormalized: string,
) {
  const byNormalized = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_emailNormalized_isDeleted", (q) =>
      q.eq("shopId", shopId).eq("emailNormalized", emailNormalized).eq("isDeleted", false),
    )
    .first();
  if (byNormalized) return byNormalized;

  const byExactEmail = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_email_isDeleted", (q) =>
      q.eq("shopId", shopId).eq("email", emailNormalized).eq("isDeleted", false),
    )
    .first();
  if (byExactEmail) return byExactEmail;

  const shopStaffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .collect();
  return shopStaffs.find((staff) => normalizeEmail(staff.email) === emailNormalized) ?? null;
}
