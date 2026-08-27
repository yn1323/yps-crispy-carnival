import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { dateJST } from "../_lib/dateFormat";
import { managerQuery } from "../_lib/functions";
import { normalizeEmail } from "../_lib/validation";
import { ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT } from "../constants";
import { listActiveStaffsForOrganizationPerson, resolveCanonicalStaffScope } from "../line/service";
import { collectNotificationResendCooldowns } from "../notificationOutbox/resendCooldown";
import { collectPersonRemovalPreview } from "../organization/personRemoval";
import {
  INACTIVE_SHOP_MEMBERSHIP_CHANGE_DISABLED_REASON,
  ORGANIZATION_SHOP_STAFF_MEMBERSHIP_CHANGE_TARGET_LIMIT,
  organizationShopOperatingStatus,
} from "../organization/shopMembershipChange";
import { getOrganizationBillingPolicy } from "../organizationBilling/service";
import { collectOrganizationShopStaffMembershipSnapshot } from "./service";

const ORGANIZATION_PERSON_LIST_LIMIT = 100;

const availableOrganizationPersonValidator = v.object({
  personId: v.id("organizationPeople"),
  name: v.string(),
  email: v.string(),
  shopNames: v.array(v.string()),
  isManager: v.boolean(),
});

const nullableStringValidator = v.union(v.null(), v.string());
const nullableNumberValidator = v.union(v.null(), v.number());

const notificationResendCooldownsValidator = v.object({
  openRecruitmentsUntil: nullableNumberValidator,
  currentShiftUntil: nullableNumberValidator,
  lineInviteUntil: nullableNumberValidator,
});

function latestNullableNumber(left: number | null, right: number | null) {
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}

const organizationShopStaffMembershipChangeValidator = v.object({
  membershipFingerprint: v.string(),
  canWrite: v.boolean(),
  writeDisabledReason: nullableStringValidator,
  people: v.array(
    v.object({
      personId: v.id("organizationPeople"),
      name: v.string(),
      email: v.string(),
      isManager: v.boolean(),
      isActiveManager: v.boolean(),
      otherShopNames: v.array(v.string()),
      isSelected: v.boolean(),
      staffId: v.union(v.null(), v.id("staffs")),
      canChange: v.boolean(),
      changeDisabledReason: nullableStringValidator,
    }),
  ),
  preservedStaffs: v.array(
    v.object({
      staffId: v.id("staffs"),
      name: v.string(),
      email: v.string(),
      changeDisabledReason: v.string(),
    }),
  ),
});

const organizationShopStaffMembershipRemovalPreviewValidator = v.union(
  v.object({
    kind: v.literal("stale"),
  }),
  v.object({
    kind: v.literal("ready"),
    removals: v.array(
      v.object({
        personId: v.id("organizationPeople"),
        staffId: v.id("staffs"),
        assignmentCount: v.number(),
        fingerprint: v.string(),
      }),
    ),
    totalAssignmentCount: v.number(),
  }),
  v.object({
    kind: v.literal("tooMany"),
    assignmentCountAtLeast: v.number(),
    limit: v.number(),
  }),
);

function boundedList<T>(items: T[]): T[] | null {
  return items.length <= ORGANIZATION_PERSON_LIST_LIMIT ? items : null;
}

function organizationShopStaffMembershipWriteState(args: {
  memberStatus: "active" | "removed";
  shopStatus: "active" | "archived";
  hasBillingPolicy: boolean;
  canWriteBusinessData: boolean;
  businessWriteBlockReason: "paymentResultPending" | null;
}) {
  const canWrite = args.memberStatus === "active" && args.shopStatus === "active" && args.canWriteBusinessData;
  if (canWrite) return { canWrite: true, writeDisabledReason: null } as const;
  if (args.memberStatus !== "active") {
    return {
      canWrite: false,
      writeDisabledReason: "現在のアカウント状態では、スタッフの所属を変更できません。",
    } as const;
  }
  if (args.shopStatus !== "active") {
    return { canWrite: false, writeDisabledReason: INACTIVE_SHOP_MEMBERSHIP_CHANGE_DISABLED_REASON } as const;
  }
  if (!args.hasBillingPolicy) {
    return {
      canWrite: false,
      writeDisabledReason: "組織の契約情報を確認中のため、スタッフの所属を変更できません。",
    } as const;
  }
  return {
    canWrite: false,
    writeDisabledReason:
      args.businessWriteBlockReason === "paymentResultPending"
        ? "支払い結果が確定してから、スタッフの所属を変更できます。"
        : "契約状態を確認できるまで、スタッフの所属を変更できません。",
  } as const;
}

