import type { Doc, Id } from "../_generated/dataModel";
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

export type ShopManagerUsers = {
  users: Doc<"users">[];
  candidateLimitExceeded: boolean;
};

async function loadCanonicalManagerUsers(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  managerLimit: number,
): Promise<ShopManagerUsers> {
  const candidates = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
    .take(managerLimit + 1);
  const users = await Promise.all(
    candidates.slice(0, managerLimit).map(async (member) => {
      const [person, user, userMemberships] = await Promise.all([
        ctx.db.get(member.personId),
        ctx.db.get(member.userId),
        ctx.db
          .query("organizationMembers")
          .withIndex("by_userId_and_organizationId", (q) =>
            q.eq("userId", member.userId).eq("organizationId", organizationId),
          )
          .take(2),
      ]);
      if (
        userMemberships.length !== 1 ||
        userMemberships[0]._id !== member._id ||
        !person ||
        person.organizationId !== organizationId ||
        person.userId !== member.userId ||
        person.status !== "active" ||
        !user ||
        user.isDeleted ||
        user.accountDeletionRequestedAt !== undefined
      ) {
        return null;
      }
      return user;
    }),
  );
  return {
    users: users.filter((user): user is Doc<"users"> => user !== null),
    candidateLimitExceeded: candidates.length > managerLimit,
  };
}

/** 店舗の有効な管理者をcanonical所属優先で解決する。 */
export async function loadShopManagerUsers(
  ctx: DbCtx,
  shopId: Id<"shops">,
  managerLimit: number,
): Promise<ShopManagerUsers> {
  const shop = await ctx.db.get(shopId);
  if (!shop || shop.isDeleted) return { users: [], candidateLimitExceeded: false };
  const organizationId = shop.organizationId;

  let canonical: ShopManagerUsers = { users: [], candidateLimitExceeded: false };
  if (organizationId) {
    const organization = await ctx.db.get(organizationId);
    if (!organization || organization.isDeleted) return canonical;
    canonical = await loadCanonicalManagerUsers(ctx, organization._id, managerLimit);
  }

  // TODO[narrow]: 全deploymentでm029が完走し、verifyLegacyShopMembersの全pageが0件になった後に削除する。
  // m009完了後/m010・m026完了前はuser単位で移行が混在するため、canonical所属がないuserだけを補う。
  const candidates = await ctx.db
    .query("shopMembers")
    .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(managerLimit + 1);
  const legacyUsers = await Promise.all(
    candidates.slice(0, managerLimit).map(async (membership) => {
      const [user, activeMemberships, canonicalMemberships] = await Promise.all([
        ctx.db.get(membership.userId),
        ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_shopId_and_isDeleted", (q) =>
            q.eq("userId", membership.userId).eq("shopId", shopId).eq("isDeleted", false),
          )
          .take(2),
        organizationId
          ? ctx.db
              .query("organizationMembers")
              .withIndex("by_userId_and_organizationId", (q) =>
                q.eq("userId", membership.userId).eq("organizationId", organizationId),
              )
              .take(2)
          : Promise.resolve([]),
      ]);
      if (
        canonicalMemberships.length > 0 ||
        activeMemberships.length !== 1 ||
        activeMemberships[0]._id !== membership._id ||
        !user ||
        user.isDeleted ||
        user.accountDeletionRequestedAt !== undefined
      ) {
        return null;
      }
      return user;
    }),
  );
  const usersById = new Map(canonical.users.map((user) => [user._id, user]));
  for (const user of legacyUsers) {
    if (user) usersById.set(user._id, user);
  }
  const users = [...usersById.values()];
  return {
    users: users.slice(0, managerLimit),
    candidateLimitExceeded:
      canonical.candidateLimitExceeded || candidates.length > managerLimit || users.length > managerLimit,
  };
}

/**
 * 店舗のcanonicalな管理者所属を優先して通知受信者を組み立てる。
 * 論理削除・メール未設定のユーザーは除外し、マネージャー本人がスタッフとして
 * LINE連携済みなら lineUserId / lineFollowing を付与する。
 * マネージャー宛の日次ダイジェスト系通知（承認依頼・失敗リマインダー等）で共有する。
 */
export async function loadShopManagerRecipients(
  ctx: DbCtx,
  shopId: Id<"shops">,
  managerLimit: number,
): Promise<ShopManagerRecipient[]> {
  const [{ users }, activeStaffs] = await Promise.all([
    loadShopManagerUsers(ctx, shopId, managerLimit),
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
    users.map(async (user) => {
      if (!user.email) return null;
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
