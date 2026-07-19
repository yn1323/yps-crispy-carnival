import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { dateJST } from "../_lib/dateFormat";
import { managerQuery } from "../_lib/functions";
import { ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT } from "../constants";
import { getStaffLineAccount } from "../line/service";
import { deriveOrganizationBillingPolicy, getEffectiveRestrictedBillingState } from "../organizationBilling/policy";
import { collectIssuedInvitationsByOrganization } from "../organizationInvitation/lifecycle";
import { managerInvitationStateValidator, resolvePersonManagerInvitationState } from "./managerInvitationState";
import { deriveOrganizationPersonCapabilities, type ManagerRole } from "./personCapabilities";
import {
  getOrganizationBillingState,
  getOrganizationUsageSnapshot,
  getValidActiveOrganizationManagerPersonIds,
  isValidOrganizationRecoveryManager,
} from "./service";
import { organizationShopOperatingStatusValidator } from "./validators";

const userDetailValidator = v.object({
  person: v.object({
    id: v.id("organizationPeople"),
    name: v.string(),
    email: v.string(),
  }),
  isSelf: v.boolean(),
  managerRole: v.union(v.literal("active"), v.literal("readOnly"), v.literal("none")),
  hasManagerInvitation: v.boolean(),
  managerInvitationState: managerInvitationStateValidator,
  canRemoveManagerRole: v.boolean(),
  managerRoleRemovalDisabledReason: v.optional(v.string()),
  canRemove: v.boolean(),
  removeDisabledReason: v.optional(v.string()),
  canWrite: v.boolean(),
  writeDisabledReason: v.optional(v.string()),
  memberships: v.array(
    v.object({
      staffId: v.id("staffs"),
      shopId: v.id("shops"),
      shopName: v.string(),
      shopStatus: organizationShopOperatingStatusValidator,
      excludedFromShift: v.boolean(),
      canRemove: v.boolean(),
      removeDisabledReason: v.optional(v.string()),
      line: v.object({
        isLinked: v.boolean(),
        isFollowing: v.boolean(),
      }),
    }),
  ),
});

export const getUserDetail = managerQuery({
  // route paramは任意文字列になり得るため、validatorでquery errorにせずgeneric not-foundへ寄せる。
  args: { personId: v.string(), now: v.number() },
  returns: v.union(userDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const { shop, organization, organizationMember } = ctx;
    if (!shop || !organization || !organizationMember || !Number.isFinite(args.now) || args.now < 0) return null;

    const personId = ctx.db.normalizeId("organizationPeople", args.personId);
    if (!personId) return null;
    const person = await ctx.db.get(personId);
    if (!person || person.organizationId !== organization._id || person.status !== "active") return null;

    const [personMembers, staffDocs, billingState, usage, validActiveManagerPersonIds, invitationDocs] =
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
        getOrganizationBillingState(ctx, organization._id),
        getOrganizationUsageSnapshot(ctx, organization._id, args.now),
        getValidActiveOrganizationManagerPersonIds(ctx, organization._id),
        collectIssuedInvitationsByOrganization(ctx, organization._id),
      ]);
    if (personMembers.length > 1 || staffDocs.length > ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT) {
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

    const staffIdsWithFutureAssignment = new Set<Id<"staffs">>();
    const today = dateJST(args.now);
    for (const staff of staffDocs) {
      const assignments = ctx.db
        .query("shiftAssignments")
        .withIndex("by_staffId_and_date", (q) => q.eq("staffId", staff._id).gte("date", today));
      for await (const assignment of assignments) {
        const recruitment = await ctx.db.get(assignment.recruitmentId);
        if (recruitment && !recruitment.isDeleted) {
          staffIdsWithFutureAssignment.add(staff._id);
          break;
        }
      }
    }

    const membershipRows = await Promise.all(
      staffDocs
        .filter((staff) => !staff.isDeleted)
        .map(async (staff) => {
          const targetShop = await ctx.db.get(staff.shopId);
          if (!targetShop || targetShop.isDeleted || targetShop.organizationId !== organization._id) return null;
          const lineAccount = await getStaffLineAccount(ctx, staff._id);
          const validLineAccount = lineAccount?.shopId === staff.shopId ? lineAccount : null;
          const canRemove = !staffIdsWithFutureAssignment.has(staff._id);
          return {
            staff,
            view: {
              staffId: staff._id,
              shopId: targetShop._id,
              shopName: targetShop.name,
              shopStatus: targetShop.operatingStatus ?? "active",
              excludedFromShift: staff.excludedFromShift ?? false,
              canRemove,
              ...(canRemove
                ? {}
                : { removeDisabledReason: "将来のシフト割当を解除してから、この店舗から外してください。" }),
              line: {
                isLinked: Boolean(validLineAccount?.lineUserId),
                isFollowing: Boolean(validLineAccount?.following),
              },
            },
          };
        }),
    );
    if (membershipRows.some((row) => row === null)) return null;
    const validMembershipRows = membershipRows.filter((row) => row !== null);
    const seenShopIds = new Set<string>();
    for (const row of validMembershipRows) {
      if (seenShopIds.has(row.view.shopId)) return null;
      seenShopIds.add(row.view.shopId);
    }
    const memberships = validMembershipRows
      .map((row) => row.view)
      .sort((a, b) => a.shopName.localeCompare(b.shopName, "ja") || a.shopId.localeCompare(b.shopId));
    const personHasFutureAssignment = staffIdsWithFutureAssignment.size > 0;

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
    const recoveryPersonIds = recoveryManagerValidity.flatMap(([candidateId, isValid]) =>
      isValid ? [candidateId] : [],
    );
    const isActiveActor = organizationMember.status === "active";
    const isRestrictedRecovery = recoveryPersonIds.includes(organizationMember.personId);
    const isRecoveryManager = recoveryPersonIds.includes(person._id);
    const billingEmailNormalized = (organization.billingEmailNormalized ?? organization.billingEmail ?? "")
      .trim()
      .toLowerCase();
    const canWriteNormally = Boolean(isActiveActor && policy?.canWriteBusinessData);
    const personCapabilities = deriveOrganizationPersonCapabilities({
      managerRole,
      activeManagerCount: validActiveManagerPersonIds.length,
      canWriteNormally,
      policy,
      isStaff: memberships.length > 0,
      isBillingContact:
        billingEmailNormalized.length > 0 && billingEmailNormalized === person.emailNormalized.trim().toLowerCase(),
      hasFutureAssignment: personHasFutureAssignment,
      isActiveActor,
      isRestricted: restrictedState !== null,
      isRestrictedRecovery,
      isLastRecoveryManager: isRecoveryManager && recoveryPersonIds.length <= 1,
    });

    const writeDisabledReason = canWriteNormally
      ? undefined
      : !isActiveActor
        ? "閲覧のみの管理者は変更できません。"
        : !billingState
          ? "グループの契約情報を確認しているため変更できません。"
          : policy?.businessWriteBlockReason === "paymentResultPending"
            ? "支払い結果が確定してから変更できます。"
            : "契約を確認するまで変更できません。";

    return {
      person: { id: person._id, name: person.name, email: person.email },
      isSelf: person._id === organizationMember.personId,
      managerRole,
      hasManagerInvitation: activePendingInvitations.some((invitation) => invitation.targetPersonId === person._id),
      managerInvitationState,
      ...personCapabilities,
      canWrite: canWriteNormally,
      ...(writeDisabledReason ? { writeDisabledReason } : {}),
      memberships,
    };
  },
});