async function getOrganizationShopStaffMembershipWriteState(
  ctx: Parameters<typeof collectOrganizationShopStaffMembershipSnapshot>[0],
  args: {
    organizationId: Id<"organizations">;
    memberStatus: "active" | "removed";
    shopStatus: "active" | "archived";
  },
) {
  const billingPolicy = await getOrganizationBillingPolicy(ctx, args.organizationId);
  return organizationShopStaffMembershipWriteState({
    memberStatus: args.memberStatus,
    shopStatus: args.shopStatus,
    hasBillingPolicy: billingPolicy !== null,
    canWriteBusinessData: billingPolicy?.canWriteBusinessData ?? false,
    businessWriteBlockReason: billingPolicy?.businessWriteBlockReason ?? null,
  });
}

export const getOrganizationShopStaffMembershipChange = managerQuery({
  args: {},
  returns: v.union(v.null(), organizationShopStaffMembershipChangeValidator),
  handler: async (ctx) => {
    if (!ctx.user || !ctx.shop || !ctx.organization || !ctx.organizationMember) return null;
    const snapshot = await collectOrganizationShopStaffMembershipSnapshot(ctx, {
      organizationId: ctx.organization._id,
      shopId: ctx.shop._id,
    });
    if (!snapshot) return null;
    const writeState = await getOrganizationShopStaffMembershipWriteState(ctx, {
      organizationId: ctx.organization._id,
      memberStatus: ctx.organizationMember.status,
      shopStatus: organizationShopOperatingStatus(snapshot.shop.operatingStatus),
    });
    return {
      membershipFingerprint: snapshot.membershipFingerprint,
      ...writeState,
      people: snapshot.people.map(
        ({ person, isManager, isActiveManager, otherShopNames, currentStaff, canChange, changeDisabledReason }) => ({
          personId: person._id,
          name: person.name,
          email: person.email,
          isManager,
          isActiveManager,
          otherShopNames,
          isSelected: currentStaff !== null,
          staffId: currentStaff?._id ?? null,
          canChange,
          changeDisabledReason,
        }),
      ),
      preservedStaffs: snapshot.preservedStaffs.map(({ staff, changeDisabledReason }) => ({
        staffId: staff._id,
        name: staff.name,
        email: staff.email,
        changeDisabledReason,
      })),
    };
  },
});

export const getNotificationResendCooldowns = managerQuery({
  args: { staffId: v.id("staffs") },
  returns: v.union(v.null(), notificationResendCooldownsValidator),
  handler: async (ctx, args) => {
    if (!ctx.user || !ctx.shop) return null;
    const staff = await ctx.db.get(args.staffId);
    if (!staff || staff.isDeleted || staff.shopId !== ctx.shop._id) return null;

    const currentTarget = { shopId: staff.shopId, staffId: staff._id };
    const currentStaffCooldowns = await collectNotificationResendCooldowns(ctx, [currentTarget]);
    const canonicalScope = await resolveCanonicalStaffScope(ctx, {
      staffId: staff._id,
      shopId: ctx.shop._id,
    });
    if (!canonicalScope) return currentStaffCooldowns;

    const activeStaffs = await listActiveStaffsForOrganizationPerson(ctx, {
      organizationId: canonicalScope.organization._id,
      organizationPersonId: canonicalScope.person._id,
    });
    const otherStaffCooldowns = await collectNotificationResendCooldowns(
      ctx,
      activeStaffs
        .filter((activeStaff) => activeStaff._id !== staff._id)
        .map((activeStaff) => ({ shopId: activeStaff.shopId, staffId: activeStaff._id })),
    );
    return {
      ...currentStaffCooldowns,
      lineInviteUntil: latestNullableNumber(currentStaffCooldowns.lineInviteUntil, otherStaffCooldowns.lineInviteUntil),
    };
  },
});

