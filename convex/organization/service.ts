import type { GenericDatabaseReader } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  type CanonicalOrganizationBillingState,
  canonicalizeOrganizationBillingState,
} from "../organizationBilling/policy";
import { collectIssuedInvitationsByOrganization } from "../organizationInvitation/lifecycle";
import { getOrganizationInvitationPurpose } from "../organizationInvitation/purpose";
import { MANAGER_PERSON_REMOVAL_DISABLED_REASON } from "./personCapabilities";

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

export type OrganizationActualUsage = {
  peopleCount: number;
  activeManagerCount: number;
  activeShopCount: number;
};

export type OrganizationProjectedUsage = {
  projectedPersonCount: number;
  projectedActiveManagerCount: number;
  reservedSeatCount: number;
  pendingManagerInvitationCount: number;
};

export const ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT = 100;

export type OrganizationUsageDimension = "people" | "activeShops" | "activeManagers";

export type OrganizationActualUsageProbe = {
  usage: OrganizationActualUsage;
  unknownDimensions: OrganizationUsageDimension[];
  lowerBoundDimensions: OrganizationUsageDimension[];
};

/**
 * 組織全体を上限超過として扱うかは、未承認招待を含まない現在の実数だけで判定する。
 */
export function toOrganizationActualUsage(usage: OrganizationUsageSnapshot): OrganizationActualUsage {
  return {
    peopleCount: usage.personCount,
    activeManagerCount: usage.activeManagerCount,
    activeShopCount: usage.activeShopCount,
  };
}

/** 追加・招待後の上限判定で使う見込み値を、実数と明示的に分離する。 */
export function toOrganizationProjectedUsage(usage: OrganizationUsageSnapshot): OrganizationProjectedUsage {
  return {
    projectedPersonCount: usage.projectedPersonCount,
    projectedActiveManagerCount: usage.projectedActiveManagerCount,
    reservedSeatCount: usage.reservedSeatCount,
    pendingManagerInvitationCount: usage.pendingManagerInvitationCount,
  };
}

export type CanonicalOrganizationBillingStateDocument = Omit<Doc<"organizationBillingStates">, "state"> & {
  state: CanonicalOrganizationBillingState;
};

export async function getOrganizationBillingState(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
): Promise<CanonicalOrganizationBillingStateDocument | null> {
  const billingState = await ctx.db
    .query("organizationBillingStates")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  return billingState
    ? {
        ...billingState,
        state: canonicalizeOrganizationBillingState(billingState.state),
      }
    : null;
}

