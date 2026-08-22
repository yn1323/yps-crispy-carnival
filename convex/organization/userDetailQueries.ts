import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { dateJST } from "../_lib/dateFormat";
import { managerQuery } from "../_lib/functions";
import { ORGANIZATION_USER_DETAIL_SHOP_SCAN_LIMIT, ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT } from "../constants";
import { getOrganizationPersonLineState } from "../line/service";
import { deriveOrganizationBillingPolicy, getEffectiveRestrictedBillingState } from "../organizationBilling/policy";
import { getOrganizationAccessPolicy } from "../organizationBilling/service";
import { collectIssuedInvitationsByOrganization } from "../organizationInvitation/lifecycle";
import { isOrganizationBillingContact } from "./billingContact";
import { managerInvitationStateValidator, resolvePersonManagerInvitationState } from "./managerInvitationState";
import { deriveOrganizationPersonCapabilities, type ManagerRole } from "./personCapabilities";
import {
  collectPersonRemovalPreview,
  personRemovalPreviewValidator,
  toPublicPersonRemovalPreview,
} from "./personRemoval";
import {
  getOrganizationUsageSnapshot,
  getValidActiveOrganizationManagerPersonIds,
  isValidOrganizationRecoveryManager,
} from "./service";
import {
  createOrganizationPersonShopMembershipFingerprint,
  INACTIVE_SHOP_MEMBERSHIP_CHANGE_DISABLED_REASON,
  organizationShopOperatingStatus,
} from "./shopMembershipChange";
import { organizationShopOperatingStatusValidator } from "./validators";

export const userDetailValidator = v.object({
  person: v.object({
    id: v.id("organizationPeople"),
    name: v.string(),
    email: v.string(),
    hasLinkedAccount: v.boolean(),
  }),
  isSelf: v.boolean(),
  managerRole: v.union(v.literal("active"), v.literal("readOnly"), v.literal("none")),
  hasManagerInvitation: v.boolean(),
  managerInvitationState: managerInvitationStateValidator,
  canRemoveManagerRole: v.boolean(),
  managerRoleRemovalDisabledReason: v.optional(v.string()),
  canRemove: v.boolean(),
  removeDisabledReason: v.optional(v.string()),
  removalPreview: personRemovalPreviewValidator,
  canWrite: v.boolean(),
  writeDisabledReason: v.optional(v.string()),
  line: v.object({
    status: v.union(v.literal("unlinked"), v.literal("linked_following"), v.literal("linked_unfollowed")),
    actionShopId: v.id("shops"),
    sourceStaffId: v.union(v.id("staffs"), v.null()),
    sourceShopId: v.union(v.id("shops"), v.null()),
    canLink: v.boolean(),
    linkDisabledReason: v.optional(v.string()),
    canDisconnect: v.boolean(),
    disconnectDisabledReason: v.optional(v.string()),
  }),
  membershipFingerprint: v.string(),
  shops: v.array(
    v.object({
      shopId: v.id("shops"),
      shopName: v.string(),
      shopStatus: organizationShopOperatingStatusValidator,
      canChangeMembership: v.boolean(),
      membershipChangeDisabledReason: v.optional(v.string()),
    }),
  ),
  memberships: v.array(
    v.object({
      staffId: v.id("staffs"),
      shopId: v.id("shops"),
      shopName: v.string(),
      shopStatus: organizationShopOperatingStatusValidator,
      excludedFromShift: v.boolean(),
      canRemove: v.boolean(),
      removeDisabledReason: v.optional(v.string()),
      removalPreview: personRemovalPreviewValidator,
    }),
  ),
});