export const previewOrganizationShopStaffMembershipRemovals = managerQuery({
  args: {
    personIds: v.array(v.id("organizationPeople")),
    expectedMembershipFingerprint: v.string(),
    now: v.number(),
  },
  returns: v.union(v.null(), organizationShopStaffMembershipRemovalPreviewValidator),
  handler: async (ctx, args) => {
    if (!ctx.user || !ctx.shop || !ctx.organization || !ctx.organizationMember) return null;
    if (
      args.personIds.length > ORGANIZATION_SHOP_STAFF_MEMBERSHIP_CHANGE_TARGET_LIMIT ||
      new Set(args.personIds).size !== args.personIds.length ||
      !/^[0-9a-f]{64}$/.test(args.expectedMembershipFingerprint) ||
      !Number.isSafeInteger(args.now) ||
      args.now < 0
    ) {
      throw new ConvexError("入力内容を確認してください。");
    }

    const snapshot = await collectOrganizationShopStaffMembershipSnapshot(ctx, {
      organizationId: ctx.organization._id,
      shopId: ctx.shop._id,
    });
    if (!snapshot) return null;
    if (snapshot.membershipFingerprint !== args.expectedMembershipFingerprint) {
      return { kind: "stale" as const };
    }
    const writeState = await getOrganizationShopStaffMembershipWriteState(ctx, {
      organizationId: ctx.organization._id,
      memberStatus: ctx.organizationMember.status,
      shopStatus: organizationShopOperatingStatus(snapshot.shop.operatingStatus),
    });
    if (!writeState.canWrite) return null;

    const peopleById = new Map(snapshot.people.map((entry) => [entry.person._id, entry]));
    const removalTargets = args.personIds
      .map((personId) => {
        const entry = peopleById.get(personId);
        if (!entry?.currentStaff || !entry.canChange) {
          throw new ConvexError("入力内容を確認してください。");
        }
        return { personId, staff: entry.currentStaff };
      })
      .sort((left, right) => left.personId.localeCompare(right.personId));

    const asOfDate = dateJST(args.now);
    const removals: Array<{
      personId: Id<"organizationPeople">;
      staffId: Id<"staffs">;
      assignmentCount: number;
      fingerprint: string;
    }> = [];
    let totalAssignmentCount = 0;
    for (const target of removalTargets) {
      const preview = await collectPersonRemovalPreview(ctx, {
        scope: {
          kind: "shop",
          organizationId: ctx.organization._id,
          shopId: ctx.shop._id,
          staffId: target.staff._id,
        },
        staffs: [target.staff],
        asOfDate,
      });
      if (preview.kind === "tooMany") {
        return {
          kind: "tooMany" as const,
          assignmentCountAtLeast: preview.assignmentCountAtLeast,
          limit: ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT,
        };
      }
      totalAssignmentCount += preview.assignmentCount;
      if (totalAssignmentCount > ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT) {
        return {
          kind: "tooMany" as const,
          assignmentCountAtLeast: totalAssignmentCount,
          limit: ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT,
        };
      }
      removals.push({
        personId: target.personId,
        staffId: target.staff._id,
        assignmentCount: preview.assignmentCount,
        fingerprint: preview.fingerprint,
      });
    }

    return { kind: "ready" as const, removals, totalAssignmentCount };
  },
});

