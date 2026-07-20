import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { formatDateJa, formatDateTimeJa, todayJST } from "../_lib/dateFormat";
import { managerQuery } from "../_lib/functions";
import { submissionPatternValidator } from "../_lib/submissionPattern";
import {
  deriveOrganizationBillingPolicy,
  getEffectiveRestrictedBillingState,
  ORGANIZATION_PLAN_LIMITS,
  type OrganizationPersonUsageInput,
  projectOrganizationUsage,
} from "../organizationBilling/policy";
import {
  collectIssuedInvitationsByOrganization,
  collectLinkedInvitationsByOrganization,
  getOrganizationInvitationLifecycleStatus,
} from "../organizationInvitation/lifecycle";
import { getOrganizationInvitationPurpose } from "../organizationInvitation/purpose";
import {
  resolveFreeManagerExchangeEligibility,
  resolveOrganizationInvitationEligibility,
} from "../organizationInvitation/service";
import { getOrganizationDeletionEligibility } from "./deletion";
import { deriveOrganizationPersonCapabilities, type ManagerRole } from "./personCapabilities";
import { getOrganizationBillingState, organizationPersonCountsTowardPeopleLimit } from "./service";

const organizationPersonViewValidator = v.object({
  id: v.string(),
  name: v.string(),
  email: v.union(v.string(), v.null()),
  managerRole: v.union(v.literal("active"), v.literal("readOnly"), v.literal("none")),
  isStaff: v.boolean(),
  isLineConnected: v.boolean(),
  hasManagerInvitation: v.boolean(),
  shopNames: v.array(v.string()),
  shopIds: v.array(v.id("shops")),
  canRemoveManagerRole: v.boolean(),
  managerRoleRemovalDisabledReason: v.optional(v.string()),
  canRemove: v.boolean(),
  removeDisabledReason: v.optional(v.string()),
});

const managerInvitationViewValidator = v.object({
  id: v.string(),
  email: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("expired"),
    v.literal("revoked"),
    v.literal("accepted"),
    v.literal("sendFailed"),
    v.literal("limitReached"),
    v.literal("conflict"),
  ),
  statusDetail: v.optional(v.string()),
  expiresAt: v.optional(v.string()),
  canResend: v.boolean(),
  canRevoke: v.boolean(),
});

const organizationShopViewValidator = v.object({
  id: v.string(),
  name: v.string(),
  regularClosedDays: v.array(
    v.union(
      v.literal("sun"),
      v.literal("mon"),
      v.literal("tue"),
      v.literal("wed"),
      v.literal("thu"),
      v.literal("fri"),
      v.literal("sat"),
    ),
  ),
  submissionPattern: submissionPatternValidator,
  staffCount: v.number(),
  canUpdateSettings: v.boolean(),
  settingsDisabledReason: v.optional(v.string()),
  canDelete: v.boolean(),
  deleteDisabledReason: v.optional(v.string()),
});

const billingPlanValidator = v.union(v.literal("trial"), v.literal("free"), v.literal("pro"), v.literal("business"));

const billingViewValidator = v.object({
  state: v.union(
    v.literal("trial"),
    v.literal("free"),
    v.literal("pro"),
    v.literal("business"),
    v.literal("initialPaymentPending"),
    v.literal("pendingActivation"),
    v.literal("grace"),
    v.literal("restricted"),
    v.literal("scheduledFree"),
    v.literal("scheduledPro"),
    v.literal("migrationPending"),
  ),
  currentPlan: v.union(billingPlanValidator, v.null()),
  isComplimentary: v.boolean(),
  targetPlan: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("business"))),
  peopleUsage: v.object({ current: v.number(), max: v.number() }),
  shopUsage: v.object({ current: v.number(), max: v.number() }),
  nextEvent: v.optional(v.object({ label: v.string(), date: v.string() })),
  blockedReason: v.optional(v.string()),
  paymentMethodLabel: v.optional(v.string()),
  billingEmail: v.string(),
  previousPlan: v.optional(billingPlanValidator),
  invoices: v.array(
    v.object({
      id: v.string(),
      issuedAt: v.string(),
      status: v.union(v.literal("paid"), v.literal("open"), v.literal("void")),
    }),
  ),
  canManagePlan: v.boolean(),
  canUpdatePaymentMethod: v.boolean(),
  canUpdateBillingEmail: v.boolean(),
  canScheduleFree: v.boolean(),
  managePlanDisabledReason: v.optional(v.string()),
  paymentMethodDisabledReason: v.optional(v.string()),
  billingEmailDisabledReason: v.optional(v.string()),
});

