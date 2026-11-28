import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getOrganizationDeletionEligibility } from "../organization/deletion";

const USER_LIST_LIMIT = 100;
const ORGANIZATION_PER_USER_LIMIT = 20;
/** 確認用の管理者かを確かめるときに読む、有効な管理者の数の上限。プランの上限（5人）より多く読む。 */
const ACTIVE_MEMBER_SCAN_LIMIT = 10;

/**
 * 確認用の管理者（管理者本人のほかに入れる管理者）のユーザーの識別子。
 * Clerkのissuerと合わない値にし、この識別子ではログインできないようにする。
 * 入れ先のユーザーごとに別の値にして、ほかのユーザーの確認用の管理者と取り違えないようにする。
 */
const CO_MANAGER_AUTH_TOKEN_IDENTIFIER_PREFIX = "https://seed.example.test|user-seed-";

export const userSeedCoManagerAuthTokenIdentifier = (ownerUserId: Id<"users">, index: number) =>
  `${CO_MANAGER_AUTH_TOKEN_IDENTIFIER_PREFIX}${ownerUserId}-manager-${index + 1}`;

/** 確認用の管理者のユーザーか。`ownerUserId`を渡すと、そのユーザーのために作った管理者だけを当てる。 */
export function isUserSeedCoManagerUser(user: Doc<"users"> | null, ownerUserId?: Id<"users">): user is Doc<"users"> {
  const prefix =
    ownerUserId === undefined
      ? CO_MANAGER_AUTH_TOKEN_IDENTIFIER_PREFIX
      : `${CO_MANAGER_AUTH_TOKEN_IDENTIFIER_PREFIX}${ownerUserId}-manager-`;
  return user?.authTokenIdentifier.startsWith(prefix) === true;
}

/**
 * 確認用データを入れられる管理者ユーザーか。
 * 削除済みのユーザー、アカウント削除を受け付けたユーザー、確認用の管理者のユーザーは除く。
 */
export function isSeedableUser(user: Doc<"users"> | null): user is Doc<"users"> {
  return (
    user !== null && !user.isDeleted && user.accountDeletionRequestedAt === undefined && !isUserSeedCoManagerUser(user)
  );
}

export type UserSeedOrganization = {
  organization: Doc<"organizations">;
  person: Doc<"organizationPeople">;
  member: Doc<"organizationMembers">;
  canDelete: boolean;
  reason: string | null;
  /** 消す前に管理者の権限を外す、確認用の管理者。 */
  coManagerPersonIds: Id<"organizationPeople">[];
};

/**
 * ほかの有効な管理者が、このユーザーのために作った確認用の管理者だけなら、その人物を返す。
 * 画面で招待した管理者が1人でもいれば`null`を返す。
 */
async function findCoManagerPersonIds(
  ctx: Pick<QueryCtx, "db">,
  args: { organizationId: Id<"organizations">; actorMemberId: Id<"organizationMembers">; ownerUserId: Id<"users"> },
): Promise<Id<"organizationPeople">[] | null> {
  const activeMembers = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_status", (q) =>
      q.eq("organizationId", args.organizationId).eq("status", "active"),
    )
    .take(ACTIVE_MEMBER_SCAN_LIMIT + 1);
  if (activeMembers.length > ACTIVE_MEMBER_SCAN_LIMIT) return null;
  const others = activeMembers.filter((member) => member._id !== args.actorMemberId);
  if (others.length === 0 || others.length === activeMembers.length) return null;
  for (const member of others) {
    if (!isUserSeedCoManagerUser(await ctx.db.get(member.userId), args.ownerUserId)) return null;
  }
  return others.map((member) => member.personId);
}

/**
 * ユーザーが有効な管理者として所属する組織と、画面からの組織削除と同じ条件で消せるかを返す。
 * ほかの管理者がいる組織、有料契約の組織、店舗の削除中の組織は消せない。
 * ほかの管理者が確認用の管理者だけの組織は、その権限を外してから消せるものとして返す。
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
    const coManagerPersonIds =
      !eligibility.canDelete && eligibility.code === "manager"
        ? await findCoManagerPersonIds(ctx, {
            organizationId: organization._id,
            actorMemberId: member._id,
            ownerUserId: userId,
          })
        : null;
    const canDelete = eligibility.canDelete || coManagerPersonIds !== null;
    organizations.push({
      organization,
      person,
      member,
      canDelete,
      reason: eligibility.canDelete || canDelete ? null : eligibility.reason,
      coManagerPersonIds: coManagerPersonIds ?? [],
    });
  }
  return organizations;
}

export async function listSeedableUsers(ctx: Pick<QueryCtx, "db">): Promise<Doc<"users">[]> {
  const users = await ctx.db.query("users").take(USER_LIST_LIMIT);
  return users.filter(isSeedableUser);
}
