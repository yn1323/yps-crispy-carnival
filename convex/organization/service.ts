import type { GenericDatabaseReader } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel, Doc, Id } from "../_generated/dataModel";

type DbCtx = {
  db: GenericDatabaseReader<DataModel>;
};

export type OrganizationUsageSnapshot = {
  personCount: number;
  reservedSeatCount: number;
  projectedPersonCount: number;
  activeManagerCount: number;
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
    throw new ConvexError("事業者の契約情報を確認中です。しばらくしてからもう一度お試しください");
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

export async function getOrganizationUsageSnapshot(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  now = Date.now(),
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
      .collect(),
    ctx.db
      .query("organizationInvitations")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "pending"))
      .collect(),
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

  const reservedSeatCount = pendingInvitations.filter(
    (invitation) => invitation.reservedSeat && invitation.expiresAt > now,
  ).length;
  return {
    personCount,
    reservedSeatCount,
    projectedPersonCount: personCount + reservedSeatCount,
    activeManagerCount: activeMembers.length,
    activeShopCount: activeShops.length,
  };
}