const organizationSettingsValidator = v.object({
  organizationId: v.optional(v.id("organizations")),
  organizationUpdatedAt: v.optional(v.number()),
  organizationName: v.string(),
  people: v.array(organizationPersonViewValidator),
  managerInvitations: v.array(managerInvitationViewValidator),
  shops: v.array(organizationShopViewValidator),
  billing: billingViewValidator,
  canInviteManager: v.boolean(),
  managerInvitationMode: v.union(v.literal("addition"), v.literal("freeManagerExchange")),
  freeManagerExchangeCandidates: v.array(v.object({ id: v.string(), name: v.string(), email: v.string() })),
  inviteManagerDisabledReason: v.optional(v.string()),
  canUpdateOrganizationName: v.boolean(),
  updateOrganizationNameDisabledReason: v.optional(v.string()),
  canAddShop: v.boolean(),
  addShopDisabledReason: v.optional(v.string()),
  canDeleteOrganization: v.boolean(),
  deleteOrganizationDisabledReason: v.optional(v.string()),
});

type BillingPlan = "trial" | "free" | "pro" | "business";
type BillingView = {
  state:
    | BillingPlan
    | "initialPaymentPending"
    | "pendingActivation"
    | "grace"
    | "restricted"
    | "scheduledFree"
    | "scheduledPro"
    | "migrationPending";
  currentPlan: BillingPlan | null;
  isComplimentary: boolean;
  targetPlan?: Exclude<BillingPlan, "trial">;
  peopleUsage: { current: number; max: number };
  shopUsage: { current: number; max: number };
  nextEvent?: { label: string; date: string };
  blockedReason?: string;
  paymentMethodLabel?: string;
  billingEmail: string;
  previousPlan?: BillingPlan;
  invoices: Array<{ id: string; issuedAt: string; status: "paid" | "open" | "void" }>;
  canManagePlan: boolean;
  canUpdatePaymentMethod: boolean;
  canUpdateBillingEmail: boolean;
  canScheduleFree: boolean;
  managePlanDisabledReason?: string;
  paymentMethodDisabledReason?: string;
  billingEmailDisabledReason?: string;
};

function legacyMigrationPendingSettings(user: Doc<"users">, shop: Doc<"shops">) {
  const migrationReason = "グループ単位の設定を移行しています。完了するまで既存データを閲覧できます。";
  return {
    organizationName: shop.name,
    people: [
      {
        id: user._id,
        name: user.name,
        email: user.email,
        managerRole: "active" as const,
        isStaff: false,
        isLineConnected: false,
        hasManagerInvitation: false,
        shopNames: [],
        shopIds: [],
        canRemoveManagerRole: false,
        managerRoleRemovalDisabledReason: migrationReason,
        canRemove: false,
        removeDisabledReason: migrationReason,
      },
    ],
    managerInvitations: [],
    shops: [
      {
        id: shop._id,
        name: shop.name,
        regularClosedDays: shop.regularClosedDays,
        submissionPattern: shop.submissionPattern,
        staffCount: 0,
        canUpdateSettings: false,
        settingsDisabledReason: migrationReason,
        canDelete: false,
        deleteDisabledReason: migrationReason,
      },
    ],
    billing: {
      state: "migrationPending" as const,
      currentPlan: null,
      isComplimentary: false,
      peopleUsage: { current: 1, max: 0 },
      shopUsage: { current: 1, max: 0 },
      blockedReason: "グループ単位のプラン設定を移行しています。完了後に利用状態を再確認します。",
      billingEmail: user.email,
      invoices: [],
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canUpdateBillingEmail: false,
      canScheduleFree: false,
      managePlanDisabledReason: "設定の移行が完了するまでお待ちください。",
      paymentMethodDisabledReason: "設定の移行が完了するまでお待ちください。",
      billingEmailDisabledReason: "設定の移行が完了するまでお待ちください。",
    },
    canInviteManager: false,
    managerInvitationMode: "addition" as const,
    freeManagerExchangeCandidates: [],
    inviteManagerDisabledReason: migrationReason,
    canUpdateOrganizationName: false,
    updateOrganizationNameDisabledReason: migrationReason,
    canAddShop: false,
    addShopDisabledReason: migrationReason,
    canDeleteOrganization: false,
    deleteOrganizationDisabledReason: migrationReason,
  };
}

function restrictedBlockedReason(state: Extract<Doc<"organizationBillingStates">["state"], { kind: "restricted" }>) {
  switch (state.reason) {
    case "trialFreeConditionsNotMet":
    case "freeConditionsNotMet":
      return "Freeの利用人数または店舗数を超えています。ユーザーまたは店舗を削除してから再確認してください。";
    case "paymentGraceExpired":
      return "支払い猶予が終了しています。支払い方法を更新するか、有料プランを再開してください。";
    case "paymentActivationFailed":
      return "有料プランの支払いを確認できませんでした。有料プランを再契約してください。";
    case "unexpectedCancellation":
      return "契約状態を確認できません。有料プランを再契約してください。";
  }
}