export async function requireOrganizationBillingState(ctx: DbCtx, organizationId: Id<"organizations">) {
  const billingState = await getOrganizationBillingState(ctx, organizationId);
  if (!billingState) {
    // m012未完了またはmigration conflictの可能性があるため、移行元や利用状況からプランを推測しない。
    throw new ConvexError("組織の契約情報を確認中です。\nしばらくしてから、もう一度お試しください。");
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

async function getValidOrganizationManagerPersonIds(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  candidatePersonIds: Iterable<Id<"organizationPeople">>,
  allowedStatuses: ReadonlySet<Doc<"organizationMembers">["status"]>,
) {
  const validPersonIds: Id<"organizationPeople">[] = [];
  for (const personId of new Set(candidatePersonIds)) {
    if (await isValidOrganizationManagerPerson(ctx, organizationId, personId, allowedStatuses)) {
      validPersonIds.push(personId);
    }
  }
  return validPersonIds;
}

/** 削除・権限解除後も組織を管理できる、本人性まで確認済みのactive管理者を返す。 */
export async function getValidActiveOrganizationManagerPersonIds(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
): Promise<Id<"organizationPeople">[]> {
  const activeMembers = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
    .collect();
  return await getValidOrganizationManagerPersonIds(
    ctx,
    organizationId,
    activeMembers.map((member) => member.personId),
    ACTIVE_MANAGER_STATUSES,
  );
}

/** 上限超過の整理操作を行うactive管理者の本人性を確認する。 */
export async function isValidOrganizationActiveManager(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  personId: Id<"organizationPeople">,
) {
  return await isValidOrganizationManagerPerson(ctx, organizationId, personId, ACTIVE_MANAGER_STATUSES);
}

/** restricted復旧担当者として使える管理者本人性を、削除mutationと同じ条件で確認する。 */
export async function isValidOrganizationRecoveryManager(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  personId: Id<"organizationPeople">,
) {
  return await isValidOrganizationManagerPerson(ctx, organizationId, personId, RECOVERY_MANAGER_STATUSES);
}

/**
 * 個別の人物・staff所属を外す前に、管理者権限が残っていないことを確認する。
 * 重複membershipは管理者状態を一意に証明できないためfail closedにする。
 */
export async function requireOrganizationPersonWithoutManagerRole(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  personId: Id<"organizationPeople">,
) {
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_personId", (q) => q.eq("organizationId", organizationId).eq("personId", personId))
    .take(2);
  if (members.length > 1) {
    throw new ConvexError("管理者権限の状態を確認できません。\n画面を更新して、もう一度お試しください。");
  }
  const member = members[0] ?? null;
  if (member?.status === "active" || member?.status === "readOnly") {
    throw new ConvexError(MANAGER_PERSON_REMOVAL_DISABLED_REASON);
  }
  return member;
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

/** canonicalな管理者権限の失効時に、同じ組織の旧店舗所属から権限が復活しないようにする。 */
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
  const [people, activeMembers, explicitActiveShops, legacyActiveShops, pendingInvitations] = await Promise.all([
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
      .withIndex("by_organizationId_and_operatingStatus_and_isDeleted", (q) =>
        q.eq("organizationId", organizationId).eq("operatingStatus", "active").eq("isDeleted", false),
      )
      .collect(),
    // TODO[narrow]: 全deploymentでm025完走・verifyShopsのstatus残件0確認後に削除する。
    ctx.db
      .query("shops")
      .withIndex("by_organizationId_and_operatingStatus_and_isDeleted", (q) =>
        q.eq("organizationId", organizationId).eq("operatingStatus", undefined).eq("isDeleted", false),
      )
      .collect(),
    collectIssuedInvitationsByOrganization(ctx, organizationId),
  ]);

  const activeManagerPersonIds = new Set(
    await getValidOrganizationManagerPersonIds(
      ctx,
      organizationId,
      activeMembers.map((member) => member.personId),
      ACTIVE_MANAGER_STATUSES,
    ),
  );
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
    activeManagerCount: activeManagerPersonIds.size,
    pendingManagerInvitationCount,
    projectedActiveManagerCount: activeManagerPersonIds.size + pendingManagerInvitationCount,
    activeShopCount: explicitActiveShops.length + legacyActiveShops.length,
  };
}

/**
 * 全業務writeのhot path用。上限超過の判定に必要な下限だけをboundedに読む。
 * active人物が異常に多く、staff/manager該当者の全数を証明できない場合はunknownへ閉じる。
 */
export async function getOrganizationActualUsageProbe(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  limits: { maxPeople: number; maxActiveShops: number; maxActiveManagers: number },
): Promise<OrganizationActualUsageProbe> {
  const [activePeopleRows, activeMembers, explicitActiveShops, legacyActiveShops] = await Promise.all([
    ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
      .take(ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT + 1),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
      .take(limits.maxPeople + 1),
    ctx.db
      .query("shops")
      .withIndex("by_organizationId_and_operatingStatus_and_isDeleted", (q) =>
        q.eq("organizationId", organizationId).eq("operatingStatus", "active").eq("isDeleted", false),
      )
      .take(ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT + 1),
    // TODO[narrow]: 全deploymentでm025完走・verifyShopsのstatus残件0確認後に削除する。
    ctx.db
      .query("shops")
      .withIndex("by_organizationId_and_operatingStatus_and_isDeleted", (q) =>
        q.eq("organizationId", organizationId).eq("operatingStatus", undefined).eq("isDeleted", false),
      )
      .take(ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT + 1),
  ]);

  const activePeople = activePeopleRows.slice(0, ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT);
  const activeShopRows = [...explicitActiveShops, ...legacyActiveShops];
  const shopRows = activeShopRows.slice(0, ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT);
  const activeManagerPersonIds = new Set(
    await getValidOrganizationManagerPersonIds(
      ctx,
      organizationId,
      activeMembers.map((member) => member.personId),
      ACTIVE_MANAGER_STATUSES,
    ),
  );
  const countedPeople = await Promise.all(
    activePeople.map(async (person) => {
      if (activeManagerPersonIds.has(person._id)) return true;
      return Boolean(
        await ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId", (q) =>
            q.eq("organizationId", organizationId).eq("organizationPersonId", person._id),
          )
          .first(),
      );
    }),
  );
  const observedPeopleCount = countedPeople.filter(Boolean).length;
  const observedActiveShopCount = shopRows.length;
  const activePeopleOverflow = activePeopleRows.length > ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT;
  const activeManagersMayHaveMore = activeMembers.length >= limits.maxPeople + 1;
  const activeShopsOverflow = activeShopRows.length > ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT;
  const usage = {
    peopleCount: observedPeopleCount,
    activeManagerCount: activeManagerPersonIds.size,
    activeShopCount: observedActiveShopCount,
  };
  const unknownDimensions: OrganizationUsageDimension[] = [];
  const lowerBoundDimensions: OrganizationUsageDimension[] = [];

  if (activePeopleOverflow || activeManagersMayHaveMore) {
    (observedPeopleCount > limits.maxPeople ? lowerBoundDimensions : unknownDimensions).push("people");
  }
  if (activeManagersMayHaveMore) {
    (activeManagerPersonIds.size > limits.maxActiveManagers ? lowerBoundDimensions : unknownDimensions).push(
      "activeManagers",
    );
  }
  if (activeShopsOverflow) {
    (observedActiveShopCount > limits.maxActiveShops ? lowerBoundDimensions : unknownDimensions).push("activeShops");
  }

  return { usage, unknownDimensions, lowerBoundDimensions };
}