export const listOrganizationPeopleAvailableForShop = managerQuery({
  args: {},
  returns: v.union(v.null(), v.array(availableOrganizationPersonValidator)),
  handler: async (ctx) => {
    if (!ctx.user || !ctx.shop || !ctx.organization) return [];
    const organizationId = ctx.organization._id;
    const shopId = ctx.shop._id;
    const [peopleResult, activeMembersResult, shopsResult, pendingRequestsResult] = await Promise.all([
      ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
        .take(ORGANIZATION_PERSON_LIST_LIMIT + 1),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
        .take(ORGANIZATION_PERSON_LIST_LIMIT + 1),
      ctx.db
        .query("shops")
        .withIndex("by_organizationId_and_isDeleted", (q) =>
          q.eq("organizationId", organizationId).eq("isDeleted", false),
        )
        .take(ORGANIZATION_PERSON_LIST_LIMIT + 1),
      ctx.db
        .query("staffRegistrationRequests")
        .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", "pending"))
        .take(ORGANIZATION_PERSON_LIST_LIMIT + 1),
    ]);
    const people = boundedList(peopleResult);
    const activeMembers = boundedList(activeMembersResult);
    const allNonDeletedShops = boundedList(shopsResult);
    const pendingRequests = boundedList(pendingRequestsResult);
    if (!people || !activeMembers || !allNonDeletedShops || !pendingRequests) return null;
    if (people.some((person) => normalizeEmail(person.email) !== person.emailNormalized)) return null;
    const members = activeMembers;
    const shops = allNonDeletedShops.filter(
      (shop) => organizationShopOperatingStatus(shop.operatingStatus) === "active",
    );
    const pendingEmails = new Set(pendingRequests.map((request) => request.emailNormalized));

    const staffRowsByShop = await Promise.all(
      shops.map(async (shop) => ({
        shop,
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
          .take(ORGANIZATION_PERSON_LIST_LIMIT + 1),
      })),
    );
    if (staffRowsByShop.some(({ staffs }) => staffs.length > ORGANIZATION_PERSON_LIST_LIMIT)) return null;

    const currentShopStaffs = staffRowsByShop.find(({ shop }) => shop._id === shopId)?.staffs ?? [];
    const currentPersonIds = new Set(
      currentShopStaffs.flatMap((staff) => (staff.organizationPersonId ? [staff.organizationPersonId] : [])),
    );
    const currentEmails = new Set(currentShopStaffs.map((staff) => normalizeEmail(staff.email)));

    const membershipsByPersonId = new Map<Id<"organizationPeople">, Doc<"organizationMembers">[]>();
    for (const member of members) {
      const current = membershipsByPersonId.get(member.personId) ?? [];
      current.push(member);
      membershipsByPersonId.set(member.personId, current);
    }

    const shopNamesByPersonId = new Map<Id<"organizationPeople">, Set<string>>();
    for (const { shop, staffs } of staffRowsByShop) {
      for (const staff of staffs) {
        if (!staff.organizationPersonId) continue;
        const current = shopNamesByPersonId.get(staff.organizationPersonId) ?? new Set<string>();
        current.add(shop.name);
        shopNamesByPersonId.set(staff.organizationPersonId, current);
      }
    }
    return people
      .filter(
        (person) =>
          !currentPersonIds.has(person._id) &&
          !currentEmails.has(person.emailNormalized) &&
          !pendingEmails.has(person.emailNormalized),
      )
      .map((person) => {
        const membersForPerson = membershipsByPersonId.get(person._id) ?? [];
        const isManager =
          person.userId !== undefined && membersForPerson.some((member) => member.userId === person.userId);
        return {
          personId: person._id,
          name: person.name,
          email: person.email,
          shopNames: [...(shopNamesByPersonId.get(person._id) ?? [])].sort((a, b) => a.localeCompare(b, "ja")),
          isManager,
        };
      })
      .sort(
        (left, right) =>
          Number(right.isManager) - Number(left.isManager) ||
          left.name.localeCompare(right.name, "ja") ||
          left.email.localeCompare(right.email),
      );
  },
});
