import type { GenericDatabaseReader } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { collectIssuedInvitationsByOrganization } from "../organizationInvitation/lifecycle";
import { getOrganizationInvitationPurpose } from "../organizationInvitation/purpose";

type DbCtx = {
  db: GenericDatabaseReader<DataModel>;
};

const ACTIVE_MANAGER_STATUSES: ReadonlySet<Doc<"organizationMembers">["status"]> = new Set(["active"]);
const RECOVERY_MANAGER_STATUSES: ReadonlySet<Doc<"organizationMembers">["status"]> = new Set(["active", "readOnly"]);

export type OrganizationUsageSnapshot = {
  personCount: number;
  reservedSeatCount: number;
  projectedPersonCount: number;
  activeManagerCount: number;
  pendingManagerInvitationCount: number;
  projectedActiveManagerCount: number;
  activeShopCount: number;
};

export async function getOrganizationBillingState(ctx: DbCtx, organizationId: Id<"organizations">) {
  return await ctx.db
    .query("organizationBillingStates")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
}

export async function requireOrganizationBillingState(ctx: DbCtx, organizationId: Id<"organizations">) {
  const billingState = await getOrganizationBillingState(ctx, organizationId);
  if (!billingState) {
    // m012未完了またはmigration conflictの可能性があるため、移行元や利用状況からプランを推測しない。
    throw new ConvexError("グループの契約情報を確認中です。しばらくしてからもう一度お試しください");
  }
  return billingState;
}

export async function getOrganizationPersonForUser(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  userId: Id<"users">,
): Promise<Doc<"organizationPeople"> | null> {
  const people = await ctx.db
    .query("organizationPeople")
    .withIndex("by_organizationId_and_userId", (q) => q.eq("organizationId", organizationId).eq("userId", userId))
    .take(2);
  return people.length === 1 ? people[0] : null;
}

async function isValidOrganizationManagerPerson(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  personId: Id<"organizationPeople">,
  allowedStatuses: ReadonlySet<Doc<"organizationMembers">["status"]>,
) {
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_personId", (q) => q.eq("organizationId", organizationId).eq("personId", personId))
    .take(2);
  if (members.length !== 1 || !allowedStatuses.has(members[0].status)) return false;
  const member = members[0];
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
  return Boolean(
    userMemberships.length === 1 &&
      userMemberships[0]._id === member._id &&
      person?.organizationId === organizationId &&
      person.status === "active" &&
      person.userId === member.userId &&
      user &&
      !user.isDeleted,
  );
}

/** 削除・権限解除後もグループを管理できる、本人性まで確認済みのactive管理者を返す。 */
export async function getValidActiveOrganizationManagerPersonIds(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
): Promise<Id<"organizationPeople">[]> {
  const activeMembers = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
    .collect();
  const candidatePersonIds = new Set(activeMembers.map((member) => member.personId));
  const validPersonIds: Id<"organizationPeople">[] = [];

  for (const personId of candidatePersonIds) {
    if (await isValidOrganizationManagerPerson(ctx, organizationId, personId, ACTIVE_MANAGER_STATUSES)) {
      validPersonIds.push(personId);
    }
  }

  return validPersonIds;
}

/** restricted復旧担当者として使える管理者本人性を、削除mutationと同じ条件で確認する。 */
export async function isValidOrganizationRecoveryManager(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  personId: Id<"organizationPeople">,
) {
  return await isValidOrganizationManagerPerson(ctx, organizationId, personId, RECOVERY_MANAGER_STATUSES);
}

/** active人物が現在の利用人数へ算入されているかを、管理者権限とstaff履歴から判定する。 */
export async function organizationPersonCountsTowardPeopleLimit(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  personId: Id<"organizationPeople">,
) {
  const person = await ctx.db.get(personId);
  if (!person || person.organizationId !== organizationId || person.status !== "active") return false;
  const [memberships, staff] = await Promise.all([
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", organizationId).eq("personId", personId),
      )
      .collect(),
    ctx.db
      .query("staffs")
      .withIndex("by_organizationId_and_organizationPersonId", (q) =>
        q.eq("organizationId", organizationId).eq("organizationPersonId", personId),
      )
      .first(),
  ]);
  return Boolean(staff) || memberships.some((membership) => membership.status === "active");
}

/** canonicalな管理者権限の失効時に、同じグループの旧店舗所属から権限が復活しないようにする。 */
export async function removeLegacyOrganizationManagerAccess(
  ctx: Pick<MutationCtx, "db">,
  organizationId: Id<"organizations">,
  userId: Id<"users">,
) {
  const shops = await ctx.db
    .query("shops")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .collect();
  let removedCount = 0;
  for (const shop of shops) {
    const memberships = await ctx.db
      .query("shopMembers")
      .withIndex("by_userId_and_shopId", (q) => q.eq("userId", userId).eq("shopId", shop._id))
      .collect();
    for (const membership of memberships) {
      if (membership.isDeleted) continue;
      await ctx.db.patch(membership._id, { isDeleted: true });
      removedCount += 1;
    }
  }
  return removedCount;
}

export async function getOrganizationUsageSnapshot(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  now = Date.now(),
  options?: { excludedInvitationId?: Id<"organizationInvitations"> },
): Promise<OrganizationUsageSnapshot> {
  const [people, activeMembers, activeShops, pendingInvitations] = await Promise.all([
    ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", organizationId))
      .collect(),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
      .collect(),
    ctx.db
      .query("shops")
      .withIndex("by_organizationId_and_operatingStatus", (q) =>
        q.eq("organizationId", organizationId).eq("operatingStatus", "active"),
      )
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .collect(),
    collectIssuedInvitationsByOrganization(ctx, organizationId),
  ]);

  const activeManagerPersonIds = new Set(activeMembers.map((member) => member.personId));
  let personCount = 0;
  for (const person of people) {
    if (person.status !== "active") continue;
    if (activeManagerPersonIds.has(person._id)) {
      personCount += 1;
      continue;
    }

    // 店舗所属を外しても事業者に残るスタッフは算入を継続するため、削除済みstaff rowも根拠にする。
    const hasStaffRole = await ctx.db
      .query("staffs")
      .withIndex("by_organizationId_and_organizationPersonId", (q) =>
        q.eq("organizationId", organizationId).eq("organizationPersonId", person._id),
      )
      .first();
    if (hasStaffRole) personCount += 1;
  }

  const activePendingInvitations = pendingInvitations.filter(
    (invitation) => invitation._id !== options?.excludedInvitationId && invitation.expiresAt > now,
  );
  const reservedSeatCount = activePendingInvitations.filter((invitation) => invitation.reservedSeat).length;
  const pendingManagerInvitationCount = activePendingInvitations.filter(
    (invitation) => getOrganizationInvitationPurpose(invitation) === "managerAddition",
  ).length;
  return {
    personCount,
    reservedSeatCount,
    projectedPersonCount: personCount + reservedSeatCount,
    activeManagerCount: activeMembers.length,
    pendingManagerInvitationCount,
    projectedActiveManagerCount: activeMembers.length + pendingManagerInvitationCount,
    activeShopCount: activeShops.length,
  };
}
