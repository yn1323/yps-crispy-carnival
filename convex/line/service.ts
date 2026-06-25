import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { SHIFT_BOARD_STAFF_LIMIT } from "../constants";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

export type ShopManagerRecipient = {
  userId: Id<"users">;
  name: string;
  email: string;
  lineUserId: string | undefined;
  lineFollowing: boolean | undefined;
};

/**
 * 店舗のマネージャー（shopMembers）のうち、有効なユーザー & email を持つ人を通知受信者として返す。
 * 各マネージャーが staff として LINE 連携していれば lineUserId / lineFollowing を付与する。
 */
export async function getShopManagerRecipients(
  ctx: DbCtx,
  shopId: Id<"shops">,
  managerLimit: number,
): Promise<ShopManagerRecipient[]> {
  const [members, activeStaffs] = await Promise.all([
    ctx.db
      .query("shopMembers")
      .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
      .take(managerLimit),
    ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
      .take(SHIFT_BOARD_STAFF_LIMIT),
  ]);

  const staffByUserId = new Map<Id<"users">, (typeof activeStaffs)[number]>();
  for (const staff of activeStaffs) {
    if (staff.userId) staffByUserId.set(staff.userId, staff);
  }

  const recipients = await Promise.all(
    members.map(async (member) => {
      const user = await ctx.db.get(member.userId);
      if (!user || user.isDeleted || !user.email) return null;

      const managerStaff = staffByUserId.get(user._id);
      const lineAccount = managerStaff ? await getStaffLineAccount(ctx, managerStaff._id) : null;

      return {
        userId: user._id,
        name: user.name,
        email: user.email,
        lineUserId: lineAccount?.lineUserId,
        lineFollowing: lineAccount?.following,
      };
    }),
  );

  return recipients.filter((recipient) => recipient !== null);
}

export async function getStaffLineAccount(ctx: DbCtx, staffId: Id<"staffs">) {
  const account = await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
    .first();
  return account && !account.isDeleted ? account : null;
}

export async function findStaffLineAccountByLineUserId(ctx: DbCtx, lineUserId: string) {
  const account = await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", lineUserId).eq("isDeleted", false))
    .first();
  return account ?? null;
}

/**
 * 同じ lineUserId に紐づくアクティブなアカウントを全件取得する。
 * 同一人物が複数店舗にLINE連携しているケース（店舗ごとに別 staff レコード）を扱う。
 */
export async function findStaffLineAccountsByLineUserId(ctx: DbCtx, lineUserId: string) {
  return await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", lineUserId).eq("isDeleted", false))
    .collect();
}

export async function upsertStaffLineAccount(
  ctx: MutationCtx,
  args: {
    staffId: Id<"staffs">;
    shopId: Id<"shops">;
    lineUserId: string;
    following: boolean;
  },
) {
  const existing = await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_staffId", (q) => q.eq("staffId", args.staffId))
    .first();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      shopId: args.shopId,
      lineUserId: args.lineUserId,
      linkedAt: existing.linkedAt,
      following: args.following,
      isDeleted: false,
    });
    return existing._id;
  }

  return await ctx.db.insert("staffLineAccounts", {
    staffId: args.staffId,
    shopId: args.shopId,
    lineUserId: args.lineUserId,
    linkedAt: now,
    following: args.following,
    isDeleted: false,
  });
}
