import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getOrganizationDeletionEligibility } from "../organization/deletion";

const USER_LIST_LIMIT = 100;
const ORGANIZATION_PER_USER_LIMIT = 20;

/** 確認用データを入れられる管理者ユーザーか。削除済みと、アカウント削除を受け付けたユーザーは除く。 */
export function isSeedableUser(user: Doc<"users"> | null): user is Doc<"users"> {
  return user !== null && !user.isDeleted && user.accountDeletionRequestedAt === undefined;
}

export type UserSeedOrganization = {
  organization: Doc<"organizations">;
  person: Doc<"organizationPeople">;
  member: Doc<"organizationMembers">;
  canDelete: boolean;
  reason: string | null;
};

/**
 * ユーザーが有効な管理者として所属する組織と、画面からの組織削除と同じ条件で消せるかを返す。
 * ほかの管理者がいる組織、有料契約の組織、店舗の削除中の組織は消せない。
 */
export async function listUserSeedOrganizations(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
): Promise<UserSeedOrganization[]> {
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .take(ORGANIZATION_PER_USER_LIMIT);
  const organizations: UserSeedOrganization[] = [];
  for (const member of members) {
    const [organization, person] = await Promise.all([ctx.db.get(member.organizationId), ctx.db.get(member.personId)]);
    if (!organization || organization.isDeleted || !person) continue;
    const billingState = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organization._id))
      .unique();
    const eligibility = await getOrganizationDeletionEligibility(ctx, {
      organizationId: organization._id,
      actorMemberId: member._id,
      billingState,
    });
    organizations.push({
      organization,
      person,
      member,
      canDelete: eligibility.canDelete,
      reason: eligibility.canDelete ? null : eligibility.reason,
    });
  }
  return organizations;
}

export async function listSeedableUsers(ctx: Pick<QueryCtx, "db">): Promise<Doc<"users">[]> {
  const users = await ctx.db.query("users").take(USER_LIST_LIMIT);
  return users.filter(isSeedableUser);
}
