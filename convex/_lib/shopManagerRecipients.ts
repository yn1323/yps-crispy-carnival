import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { SHIFT_BOARD_STAFF_LIMIT } from "../constants";
import { getStaffLineAccount } from "../line/service";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

export type ShopManagerRecipient = {
  userId: Id<"users">;
  name: string;
  email: string;
  lineUserId: string | undefined;
  lineFollowing: boolean | undefined;
};

/**
 * 店舗のマネージャー（shopMembers）を通知受信者として組み立てる。
 * 論理削除・メール未設定のユーザーは除外し、マネージャー本人がスタッフとして
 * LINE連携済みなら lineUserId / lineFollowing を付与する。
 * マネージャー宛の日次ダイジェスト系通知（承認依頼・失敗リマインダー等）で共有する。
 */
export async function loadShopManagerRecipients(
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

  return recipients.filter((recipient): recipient is ShopManagerRecipient => recipient !== null);
}
