import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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
