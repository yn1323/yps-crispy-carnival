import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export function testAuthTokenIdentifier(subject: string) {
  return `https://convex.test|${subject}`;
}

export async function seedUser(ctx: MutationCtx, subject: string, email = `${subject}@example.com`) {
  return await ctx.db.insert("users", {
    authTokenIdentifier: testAuthTokenIdentifier(subject),
    name: "管理者",
    email,
    role: "manager",
    isDeleted: false,
  });
}

export async function seedShop(ctx: MutationCtx, name = "テスト店舗") {
  return await ctx.db.insert("shops", {
    name,
    shiftStartTime: "09:00",
    shiftEndTime: "22:00",
    isDeleted: false,
  });
}

export async function seedShopMembership(
  ctx: MutationCtx,
  args: { userId: Id<"users">; shopId: Id<"shops">; role?: "manager"; isDeleted?: boolean },
) {
  return await ctx.db.insert("shopMembers", {
    userId: args.userId,
    shopId: args.shopId,
    role: args.role ?? "manager",
    isDeleted: args.isDeleted ?? false,
  });
}

export async function seedManagerShop(
  ctx: MutationCtx,
  args: {
    subject: string;
    email?: string;
    shopName?: string;
    shopDeleted?: boolean;
    membershipDeleted?: boolean;
  },
) {
  const userId = await seedUser(ctx, args.subject, args.email);
  const shopId = await seedShop(ctx, args.shopName);
  if (args.shopDeleted) {
    await ctx.db.patch(shopId, { isDeleted: true });
  }
  await seedShopMembership(ctx, {
    userId,
    shopId,
    role: "manager",
    isDeleted: args.membershipDeleted ?? false,
  });
  return { userId, shopId };
}

export async function seedStaffLineAccount(
  ctx: MutationCtx,
  args: { staffId: Id<"staffs">; shopId: Id<"shops">; lineUserId: string; following?: boolean },
) {
  return await ctx.db.insert("staffLineAccounts", {
    staffId: args.staffId,
    shopId: args.shopId,
    lineUserId: args.lineUserId,
    linkedAt: Date.now(),
    following: args.following ?? true,
    isDeleted: false,
  });
}