export const getUserDetail = managerQuery({
  // route paramは任意文字列になり得るため、validatorでquery errorにせずgeneric not-foundへ寄せる。
  args: {
    personId: v.string(),
    now: v.number(),
    // 店舗別設定では、personと対象店舗の所属関係をブラウザへ返す前に検証する。
    requireTargetShopMembership: v.optional(v.boolean()),
  },
  returns: v.union(userDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const { shop, organization, organizationMember } = ctx;
    if (!shop || !organization || !organizationMember || !Number.isFinite(args.now) || args.now < 0) return null;

    return await getOrganizationUserDetail(
      { ...ctx, organization, organizationMember },
      {
        personId: args.personId,
        now: args.now,
        actionShopId: shop._id,
        ...(args.requireTargetShopMembership ? { requiredTargetShopId: shop._id } : {}),
      },
    );
  },
});

type OrganizationUserDetailQueryCtx = QueryCtx & {
  organization: Doc<"organizations">;
  organizationMember: Doc<"organizationMembers">;
};

/** canonicalな組織actorを受け取り、旧画面と同じ詳細DTOを組み立てる。 */
export async function getOrganizationUserDetail(
  ctx: OrganizationUserDetailQueryCtx,
  args: {
    personId: string;
    now: number;
    actionShopId?: Id<"shops">;
    requiredTargetShopId?: Id<"shops">;
  },
) {
  const { organization, organizationMember } = ctx;
  if (!Number.isFinite(args.now) || args.now < 0) return null;

  const personId = ctx.db.normalizeId("organizationPeople", args.personId);
  if (!personId) return null;
  const person = await ctx.db.get(personId);
  if (!person || person.organizationId !== organization._id || person.status !== "active") return null;

  const [personMembers, staffDocs, shopDocs, access, usage, validActiveManagerPersonIds, invitationDocs] =
    await Promise.all([
      ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", organization._id).eq("personId", person._id),
        )
        .take(2),
      ctx.db
        .query("staffs")
        .withIndex("by_organizationId_and_organizationPersonId", (q) =>
          q.eq("organizationId", organization._id).eq("organizationPersonId", person._id),
        )
        .take(ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT + 1),
      ctx.db
        .query("shops")
        .withIndex("by_organizationId_and_isDeleted", (q) =>
          q.eq("organizationId", organization._id).eq("isDeleted", false),
        )
        .take(ORGANIZATION_USER_DETAIL_SHOP_SCAN_LIMIT + 1),
      getOrganizationAccessPolicy(ctx, organization._id),
      getOrganizationUsageSnapshot(ctx, organization._id, args.now),
      getValidActiveOrganizationManagerPersonIds(ctx, organization._id),
      collectIssuedInvitationsByOrganization(ctx, organization._id),
    ]);
  const billingState = access?.billingState ?? null;
  const isActiveActor = organizationMember.status === "active";
  const canWriteNormally = isActiveActor && access?.canWriteBusinessData === true;
  const canRecoverUsageLimits = isActiveActor && access?.accessMode === "limitRecoveryOnly";
  if (
    personMembers.length > 1 ||
    staffDocs.length > ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT ||
    shopDocs.length > ORGANIZATION_USER_DETAIL_SHOP_SCAN_LIMIT
  ) {
    return null;
  }

  const member = personMembers[0] ?? null;
  const memberUser = member ? await ctx.db.get(member.userId) : null;
  const memberMatchesPerson = Boolean(
    member && person.userId && member.userId === person.userId && memberUser && !memberUser.isDeleted,
  );
  if (member && !memberMatchesPerson) return null;
  const managerRole: ManagerRole =
    memberMatchesPerson && member?.status === "active"
      ? "active"
      : memberMatchesPerson && member?.status === "readOnly"
        ? "readOnly"
        : "none";
  if (managerRole === "active" && !validActiveManagerPersonIds.includes(person._id)) return null;

  const today = dateJST(args.now);
  const removalPreview = await collectPersonRemovalPreview(ctx, {
    scope: { kind: "organization", organizationId: organization._id, personId: person._id },
    staffs: staffDocs,
    asOfDate: today,
  });

  const membershipRows = await Promise.all(
    staffDocs
      .filter((staff) => !staff.isDeleted)
      .map(async (staff) => {
        const targetShop = await ctx.db.get(staff.shopId);
        if (!targetShop || targetShop.isDeleted || targetShop.organizationId !== organization._id) return null;
        const targetShopStatus = organizationShopOperatingStatus(targetShop.operatingStatus);
        const membershipRemovalPreview = await collectPersonRemovalPreview(ctx, {
          scope: {
            kind: "shop",
            organizationId: organization._id,
            shopId: targetShop._id,
            staffId: staff._id,
          },
          staffs: [staff],
          asOfDate: today,
        });
        return {
          staff,
          view: {
            staffId: staff._id,
            shopId: targetShop._id,
            shopName: targetShop.name,
            shopStatus: targetShopStatus,
            // TODO[narrow]: 全deploymentでm027完走・missingExcludedFromShift=0確認後にfallbackを外す。
            excludedFromShift: staff.excludedFromShift ?? false,
            canRemove: targetShopStatus === "active" && canWriteNormally,
            ...(targetShopStatus !== "active"
              ? { removeDisabledReason: INACTIVE_SHOP_MEMBERSHIP_CHANGE_DISABLED_REASON }
              : !canWriteNormally
                ? { removeDisabledReason: "現在の利用状態では、店舗所属を変更できません。" }
                : {}),
            removalPreview: toPublicPersonRemovalPreview(membershipRemovalPreview),
          },
        };
      }),
  );
  if (membershipRows.some((row) => row === null)) return null;
  const validMembershipRows = membershipRows.filter((row) => row !== null);
  if (args.requiredTargetShopId && !validMembershipRows.some((row) => row.staff.shopId === args.requiredTargetShopId)) {
    return null;
  }
  const seenShopIds = new Set<string>();
  for (const row of validMembershipRows) {
    if (seenShopIds.has(row.view.shopId)) return null;
    seenShopIds.add(row.view.shopId);
  }
  const membershipFingerprint = await createOrganizationPersonShopMembershipFingerprint(
    validMembershipRows.map((row) => ({
      staffId: row.staff._id,
      shopId: row.staff.shopId,
      shopStatus: row.view.shopStatus,
    })),
  );
  const memberships = validMembershipRows
    .map((row) => row.view)
    .sort((a, b) => a.shopName.localeCompare(b.shopName, "ja") || a.shopId.localeCompare(b.shopId));
  const lineState = await getOrganizationPersonLineState(ctx, {
    organizationId: organization._id,
    organizationPersonId: person._id,
  });
  if (!lineState) return null;
  const shops = shopDocs
    .map((targetShop) => {
      const targetShopStatus = organizationShopOperatingStatus(targetShop.operatingStatus);
      return {
        shopId: targetShop._id,
        shopName: targetShop.name,
        shopStatus: targetShopStatus,
        canChangeMembership: targetShopStatus === "active" && canWriteNormally,
        ...(targetShopStatus !== "active"
          ? { membershipChangeDisabledReason: INACTIVE_SHOP_MEMBERSHIP_CHANGE_DISABLED_REASON }
          : !canWriteNormally
            ? { membershipChangeDisabledReason: "現在の利用状態では、店舗所属を変更できません。" }
            : {}),
      };
    })
    .sort((a, b) => a.shopName.localeCompare(b.shopName, "ja") || a.shopId.localeCompare(b.shopId));
  const activePendingInvitations = invitationDocs.filter((invitation) => invitation.expiresAt > args.now);
  const managerInvitationState = await resolvePersonManagerInvitationState(ctx, {
    organization,
    actorMember: organizationMember,
    person,
    personMembers,
    contactEmail: person.email,
    isOrganizationLinked: true,
    billingState,
    usage,
    activePendingInvitations,
  });

  const policy = billingState ? deriveOrganizationBillingPolicy(billingState.state) : null;
  const restrictedState = billingState ? getEffectiveRestrictedBillingState(billingState.state) : null;
  const recoveryManagerValidity = restrictedState
    ? await Promise.all(
        restrictedState.recoveryManagerPersonIds.map(
          async (candidateId) =>
            [candidateId, await isValidOrganizationRecoveryManager(ctx, organization._id, candidateId)] as const,
        ),
      )
    : [];
  const recoveryPersonIds = recoveryManagerValidity.flatMap(([candidateId, isValid]) => (isValid ? [candidateId] : []));
  const isRestrictedRecovery = recoveryPersonIds.includes(organizationMember.personId);
  const isRecoveryManager = recoveryPersonIds.includes(person._id);
  const personCapabilities = deriveOrganizationPersonCapabilities({
    managerRole,
    activeManagerCount: validActiveManagerPersonIds.length,
    canWriteNormally,
    canRecoverUsageLimits,
    policy,
    isStaff: memberships.length > 0,
    isBillingContact: isOrganizationBillingContact(organization, person),
    isActiveActor,
    isRestricted: restrictedState !== null,
    isRestrictedRecovery,
    isLastRecoveryManager: isRecoveryManager && recoveryPersonIds.length <= 1,
  });

  const writeDisabledReason = canWriteNormally
    ? undefined
    : !isActiveActor
      ? "閲覧のみの管理者は、ユーザー情報を変更できません。"
      : !billingState
        ? "組織の契約情報を確認中のため、ユーザー情報を変更できません。"
        : access?.businessWriteBlockReason === "paymentResultPending"
          ? "支払い結果が確定してから、ユーザー情報を変更できます。"
          : access?.businessWriteBlockReason === "usageLimitExceeded"
            ? "プラン上限を超過しているため、利用人数・店舗・管理者を上限内に減らすか、プランを変更してください。"
            : "契約状態を確認できるまで、ユーザー情報を変更できません。";
  const lineSourceMembership = memberships.find((membership) => membership.shopStatus === "active") ?? null;
  const actionShopId =
    args.actionShopId ??
    lineSourceMembership?.shopId ??
    shops.find((candidate) => candidate.shopStatus === "active")?.shopId ??
    shops[0]?.shopId;
  if (!actionShopId) return null;
  const canLinkLine = canWriteNormally && lineSourceMembership !== null;
  const lineLinkDisabledReason = canLinkLine
    ? undefined
    : !canWriteNormally
      ? writeDisabledReason
      : "LINE連携を設定するには、稼働中の店舗へ所属を追加してください。";
  // LINE解除は通知停止の安全操作なので、active managerなら課金read-only中も許可する。
  const canDisconnectLine = isActiveActor && lineState.status !== "unlinked";
  const lineDisconnectDisabledReason =
    lineState.status === "unlinked"
      ? undefined
      : canDisconnectLine
        ? undefined
        : "閲覧のみの管理者は、LINE連携を解除できません。";

  return {
    person: {
      id: person._id,
      name: person.name,
      email: person.email,
      hasLinkedAccount: person.userId !== undefined,
    },
    isSelf: person._id === organizationMember.personId,
    managerRole,
    hasManagerInvitation: activePendingInvitations.some((invitation) => invitation.targetPersonId === person._id),
    managerInvitationState,
    ...personCapabilities,
    removalPreview: toPublicPersonRemovalPreview(removalPreview),
    canWrite: canWriteNormally,
    ...(writeDisabledReason ? { writeDisabledReason } : {}),
    line: {
      status: lineState.status,
      actionShopId,
      sourceStaffId: lineSourceMembership?.staffId ?? null,
      sourceShopId: lineSourceMembership?.shopId ?? null,
      canLink: canLinkLine,
      ...(lineLinkDisabledReason ? { linkDisabledReason: lineLinkDisabledReason } : {}),
      canDisconnect: canDisconnectLine,
      ...(lineDisconnectDisabledReason ? { disconnectDisabledReason: lineDisconnectDisabledReason } : {}),
    },
    membershipFingerprint,
    shops,
    memberships,
  };
}