export const getSettings = managerQuery({
  args: {},
  returns: v.union(organizationSettingsValidator, v.null()),
  handler: async (ctx) => {
    if (!ctx.user || !ctx.shop) return null;
    if (!ctx.organization) return legacyMigrationPendingSettings(ctx.user, ctx.shop);

    const organization = ctx.organization;
    const now = Date.now();
    const [
      peopleDocs,
      activeMembers,
      readOnlyMembers,
      shops,
      pendingInvitations,
      acceptedInvitations,
      revokedInvitations,
      expiredInvitations,
      billingState,
    ] = await Promise.all([
      ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", organization._id))
        .collect(),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", organization._id).eq("status", "active"),
        )
        .collect(),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", organization._id).eq("status", "readOnly"),
        )
        .collect(),
      ctx.db
        .query("shops")
        .withIndex("by_organizationId_and_isDeleted", (q) =>
          q.eq("organizationId", organization._id).eq("isDeleted", false),
        )
        .collect(),
      collectIssuedInvitationsByOrganization(ctx, organization._id),
      collectLinkedInvitationsByOrganization(ctx, organization._id),
      ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", organization._id).eq("status", "revoked"),
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", organization._id).eq("status", "expired"),
        )
        .order("desc")
        .take(100),
      getOrganizationBillingState(ctx, organization._id),
    ]);
    const people = peopleDocs.filter((person) => person.status === "active");
    const historicalInvitations = [...acceptedInvitations, ...revokedInvitations, ...expiredInvitations]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 100);
    const invitationDocs = [...pendingInvitations, ...historicalInvitations].sort((a, b) => b.updatedAt - a.updatedAt);

    const staffDocs = (
      await Promise.all(
        shops.map(async (shop) =>
          ctx.db
            .query("staffs")
            .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
            .collect(),
        ),
      )
    ).flat();
    const shopById = new Map(shops.map((shop) => [shop._id, shop]));
    const memberDocs = [...activeMembers, ...readOnlyMembers];
    const memberUsers = await Promise.all(memberDocs.map(async (member) => ctx.db.get(member.userId)));
    const memberUserById = new Map(memberUsers.filter((user) => user !== null).map((user) => [user._id, user]));
    const membersByPersonId = new Map<Id<"organizationPeople">, Doc<"organizationMembers">[]>();
    for (const member of memberDocs) {
      const current = membersByPersonId.get(member.personId) ?? [];
      current.push(member);
      membersByPersonId.set(member.personId, current);
    }
    const staffRowsByPersonId = new Map<Id<"organizationPeople">, Doc<"staffs">[]>();
    for (const staff of staffDocs) {
      if (!staff.organizationPersonId) continue;
      const current = staffRowsByPersonId.get(staff.organizationPersonId) ?? [];
      current.push(staff);
      staffRowsByPersonId.set(staff.organizationPersonId, current);
    }
    const lineConnectedStaffIds = new Set<Id<"staffs">>();
    await Promise.all(
      staffDocs.map(async (staff) => {
        const accounts = await ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staff._id))
          .collect();
        if (accounts.some((account) => !account.isDeleted && account.following && account.shopId === staff.shopId)) {
          lineConnectedStaffIds.add(staff._id);
        }
      }),
    );

    const managerRoleByPersonId = new Map<Id<"organizationPeople">, ManagerRole>();
    for (const person of people) {
      const members = membersByPersonId.get(person._id) ?? [];
      const member = members.length === 1 ? members[0] : null;
      const memberUser = member ? memberUserById.get(member.userId) : null;
      const memberMatchesPerson = Boolean(
        member && person.userId && member.userId === person.userId && memberUser && !memberUser.isDeleted,
      );
      managerRoleByPersonId.set(
        person._id,
        memberMatchesPerson && member?.status === "active"
          ? "active"
          : memberMatchesPerson && member?.status === "readOnly"
            ? "readOnly"
            : "none",
      );
    }

    // 店舗所属がなくなってもグループの利用人数に含まれる人物は、削除済みを含むstaff履歴から判定する。
    const staffRolePersonIds = new Set(
      (
        await Promise.all(
          people.map(async (person) => {
            const staff = await ctx.db
              .query("staffs")
              .withIndex("by_organizationId_and_organizationPersonId", (q) =>
                q.eq("organizationId", organization._id).eq("organizationPersonId", person._id),
              )
              .first();
            return staff ? person._id : null;
          }),
        )
      ).filter((personId): personId is Id<"organizationPeople"> => personId !== null),
    );

    const usageInputs: OrganizationPersonUsageInput[] = people.map((person) => ({
      personId: person._id,
      isActiveInOrganization: true,
      isStaff: staffRolePersonIds.has(person._id),
      managerRole: managerRoleByPersonId.get(person._id) ?? "none",
    }));
    const reservedPersonCount = pendingInvitations.filter(
      (invitation) => invitation.reservedSeat && invitation.expiresAt > now,
    ).length;
    const usage = projectOrganizationUsage({ people: usageInputs, reservedPersonCount });
    const policy = billingState ? deriveOrganizationBillingPolicy(billingState.state) : null;
    const isComplimentary = billingState?.state.kind === "complimentary";
    const restrictedState = billingState ? getEffectiveRestrictedBillingState(billingState.state) : null;
    const isActiveActor = ctx.organizationMember?.status === "active";
    const isRestrictedRecovery = Boolean(
      restrictedState &&
        isActiveActor &&
        ctx.organizationMember &&
        restrictedState.recoveryManagerPersonIds.includes(ctx.organizationMember.personId),
    );
    const canWriteNormally = Boolean(isActiveActor && policy?.canWriteBusinessData);
    const usageLimits = restrictedState ? ORGANIZATION_PLAN_LIMITS.free : policy?.limits;

    const futureAssignmentPersonIds = new Set<Id<"organizationPeople">>();
    const today = todayJST();
    for (const [personId, staffRows] of staffRowsByPersonId) {
      let hasFutureAssignment = false;
      for (const staff of staffRows) {
        const assignments = ctx.db
          .query("shiftAssignments")
          .withIndex("by_staffId_and_date", (q) => q.eq("staffId", staff._id).gte("date", today));
        for await (const assignment of assignments) {
          const recruitment = await ctx.db.get(assignment.recruitmentId);
          if (!recruitment || recruitment.isDeleted || !shopById.has(recruitment.shopId)) continue;
          hasFutureAssignment = true;
          break;
        }
        if (hasFutureAssignment) break;
      }
      if (hasFutureAssignment) futureAssignmentPersonIds.add(personId);
    }

    const recoveryPersonIds = restrictedState
      ? restrictedState.recoveryManagerPersonIds.filter((personId) => people.some((person) => person._id === personId))
      : [];
    const billingEmailNormalized = (organization.billingEmailNormalized ?? organization.billingEmail ?? "")
      .trim()
      .toLowerCase();
    const activeManagerCount = usage.activeManagerCount;
    const pendingManagerInvitationCount = pendingInvitations.filter(
      (invitation) => invitation.expiresAt > now && getOrganizationInvitationPurpose(invitation) === "managerAddition",
    ).length;
    const projectedActiveManagerCount = activeManagerCount + pendingManagerInvitationCount;
    const canInviteManagerAddition = Boolean(
      isActiveActor &&
        policy?.canUsePaidFeatures &&
        policy.limits &&
        projectedActiveManagerCount < policy.limits.maxActiveManagers,
    );
    const hasFreeEntitlement = policy?.entitlementPlan === "free";
    const invitationInviterMemberId = ctx.organizationMember?._id;
    const freeManagerExchangeEligibilities =
      hasFreeEntitlement && invitationInviterMemberId
        ? await Promise.all(
            people.map(
              async (person) =>
                await resolveFreeManagerExchangeEligibility(ctx, {
                  organizationId: organization._id,
                  inviterMemberId: invitationInviterMemberId,
                  emailNormalized: person.emailNormalized,
                }),
            ),
          )
        : [];
    const freeManagerExchangeCandidates = freeManagerExchangeEligibilities.flatMap((eligibility) =>
      eligibility
        ? [
            {
              id: eligibility.targetPerson._id,
              name: eligibility.targetPerson.name,
              email: eligibility.targetPerson.email,
            },
          ]
        : [],
    );
    const freeManagerExchangeCandidateEmails = new Set(
      freeManagerExchangeEligibilities.flatMap((eligibility) =>
        eligibility ? [eligibility.targetPerson.emailNormalized] : [],
      ),
    );
    const activeFreeManagerExchangeInvitations = pendingInvitations.filter(
      (invitation) =>
        invitation.expiresAt > now && getOrganizationInvitationPurpose(invitation) === "freeManagerExchange",
    );
    const invitedPersonIds = new Set(
      pendingInvitations.flatMap((invitation) =>
        invitation.expiresAt > now && invitation.targetPersonId ? [invitation.targetPersonId] : [],
      ),
    );
    const canInviteFreeManagerExchange = Boolean(
      isActiveActor &&
        hasFreeEntitlement &&
        freeManagerExchangeCandidates.length > 0 &&
        activeFreeManagerExchangeInvitations.length === 0,
    );
    const managerInvitationMode = hasFreeEntitlement ? ("freeManagerExchange" as const) : ("addition" as const);
    const canInviteManager =
      managerInvitationMode === "freeManagerExchange" ? canInviteFreeManagerExchange : canInviteManagerAddition;
    const canRevokeInvitation = Boolean(isActiveActor && policy?.canWriteBusinessData);
    const managerInvitations = await Promise.all(
      invitationDocs.map(async (invitation) => {
        const lifecycleStatus = getOrganizationInvitationLifecycleStatus(invitation);
        const isExpired =
          lifecycleStatus === "expired" || (lifecycleStatus === "issued" && invitation.expiresAt <= now);
        const currentVersionOutbox =
          lifecycleStatus === "issued"
            ? await ctx.db
                .query("notificationOutbox")
                .withIndex("by_organizationInvitationId", (q) => q.eq("organizationInvitationId", invitation._id))
                .filter((q) => q.eq(q.field("organizationInvitationVersion"), invitation.version))
                .order("desc")
                .first()
            : null;
        const hasSuccessfulCurrentVersionEnqueue =
          currentVersionOutbox?.status === "pending" ||
          currentVersionOutbox?.status === "processing" ||
          currentVersionOutbox?.status === "sent";
        const currentVersionEnqueueFailure =
          lifecycleStatus === "issued" &&
          currentVersionOutbox?.status !== "failed" &&
          !hasSuccessfulCurrentVersionEnqueue
            ? await ctx.db
                .query("notificationDeliveryEvents")
                .withIndex("by_organizationInvitationId_createdAt", (q) =>
                  q.eq("organizationInvitationId", invitation._id),
                )
                .filter((q) =>
                  q.and(
                    q.eq(q.field("eventType"), "enqueue_failed"),
                    q.eq(q.field("organizationInvitationVersion"), invitation.version),
                  ),
                )
                .order("desc")
                .first()
            : null;
        const isSendFailed = Boolean(
          lifecycleStatus === "issued" &&
            (currentVersionOutbox?.status === "failed" ||
              (currentVersionEnqueueFailure && !hasSuccessfulCurrentVersionEnqueue)),
        );
        const purpose = getOrganizationInvitationPurpose(invitation);
        const canRetryStatus = lifecycleStatus === "issued" || lifecycleStatus === "expired";
        const eligibility = canRetryStatus ? await resolveOrganizationInvitationEligibility(ctx, invitation) : null;
        const hasOtherPendingFreeExchange = activeFreeManagerExchangeInvitations.some(
          (candidate) => candidate._id !== invitation._id,
        );
        const targetPerson = invitation.targetPersonId ? await ctx.db.get(invitation.targetPersonId) : null;
        const targetPersonMismatch = Boolean(
          invitation.targetPersonId &&
            (!targetPerson ||
              targetPerson.organizationId !== organization._id ||
              targetPerson.emailNormalized !== invitation.emailNormalized),
        );
        const matchingPeople = invitation.targetPersonId
          ? targetPerson && !targetPersonMismatch
            ? [targetPerson]
            : []
          : peopleDocs.filter((person) => person.emailNormalized === invitation.emailNormalized);
        const existingPerson =
          matchingPeople.length === 1 && matchingPeople[0].status === "active" ? matchingPeople[0] : null;
        const existingPersonCounts = existingPerson
          ? await organizationPersonCountsTowardPeopleLimit(ctx, organization._id, existingPerson._id)
          : false;
        const personReservationAlreadyCounted =
          lifecycleStatus === "issued" && invitation.expiresAt > now && invitation.reservedSeat;
        const canFitResentPerson = Boolean(
          policy?.limits &&
            (existingPersonCounts ||
              usage.projectedPeopleCount + (personReservationAlreadyCounted ? 0 : 1) <= policy.limits.maxPeople),
        );
        const managerReservationAlreadyCounted =
          lifecycleStatus === "issued" && invitation.expiresAt > now && purpose === "managerAddition";
        const canFitResentManager = Boolean(
          policy?.limits &&
            projectedActiveManagerCount - (managerReservationAlreadyCounted ? 1 : 0) + 1 <=
              policy.limits.maxActiveManagers,
        );
        const hasTargetConflict = Boolean(
          canRetryStatus &&
            (targetPersonMismatch ||
              matchingPeople.length > 1 ||
              matchingPeople[0]?.status === "removed" ||
              (existingPerson && managerRoleByPersonId.get(existingPerson._id) === "active") ||
              (purpose === "freeManagerExchange" &&
                !freeManagerExchangeCandidateEmails.has(invitation.emailNormalized)) ||
              (!eligibility && !isExpired)),
        );
        const hasCapacityConflict = Boolean(
          canRetryStatus &&
            !hasTargetConflict &&
            purpose === "managerAddition" &&
            (!canFitResentManager || !canFitResentPerson),
        );
        const canResend = Boolean(
          canRevokeInvitation &&
            canRetryStatus &&
            eligibility &&
            !hasTargetConflict &&
            (purpose === "freeManagerExchange"
              ? !hasOtherPendingFreeExchange && freeManagerExchangeCandidateEmails.has(invitation.emailNormalized)
              : canFitResentManager &&
                matchingPeople.length <= 1 &&
                (!existingPerson || managerRoleByPersonId.get(existingPerson._id) !== "active") &&
                canFitResentPerson),
        );
        const status = isExpired
          ? ("expired" as const)
          : hasTargetConflict
            ? ("conflict" as const)
            : hasCapacityConflict
              ? ("limitReached" as const)
              : isSendFailed
                ? ("sendFailed" as const)
                : lifecycleStatus === "issued"
                  ? ("pending" as const)
                  : lifecycleStatus === "linked"
                    ? ("accepted" as const)
                    : lifecycleStatus;
        const canRevoke = Boolean(canRevokeInvitation && !isExpired && lifecycleStatus === "issued");
        const statusDetail =
          status === "expired"
            ? canResend
              ? "有効期限が切れました。再送すると新しいURLを発行します。"
              : "この招待は再送できません。権限、利用者、契約状態を確認してください。"
            : status === "sendFailed"
              ? canResend
                ? "ログイン案内を送信できませんでした。連絡先を確認して再送してください。"
                : "この招待は再送できません。権限、利用者、契約状態を確認してください。"
              : status === "limitReached"
                ? "現在のプラン上限に達しているため、アカウントを連携できません。利用状況またはプランを確認してください。"
                : status === "conflict"
                  ? canRevoke
                    ? "招待後に利用者または契約の状態が変わりました。この招待を取り消して内容を確認してください。"
                    : "招待後に利用者または契約の状態が変わりました。権限、利用者、契約状態を確認してください。"
                  : status === "pending" && purpose === "freeManagerExchange"
                    ? "アカウント連携が完了するまでは、現在の管理者が操作を継続します。"
                    : undefined;
        return {
          id: invitation._id,
          email: invitation.email,
          status,
          ...(statusDetail ? { statusDetail } : {}),
          ...(lifecycleStatus === "issued" ? { expiresAt: formatDateTimeJa(invitation.expiresAt) } : {}),
          canResend,
          canRevoke,
        };
      }),
    );
    const peopleView = people
      .filter(
        (person) => staffRolePersonIds.has(person._id) || (managerRoleByPersonId.get(person._id) ?? "none") !== "none",
      )
      .map((person) => {
        const managerRole = managerRoleByPersonId.get(person._id) ?? "none";
        const staffRows = staffRowsByPersonId.get(person._id) ?? [];
        const isStaff = staffRows.length > 0;
        const isLineConnected = staffRows.some((staff) => lineConnectedStaffIds.has(staff._id));
        const hasManagerInvitation = invitedPersonIds.has(person._id);
        const isRecoveryManager = Boolean(restrictedState && recoveryPersonIds.includes(person._id));
        const isLastRecoveryManager = isRecoveryManager && recoveryPersonIds.length <= 1;
        const isBillingContact =
          billingEmailNormalized.length > 0 && billingEmailNormalized === person.emailNormalized.trim().toLowerCase();
        const hasFutureAssignment = futureAssignmentPersonIds.has(person._id);
        const capabilities = deriveOrganizationPersonCapabilities({
          managerRole,
          activeManagerCount,
          canWriteNormally,
          policy,
          isStaff,
          isBillingContact,
          hasFutureAssignment,
          isActiveActor,
          isRestricted: restrictedState !== null,
          isRestrictedRecovery,
          isLastRecoveryManager,
        });
        const assignedShops = staffRows
          .flatMap((staff) => {
            const shop = shopById.get(staff.shopId);
            return shop ? [shop] : [];
          })
          .filter((shop, index, assignedShops) => assignedShops.findIndex(({ _id }) => _id === shop._id) === index)
          .sort((a, b) => a.name.localeCompare(b.name, "ja") || String(a._id).localeCompare(String(b._id)));
        const shopNames = assignedShops
          .map((shop) => shop.name)
          .filter((name, index, names) => names.indexOf(name) === index);
        const shopIds = assignedShops.map((shop) => shop._id);
        return {
          id: person._id,
          name: person.name,
          email: person.email || null,
          managerRole,
          isStaff,
          isLineConnected,
          hasManagerInvitation,
          shopNames,
          shopIds,
          ...capabilities,
        };
      })
      .sort(
        (a, b) =>
          Number(b.managerRole === "active") - Number(a.managerRole === "active") ||
          Number(b.managerRole === "readOnly") - Number(a.managerRole === "readOnly") ||
          a.name.localeCompare(b.name, "ja"),
      );

    const staffCountByShopId = new Map<Id<"shops">, number>();
    for (const staff of staffDocs) {
      staffCountByShopId.set(staff.shopId, (staffCountByShopId.get(staff.shopId) ?? 0) + 1);
    }
    const canDeleteShop = Boolean(shops.length > 1 && (restrictedState ? isRestrictedRecovery : canWriteNormally));
    const deleteShopDisabledReason = canDeleteShop
      ? undefined
      : shops.length <= 1
        ? "グループには少なくとも1店舗が必要です。"
        : !isActiveActor
          ? "閲覧のみの管理者は店舗を削除できません。"
          : restrictedState
            ? "契約の復旧担当者だけが店舗を削除できます。"
            : "現在の契約状態では店舗を削除できません。";
    const shopsView = shops
      .map((shop) => {
        const canUpdateSettings = Boolean(canWriteNormally && shop.operatingStatus === "active");
        const settingsDisabledReason = canUpdateSettings
          ? undefined
          : shop.operatingStatus !== "active"
            ? "利用できない状態の店舗設定は変更できません。"
            : !billingState
              ? "グループ単位の設定を移行しています。完了までお待ちください。"
              : !isActiveActor
                ? "閲覧のみの管理者は店舗設定を変更できません。"
                : restrictedState
                  ? "契約制限中は店舗設定を変更できません。"
                  : "支払い結果が確定してから店舗設定を変更できます。";
        return {
          id: shop._id,
          name: shop.name,
          regularClosedDays: shop.regularClosedDays,
          submissionPattern: shop.submissionPattern,
          staffCount: staffCountByShopId.get(shop._id) ?? 0,
          canUpdateSettings,
          ...(settingsDisabledReason ? { settingsDisabledReason } : {}),
          canDelete: canDeleteShop,
          ...(deleteShopDisabledReason ? { deleteDisabledReason: deleteShopDisabledReason } : {}),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));

    const billingCapabilities = {
      canManagePlan: Boolean(
        !isComplimentary &&
          (isRestrictedRecovery ||
            (isActiveActor &&
              billingState &&
              !restrictedState &&
              billingState.state.kind !== "initialPaymentPending" &&
              billingState.state.kind !== "pendingActivation")),
      ),
      canUpdatePaymentMethod: Boolean(
        !isComplimentary &&
          (isRestrictedRecovery ||
            (isActiveActor &&
              billingState &&
              !restrictedState &&
              (billingState.state.kind === "trial" ||
                billingState.state.kind === "initialPaymentPending" ||
                billingState.state.kind === "scheduledChange" ||
                billingState.state.kind === "grace" ||
                (billingState.state.kind === "active" && billingState.state.plan !== "free")))),
      ),
      canUpdateBillingEmail: Boolean(
        !isComplimentary &&
          (isRestrictedRecovery ||
            (isActiveActor &&
              billingState &&
              !restrictedState &&
              (billingState.state.kind !== "pendingActivation" || billingState.state.fallback === "free"))),
      ),
      canScheduleFree: Boolean(
        !isComplimentary &&
          (isRestrictedRecovery ||
            (isActiveActor &&
              billingState &&
              !restrictedState &&
              (billingState.state.kind === "trial" ||
                billingState.state.kind === "scheduledChange" ||
                billingState.state.kind === "grace" ||
                (billingState.state.kind === "active" && billingState.state.plan !== "free")))),
      ),
    };
    const billingBase = {
      peopleUsage: { current: usage.currentPeopleCount, max: usageLimits?.maxPeople ?? 0 },
      shopUsage: { current: shops.length, max: usageLimits?.maxActiveShops ?? 0 },
      billingEmail: organization.billingEmail ?? "",
      invoices: [],
      isComplimentary,
      ...billingCapabilities,
    };
    const accessDisabledReason =
      !isActiveActor && !isRestrictedRecovery
        ? restrictedState
          ? "契約の復旧担当者だけがこの操作を行えます。"
          : "閲覧のみの管理者はこの操作を行えません。"
        : undefined;
    const managePlanDisabledReason =
      billingCapabilities.canManagePlan || isComplimentary
        ? undefined
        : !billingState
          ? "設定の移行が完了するまでお待ちください。"
          : (accessDisabledReason ??
            (billingState.state.kind === "initialPaymentPending"
              ? "初回支払いの結果を確認中のため、プランを変更できません。"
              : billingState.state.kind === "pendingActivation"
                ? "支払い結果を確認中のため、別のプラン変更はできません。"
                : "現在の契約状態ではプランを変更できません。"));
    const paymentMethodDisabledReason =
      billingCapabilities.canUpdatePaymentMethod || isComplimentary
        ? undefined
        : !billingState
          ? "設定の移行が完了するまでお待ちください。"
          : (accessDisabledReason ??
            (billingState.state.kind === "active" && billingState.state.plan === "free"
              ? "Freeでは支払い方法の登録はありません。有料プランを契約するときに登録します。"
              : billingState.state.kind === "pendingActivation"
                ? "支払い結果を確認中です。確定後に支払い方法を変更できます。"
                : "現在の契約状態では支払い方法を変更できません。"));
    const billingEmailDisabledReason =
      billingCapabilities.canUpdateBillingEmail || isComplimentary
        ? undefined
        : !billingState
          ? "設定の移行が完了するまでお待ちください。"
          : (accessDisabledReason ?? "現在の契約状態では請求先メールアドレスを変更できません。");
    const billingCapabilityReasons = {
      ...(managePlanDisabledReason ? { managePlanDisabledReason } : {}),
      ...(paymentMethodDisabledReason ? { paymentMethodDisabledReason } : {}),
      ...(billingEmailDisabledReason ? { billingEmailDisabledReason } : {}),
    };

    let billing: BillingView;
    if (!billingState) {
      billing = {
        ...billingBase,
        ...billingCapabilityReasons,
        state: "migrationPending",
        currentPlan: null,
        blockedReason: "グループ単位のプラン設定を移行しています。完了後に利用状態を再確認します。",
      };
    } else {
      const state = billingState.state;
      switch (state.kind) {
        case "trial":
          billing = {
            ...billingBase,
            ...billingCapabilityReasons,
            state: "trial",
            currentPlan: "trial",
            // trialEndsAt は翌月末日の翌日 0:00 JST を表す排他的な境界。
            // 画面では無料体験を利用できる最終日を表示する。
            nextEvent: { label: "無料体験終了", date: formatDateJa(state.trialEndsAt - 1) },
          };
          break;
        case "initialPaymentPending":
          billing = {
            ...billingBase,
            ...billingCapabilityReasons,
            state: "initialPaymentPending",
            currentPlan: state.plan,
            nextEvent: { label: "支払い結果", date: "確認中" },
          };
          break;
        case "pendingActivation":
          billing = {
            ...billingBase,
            ...billingCapabilityReasons,
            state: "pendingActivation",
            currentPlan: state.fallback === "free" ? "free" : null,
            targetPlan: state.plan,
            blockedReason:
              state.fallback === "free"
                ? "有料プランの支払い結果を確認中です。Freeの基本機能は引き続き利用できます。"
                : restrictedState
                  ? restrictedBlockedReason(restrictedState)
                  : "契約制限を維持したまま支払い結果を確認しています。",
            nextEvent: { label: "支払い結果", date: "確認中" },
          };
          break;
        case "active":
          billing = {
            ...billingBase,
            ...billingCapabilityReasons,
            state: state.plan,
            currentPlan: state.plan,
          };
          break;
        case "complimentary":
          billing = {
            ...billingBase,
            ...billingCapabilityReasons,
            state: "business",
            currentPlan: "business",
          };
          break;
        case "scheduledChange":
          billing = {
            ...billingBase,
            ...billingCapabilityReasons,
            state: state.targetPlan === "free" ? "scheduledFree" : "scheduledPro",
            currentPlan: state.currentPlan,
            targetPlan: state.targetPlan,
            nextEvent: {
              label: state.targetPlan === "free" ? "Free適用予定日" : "Pro適用予定日",
              date: formatDateJa(state.effectiveAt),
            },
          };
          break;
        case "grace":
          billing = {
            ...billingBase,
            ...billingCapabilityReasons,
            state: "grace",
            currentPlan: state.plan,
            blockedReason: "支払い方法を更新しないまま期限を過ぎると、契約制限中へ移行します。",
            nextEvent: { label: "支払い猶予期限", date: formatDateTimeJa(state.endsAt) },
          };
          break;
        case "restricted":
          billing = {
            ...billingBase,
            ...billingCapabilityReasons,
            state: "restricted",
            currentPlan: null,
            ...(state.previousPlan ? { previousPlan: state.previousPlan } : {}),
            blockedReason: restrictedBlockedReason(state),
          };
          break;
      }
    }

    const inviteManagerDisabledReason = canInviteManager
      ? undefined
      : !billingState
        ? "グループ単位のプラン設定を移行しています。完了までお待ちください。"
        : !isActiveActor
          ? "閲覧のみの管理者は管理者を招待できません。"
          : restrictedState
            ? "契約制限中は管理者を招待できません。"
            : managerInvitationMode === "freeManagerExchange" && activeFreeManagerExchangeInvitations.length > 0
              ? "次の管理者のアカウント連携を待っています。連携完了までは現在の管理者が操作を継続します。"
              : managerInvitationMode === "freeManagerExchange"
                ? "Freeでは、グループ内の既存スタッフとの管理者交代だけを利用できます。"
                : policy?.paidFeatureBlockReason === "freePlan"
                  ? "Freeでは管理者を追加できません。有料プランを選択してください。"
                  : policy?.paidFeatureBlockReason === "paymentResultPending"
                    ? "支払い結果が確定してから管理者を招待できます。"
                    : "管理者と招待中の管理者は、グループ全体で5名までです。";
    const canAddShop = Boolean(
      isActiveActor && policy?.canUsePaidFeatures && policy.limits && shops.length < policy.limits.maxActiveShops,
    );
    const addShopDisabledReason = canAddShop
      ? undefined
      : !billingState
        ? "グループ単位のプラン設定を移行しています。完了までお待ちください。"
        : !isActiveActor
          ? "閲覧のみの管理者は店舗を追加できません。"
          : restrictedState
            ? "契約制限中は店舗を追加できません。"
            : policy?.paidFeatureBlockReason === "freePlan"
              ? "Freeでは店舗を追加できません。有料プランを選択してください。"
              : policy?.paidFeatureBlockReason === "paymentResultPending"
                ? "支払い結果が確定してから店舗を追加できます。"
                : "店舗はグループごとに5件まで登録できます。";
    const canUpdateOrganizationName = isActiveActor;
    const updateOrganizationNameDisabledReason = canUpdateOrganizationName
      ? undefined
      : !ctx.organizationMember
        ? "グループ単位の設定を移行しています。完了までお待ちください。"
        : "閲覧のみの管理者はグループ名を変更できません。";

    const deletionEligibility = ctx.organizationMember
      ? await getOrganizationDeletionEligibility(ctx, {
          organizationId: organization._id,
          actorMemberId: ctx.organizationMember._id,
          billingState,
        })
      : {
          canDelete: false as const,
          reason: "グループ単位の設定を移行しています。完了までお待ちください。",
        };

    return {
      organizationId: organization._id,
      organizationUpdatedAt: organization.updatedAt,
      organizationName: organization.name,
      people: peopleView,
      managerInvitations,
      shops: shopsView,
      billing,
      canInviteManager,
      managerInvitationMode,
      freeManagerExchangeCandidates,
      ...(inviteManagerDisabledReason ? { inviteManagerDisabledReason } : {}),
      canUpdateOrganizationName,
      ...(updateOrganizationNameDisabledReason ? { updateOrganizationNameDisabledReason } : {}),
      canAddShop,
      ...(addShopDisabledReason ? { addShopDisabledReason } : {}),
      canDeleteOrganization: deletionEligibility.canDelete,
      ...(!deletionEligibility.canDelete ? { deleteOrganizationDisabledReason: deletionEligibility.reason } : {}),
    };
  },
});
