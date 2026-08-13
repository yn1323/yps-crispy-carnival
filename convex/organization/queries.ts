import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { formatDateJa, formatDateTimeJa } from "../_lib/dateFormat";
import { managerQuery } from "../_lib/functions";
import { submissionPatternValidator } from "../_lib/submissionPattern";
import { normalizeEmail, requiredEmailSchema } from "../_lib/validation";
import {
  deriveOrganizationBillingPolicy,
  getEffectiveRestrictedBillingState,
  ORGANIZATION_PLAN_LIMITS,
  type OrganizationPersonUsageInput,
  projectOrganizationUsage,
  resolveRestrictedLimitPlan,
} from "../organizationBilling/policy";
import {
  collectIssuedInvitationsByOrganization,
  collectLinkedInvitationsByOrganization,
  getOrganizationInvitationLifecycleStatus,
  readActiveIssuedInvitationsByOrganization,
} from "../organizationInvitation/lifecycle";
import { getOrganizationInvitationPurpose } from "../organizationInvitation/purpose";
import {
  resolveFreeManagerExchangeEligibility,
  resolveOrganizationInvitationEligibility,
} from "../organizationInvitation/service";
import { getStripeBillingConfiguration } from "../organizationStripe/config";
import { getOrganizationCreationAvailability, type OrganizationCreationAvailability } from "../setup/service";
import { isOrganizationBillingContact } from "./billingContact";
import { getOrganizationDeletionEligibility } from "./deletion";
import { deriveOrganizationPersonCapabilities, type ManagerRole } from "./personCapabilities";
import {
  getOrganizationBillingState,
  isValidOrganizationRecoveryManager,
  organizationPersonCountsTowardPeopleLimit,
} from "./service";
import { organizationShopOperatingStatus } from "./shopMembershipChange";

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
    v.literal("scheduledChange"),
    v.literal("migrationPending"),
  ),
  currentPlan: v.union(billingPlanValidator, v.null()),
  isComplimentary: v.boolean(),
  hasTrialContinuation: v.boolean(),
  trialEndsAt: v.optional(v.number()),
  stripeBillingAvailable: v.boolean(),
  hasStripeCustomer: v.boolean(),
  targetPlan: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("business"))),
  restrictAtPeriodEnd: v.optional(v.literal(true)),
  limitPlan: v.optional(v.union(v.literal("free"), v.literal("pro"))),
  peopleUsage: v.object({ current: v.number(), max: v.number(), pendingInvitations: v.number() }),
  shopUsage: v.object({ current: v.number(), max: v.number(), pendingInvitations: v.number() }),
  managerUsage: v.object({ current: v.number(), max: v.number(), pendingInvitations: v.number() }),
  requiredReductions: v.object({ people: v.number(), shops: v.number(), managers: v.number() }),
  nextEvent: v.optional(v.object({ label: v.string(), date: v.string() })),
  blockedReason: v.optional(v.string()),
  billingEmail: v.string(),
  previousPlan: v.optional(billingPlanValidator),
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
  canCreateOrganization: v.boolean(),
  createOrganizationDisabledReason: v.optional(v.string()),
  // 導線の表示判定は可否（can*）とは別に持ち、rolling deploy中の旧frontendとの互換を保つ。
  // TODO[narrow]: featuresを返すbackendが全deploymentへ反映され、旧frontend互換期間が終わった後にrequired化する。
  features: v.optional(
    v.object({
      organizationCreation: v.boolean(),
      shopAddition: v.boolean(),
      billing: v.boolean(),
      managerInvitation: v.boolean(),
    }),
  ),
});

type BillingPlan = "trial" | "free" | "pro" | "business";
type BillingView = {
  state:
    | BillingPlan
    | "initialPaymentPending"
    | "pendingActivation"
    | "grace"
    | "restricted"
    | "scheduledChange"
    | "migrationPending";
  currentPlan: BillingPlan | null;
  isComplimentary: boolean;
  hasTrialContinuation: boolean;
  trialEndsAt?: number;
  stripeBillingAvailable: boolean;
  hasStripeCustomer: boolean;
  targetPlan?: Exclude<BillingPlan, "trial">;
  restrictAtPeriodEnd?: true;
  limitPlan?: "free" | "pro";
  peopleUsage: { current: number; max: number; pendingInvitations: number };
  shopUsage: { current: number; max: number; pendingInvitations: number };
  managerUsage: { current: number; max: number; pendingInvitations: number };
  requiredReductions: { people: number; shops: number; managers: number };
  nextEvent?: { label: string; date: string };
  blockedReason?: string;
  billingEmail: string;
  previousPlan?: BillingPlan;
  canManagePlan: boolean;
  canUpdatePaymentMethod: boolean;
  canUpdateBillingEmail: boolean;
  canScheduleFree: boolean;
  managePlanDisabledReason?: string;
  paymentMethodDisabledReason?: string;
  billingEmailDisabledReason?: string;
};

function legacyMigrationPendingSettings(
  user: Doc<"users">,
  shop: Doc<"shops">,
  creationAvailability: OrganizationCreationAvailability,
) {
  const migrationReason = "組織単位の設定を移行しています。\n完了するまで、既存データを閲覧できます。";
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
        // TODO[narrow]: 全deploymentでm039のshop workerが完走し、
        // verifyShops.missingRegularClosedDaysが0件になった後にfallbackを削除する。
        regularClosedDays: shop.regularClosedDays ?? [],
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
      hasTrialContinuation: false,
      stripeBillingAvailable: false,
      hasStripeCustomer: false,
      peopleUsage: { current: 1, max: 0, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 0, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 0, pendingInvitations: 0 },
      requiredReductions: { people: 0, shops: 0, managers: 0 },
      blockedReason: "組織単位のプラン設定を移行しています。\n完了後、利用状態を再確認します。",
      billingEmail: user.email,
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
    // 組織作成は選択中組織の移行状態と独立しているため、移行待ちでも利用者単位で判定する。
    canCreateOrganization: creationAvailability.canCreate,
    ...(creationAvailability.canCreate ? {} : { createOrganizationDisabledReason: creationAvailability.reason }),
    features: getOrganizationSettingsFeatures(),
  };
}

/** 公開状態を画面の描画判定へ渡す。認可根拠には使わない。 */
function getOrganizationSettingsFeatures() {
  return {
    // 旧frontendの表示DTOとの互換のため項目を残す。
    organizationCreation: true,
    shopAddition: true,
    billing: true,
    managerInvitation: true,
  };
}

function restrictedBlockedReason(state: Extract<Doc<"organizationBillingStates">["state"], { kind: "restricted" }>) {
  switch (state.reason) {
    case "trialEndedWithoutSubscription":
      return "トライアルが終了しました。\n利用を再開するには、ProまたはBusinessを契約してください。";
    case "scheduledCancellation":
      return "予約した利用停止が適用されました。\n利用を再開するには、ProまたはBusinessを契約してください。";
    case "trialFreeConditionsNotMet":
    case "freeConditionsNotMet":
      return "無料プランの利用人数または店舗数の上限を超えています。\nユーザーまたは店舗を削除してから、再確認してください。";
    case "paymentGraceExpired":
      return "支払い猶予が終了しています。\n支払い方法を更新するか、有料プランを再開してください。";
    case "paymentActivationFailed":
      return "有料プランの支払いを確認できませんでした。\n有料プランを再契約してください。";
    case "unexpectedCancellation":
      return "契約状態を確認できません。\n有料プランを再契約してください。";
    case "planLimitExceeded":
      return state.limitPlan === "pro"
        ? "Proの利用人数上限を超えています。\n利用人数を上限以内に整理すると、Proを利用できます。"
        : "無料プランの利用上限を超えています。\n利用人数・店舗数・管理者数を上限以内に整理してください。";
  }
}

export const getSettings = managerQuery({
  args: {},
  returns: v.union(organizationSettingsValidator, v.null()),
  handler: async (ctx) => {
    if (!ctx.user || !ctx.shop) return null;
    // 新しい組織を作れるかは選択中組織の課金状態や所属状態と独立しており、利用者単位で決まる。
    const creationAvailability = await getOrganizationCreationAvailability(ctx, ctx.user);
    if (!ctx.organization) return legacyMigrationPendingSettings(ctx.user, ctx.shop, creationAvailability);

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
      stripeCustomer,
      latestStripeSubscription,
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
      ctx.db
        .query("organizationStripeCustomers")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organization._id))
        .unique(),
      ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", organization._id))
        .order("desc")
        .first(),
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

    // 店舗所属がなくなっても組織の利用人数に含まれる人物は、削除済みを含むstaff履歴から判定する。
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
    const activeShopCount = shops.filter((shop) => shop.operatingStatus === "active").length;
    const policy = billingState ? deriveOrganizationBillingPolicy(billingState.state) : null;
    const stripeBillingConfiguration = getStripeBillingConfiguration();
    const stripeBillingAvailable = stripeBillingConfiguration.status === "ready";
    const isComplimentary = billingState?.state.kind === "complimentary";
    const hasStripeCustomer = Boolean(!isComplimentary && stripeCustomer);
    const stripeCustomerMatchesConfiguration = Boolean(
      stripeBillingConfiguration.status === "ready" && stripeCustomer?.livemode === stripeBillingConfiguration.livemode,
    );
    const restrictedState = billingState ? getEffectiveRestrictedBillingState(billingState.state) : null;
    const isActiveActor = ctx.organizationMember?.status === "active";
    const isRestrictedRecovery = Boolean(
      restrictedState &&
        isActiveActor &&
        ctx.organizationMember &&
        restrictedState.recoveryManagerPersonIds.includes(ctx.organizationMember.personId),
    );
    const canStartRestrictedRecovery = isRestrictedRecovery && billingState?.state.kind === "restricted";
    const canWriteNormally = Boolean(isActiveActor && policy?.canWriteBusinessData);
    const restrictedLimitPlan = restrictedState ? resolveRestrictedLimitPlan(restrictedState) : null;
    // 購入対象の表示ではなく、現在のentitlementを利用上限の根拠にする。
    const usageLimits = restrictedLimitPlan ? ORGANIZATION_PLAN_LIMITS[restrictedLimitPlan] : policy?.limits;

    const recoveryPersonIds = restrictedState
      ? restrictedState.recoveryManagerPersonIds.filter((personId) => people.some((person) => person._id === personId))
      : [];
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
              ? "有効期限が切れました。\n再送すると、新しいURLが発行されます。"
              : "この招待は再送できません。\n権限・ユーザー・契約状態を確認してください。"
            : status === "sendFailed"
              ? canResend
                ? "ログイン案内を送信できませんでした。\n招待先のメールアドレスを確認してから、再送してください。"
                : "この招待は再送できません。\n権限・ユーザー・契約状態を確認してください。"
              : status === "limitReached"
                ? "現在のプランの上限に達しているため、アカウントを連携できません。\n利用状況またはプランを確認してください。"
                : status === "conflict"
                  ? canRevoke
                    ? "招待後に、ユーザーまたは契約の状態が変わりました。\nこの招待を取り消して、内容を確認してください。"
                    : "招待後に、ユーザーまたは契約の状態が変わりました。\n権限・ユーザー・契約状態を確認してください。"
                  : status === "pending" && purpose === "freeManagerExchange"
                    ? "アカウント連携が完了するまでは、現在の管理者が引き続き操作できます。"
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
        const isBillingContact = isOrganizationBillingContact(organization, person);
        const capabilities = deriveOrganizationPersonCapabilities({
          managerRole,
          activeManagerCount,
          canWriteNormally,
          policy,
          isStaff,
          isBillingContact,
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
        ? "組織には少なくとも1店舗が必要です。"
        : !isActiveActor
          ? "閲覧のみの管理者は、店舗を削除できません。"
          : restrictedState
            ? "店舗を削除できるのは、契約の復旧担当者だけです。"
            : "現在の契約状態では、店舗を削除できません。";
    const shopsView = shops
      .map((shop) => {
        const canUpdateSettings = Boolean(canWriteNormally && shop.operatingStatus === "active");
        const settingsDisabledReason = canUpdateSettings
          ? undefined
          : shop.operatingStatus !== "active"
            ? "利用停止中の店舗は、設定を変更できません。"
            : !billingState
              ? "組織単位の設定を移行しています。\n完了するまでお待ちください。"
              : !isActiveActor
                ? "閲覧のみの管理者は、店舗設定を変更できません。"
                : restrictedState
                  ? "契約制限中は、店舗設定を変更できません。"
                  : "支払い結果が確定するまで、店舗設定を変更できません。";
        return {
          id: shop._id,
          name: shop.name,
          // TODO[narrow]: 全deploymentでm039のshop workerが完走し、
          // verifyShops.missingRegularClosedDaysが0件になった後にfallbackを削除する。
          regularClosedDays: shop.regularClosedDays ?? [],
          submissionPattern: shop.submissionPattern,
          staffCount: staffCountByShopId.get(shop._id) ?? 0,
          canUpdateSettings,
          ...(settingsDisabledReason ? { settingsDisabledReason } : {}),
          canDelete: canDeleteShop,
          ...(deleteShopDisabledReason ? { deleteDisabledReason: deleteShopDisabledReason } : {}),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));

    const runtimeBillingState = billingState?.state ?? null;
    const canAccessCustomerPortal = Boolean(
      canStartRestrictedRecovery ||
        (isActiveActor &&
          billingState &&
          !restrictedState &&
          ((billingState.state.kind === "trial" && billingState.state.selectedPaidPlan !== undefined) ||
            billingState.state.kind === "scheduledChange" ||
            billingState.state.kind === "grace" ||
            (billingState.state.kind === "active" && billingState.state.plan !== "free"))),
    );
    const billingCapabilities = {
      canManagePlan: Boolean(
        stripeBillingAvailable &&
          !isComplimentary &&
          (canStartRestrictedRecovery ||
            (isActiveActor &&
              billingState &&
              !restrictedState &&
              billingState.state.kind !== "initialPaymentPending" &&
              billingState.state.kind !== "pendingActivation")),
      ),
      canUpdatePaymentMethod: Boolean(
        stripeBillingAvailable && stripeCustomerMatchesConfiguration && !isComplimentary && canAccessCustomerPortal,
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
        stripeBillingAvailable &&
          !isComplimentary &&
          isActiveActor &&
          runtimeBillingState?.kind === "active" &&
          runtimeBillingState.plan !== "free",
      ),
    };
    const peopleUsageCurrent = usage.projectedPeopleCount;
    const managerUsageCurrent = projectedActiveManagerCount;
    const maxPeople = usageLimits?.maxPeople ?? 0;
    const maxShops = usageLimits?.maxActiveShops ?? 0;
    const maxManagers = usageLimits?.maxActiveManagers ?? 0;
    const billingBase = {
      peopleUsage: {
        current: peopleUsageCurrent,
        max: maxPeople,
        pendingInvitations: usage.reservedPersonCount,
      },
      shopUsage: { current: activeShopCount, max: maxShops, pendingInvitations: 0 },
      managerUsage: {
        current: managerUsageCurrent,
        max: maxManagers,
        pendingInvitations: pendingManagerInvitationCount,
      },
      requiredReductions: {
        people: Math.max(0, peopleUsageCurrent - maxPeople),
        shops: Math.max(0, activeShopCount - maxShops),
        managers: Math.max(0, managerUsageCurrent - maxManagers),
      },
      ...(restrictedLimitPlan ? { limitPlan: restrictedLimitPlan } : {}),
      billingEmail: organization.billingEmail ?? "",
      isComplimentary,
      stripeBillingAvailable,
      hasStripeCustomer,
      hasTrialContinuation: Boolean(
        runtimeBillingState?.kind === "trial" && runtimeBillingState.selectedPaidPlan !== undefined,
      ),
      ...billingCapabilities,
    };
    const accessDisabledReason =
      !isActiveActor && !isRestrictedRecovery
        ? restrictedState
          ? "この操作を行えるのは、契約の復旧担当者だけです。"
          : "閲覧のみの管理者は、この操作を行えません。"
        : undefined;
    const managePlanDisabledReason =
      billingCapabilities.canManagePlan || isComplimentary
        ? undefined
        : !stripeBillingAvailable
          ? "Proの料金は準備中です。"
          : !billingState
            ? "設定の移行が完了するまでお待ちください。"
            : (accessDisabledReason ??
              (billingState.state.kind === "initialPaymentPending"
                ? "初回支払いの結果を確認中のため、プランを変更できません。"
                : billingState.state.kind === "pendingActivation"
                  ? "支払い結果を確認中のため、別のプランへは変更できません。"
                  : "現在の契約状態では、プランを変更できません。"));
    const paymentMethodDisabledReason =
      billingCapabilities.canUpdatePaymentMethod || isComplimentary
        ? undefined
        : !stripeBillingAvailable
          ? "Proの料金は準備中です。"
          : !billingState
            ? "設定の移行が完了するまでお待ちください。"
            : (accessDisabledReason ??
              (!canAccessCustomerPortal
                ? billingState.state.kind === "trial" && !billingState.state.selectedPaidPlan
                  ? "トライアル終了後のPro継続を登録すると、Stripeで支払い情報を管理できます。"
                  : billingState.state.kind === "initialPaymentPending"
                    ? "初回支払いの結果を確認中です。\n確定後に、Stripeで支払い情報を管理できます。"
                    : billingState.state.kind === "active" && billingState.state.plan === "free"
                      ? "無料プランでは、支払い情報の管理は不要です。\n有料プランを契約するときに、Stripeで登録します。"
                      : billingState.state.kind === "pendingActivation"
                        ? "支払い結果を確認中です。\n確定後に、Stripeで支払い情報を管理できます。"
                        : "現在の契約状態では、Stripeの支払い情報を管理できません。"
                : !hasStripeCustomer
                  ? "Stripeの契約情報を準備中です。\nしばらくしてから、もう一度お試しください。"
                  : !stripeCustomerMatchesConfiguration
                    ? "Stripeの契約情報と決済設定を確認中です。\nしばらくしてから、もう一度お試しください。"
                    : "現在の契約状態では、Stripeの支払い情報を管理できません。"));
    const billingEmailDisabledReason =
      billingCapabilities.canUpdateBillingEmail || isComplimentary
        ? undefined
        : !billingState
          ? "設定の移行が完了するまでお待ちください。"
          : (accessDisabledReason ?? "現在の契約状態では、請求先メールアドレスを変更できません。");
    const billingCapabilityReasons = {
      ...(managePlanDisabledReason ? { managePlanDisabledReason } : {}),
      ...(paymentMethodDisabledReason ? { paymentMethodDisabledReason } : {}),
      ...(billingEmailDisabledReason ? { billingEmailDisabledReason } : {}),
    };

    let billing: BillingView;
    // TODO[narrow]: 全deploymentでm025完走・verifyOrganizationsのbilling state残件0確認後、
    //   migrationPending DTOと関連するUI fallbackを削除する。
    if (!billingState) {
      billing = {
        ...billingBase,
        ...billingCapabilityReasons,
        state: "migrationPending",
        currentPlan: null,
        blockedReason: "組織単位のプラン設定を移行しています。\n完了後、利用状態を再確認します。",
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
            ...(state.selectedPaidPlan ? { targetPlan: state.selectedPaidPlan } : {}),
            trialEndsAt: state.trialEndsAt,
            // trialEndsAt は登録開始日の2暦月後の同日（同日がなければ月末）の0:00 JSTを表す排他的な境界。
            // 次の予定ではトライアルを利用できる最終日を表示する。
            nextEvent: { label: "トライアル最終日", date: formatDateJa(state.trialEndsAt - 1) },
          };
          break;
        case "initialPaymentPending":
          billing = {
            ...billingBase,
            ...billingCapabilityReasons,
            state: "initialPaymentPending",
            currentPlan: "pro",
            targetPlan: state.plan,
            nextEvent: { label: "支払い結果", date: "確認中" },
          };
          break;
        case "pendingActivation":
          billing = {
            ...billingBase,
            ...billingCapabilityReasons,
            state: "pendingActivation",
            currentPlan: state.fallback === "free" ? "free" : state.fallback === "pro" ? "pro" : null,
            targetPlan: state.plan,
            blockedReason:
              state.fallback === "free"
                ? "有料プランの支払い結果を確認中です。\n無料の基本機能は引き続き利用できます。"
                : restrictedState
                  ? restrictedBlockedReason(restrictedState)
                  : "支払い結果を確認しています。\n確認が終わるまで、契約制限中のままになります。",
            nextEvent: { label: "支払い結果", date: "確認中" },
          };
          break;
        case "active":
          billing = {
            ...billingBase,
            ...billingCapabilityReasons,
            state: state.plan,
            currentPlan: state.plan,
            ...(state.plan !== "free" &&
            latestStripeSubscription?.terminalAt === undefined &&
            latestStripeSubscription?.currentPeriodEndsAt !== undefined
              ? {
                  nextEvent: {
                    label: "次回更新日",
                    date: formatDateJa(latestStripeSubscription.currentPeriodEndsAt),
                  },
                }
              : {}),
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
            state: "scheduledChange",
            currentPlan: state.currentPlan,
            targetPlan: state.targetPlan,
            ...(state.targetPlan === "free" && state.restrictAtPeriodEnd === true
              ? { restrictAtPeriodEnd: true as const }
              : {}),
            nextEvent: {
              label:
                state.targetPlan === "free"
                  ? state.restrictAtPeriodEnd === true
                    ? "利用停止予定日"
                    : "無料適用予定日"
                  : "Pro適用予定日",
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
            ...(state.targetPlan ? { targetPlan: state.targetPlan } : {}),
            blockedReason: "期限までに支払い方法を更新しないと、契約制限中になります。",
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
            ...(state.targetPlan ? { targetPlan: state.targetPlan } : {}),
            blockedReason: restrictedBlockedReason(state),
          };
          break;
      }
    }

    const inviteManagerDisabledReason = canInviteManager
      ? undefined
      : !billingState
        ? "組織単位のプラン設定を移行しています。\n完了するまでお待ちください。"
        : !isActiveActor
          ? "閲覧のみの管理者は、管理者を招待できません。"
          : restrictedState
            ? "契約制限中は、管理者を招待できません。"
            : managerInvitationMode === "freeManagerExchange" && activeFreeManagerExchangeInvitations.length > 0
              ? "次の管理者のアカウント連携を待っています。\n連携が完了するまでは、現在の管理者が引き続き操作できます。"
              : managerInvitationMode === "freeManagerExchange"
                ? "無料プランでは、組織内の既存スタッフへの管理者交代のみ行えます。"
                : policy?.paidFeatureBlockReason === "freePlan"
                  ? "無料プランでは、管理者を追加できません。\n有料プランを選択してください。"
                  : policy?.paidFeatureBlockReason === "paymentResultPending"
                    ? "支払い結果が確定してから、管理者を招待できます。"
                    : `管理者と招待中の管理者は、組織全体で${policy?.limits?.maxActiveManagers ?? ORGANIZATION_PLAN_LIMITS.pro.maxActiveManagers}名までです。`;
    const canAddShop = Boolean(
      isActiveActor && policy?.canUsePaidFeatures && policy.limits && activeShopCount < policy.limits.maxActiveShops,
    );
    const addShopDisabledReason = canAddShop
      ? undefined
      : !billingState
        ? "組織単位のプラン設定を移行しています。\n完了するまでお待ちください。"
        : !isActiveActor
          ? "閲覧のみの管理者は、店舗を追加できません。"
          : restrictedState
            ? "契約制限中は、店舗を追加できません。"
            : policy?.paidFeatureBlockReason === "freePlan"
              ? "無料プランでは、店舗を追加できません。\n有料プランを選択してください。"
              : policy?.paidFeatureBlockReason === "paymentResultPending"
                ? "支払い結果が確定してから、店舗を追加できます。"
                : `店舗は、組織ごとに${policy?.limits?.maxActiveShops ?? ORGANIZATION_PLAN_LIMITS.pro.maxActiveShops}件まで登録できます。`;
    const canUpdateOrganizationName = isActiveActor;
    const updateOrganizationNameDisabledReason = canUpdateOrganizationName
      ? undefined
      : !ctx.organizationMember
        ? "組織単位の設定を移行しています。\n完了するまでお待ちください。"
        : "閲覧のみの管理者は、組織名を変更できません。";

    const deletionEligibility = ctx.organizationMember
      ? await getOrganizationDeletionEligibility(ctx, {
          organizationId: organization._id,
          actorMemberId: ctx.organizationMember._id,
          billingState,
        })
      : {
          canDelete: false as const,
          reason: "組織単位の設定を移行しています。\n完了するまでお待ちください。",
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
      canCreateOrganization: creationAvailability.canCreate,
      ...(creationAvailability.canCreate ? {} : { createOrganizationDisabledReason: creationAvailability.reason }),
      features: getOrganizationSettingsFeatures(),
    };
  },
});

const managerSettingsOverviewValidator = v.union(
  v.object({ kind: v.literal("hidden") }),
  v.object({ kind: v.literal("integrityError"), message: v.string() }),
  v.object({
    kind: v.literal("ready"),
    organizationName: v.string(),
    mode: v.union(v.literal("managerAddition"), v.literal("freeManagerExchange"), v.literal("restricted")),
    usage: v.object({
      activeManagers: v.number(),
      activeInvitationCount: v.number(),
      pendingAdditions: v.number(),
      pendingExchanges: v.number(),
      projectedManagers: v.number(),
      maxManagers: v.number(),
    }),
    actions: v.object({
      canInviteExistingStaff: v.boolean(),
      existingStaffDisabledReason: v.optional(v.string()),
      canInviteExternal: v.boolean(),
      externalDisabledReason: v.optional(v.string()),
    }),
    managers: v.array(
      v.object({
        personId: v.id("organizationPeople"),
        name: v.string(),
        contactEmail: v.string(),
        role: v.union(v.literal("active"), v.literal("readOnly")),
        isSelf: v.boolean(),
        canRemoveRole: v.boolean(),
        removeRoleDisabledReason: v.optional(v.string()),
      }),
    ),
    invitations: v.array(
      v.object({
        invitationId: v.id("organizationInvitations"),
        name: v.string(),
        invitedEmail: v.string(),
        purpose: v.union(v.literal("managerAddition"), v.literal("freeManagerExchange")),
        status: v.union(
          v.literal("pending"),
          v.literal("sendFailed"),
          v.literal("limitReached"),
          v.literal("conflict"),
        ),
        expiresAt: v.number(),
        canResend: v.boolean(),
        canRevoke: v.boolean(),
      }),
    ),
  }),
);

const managerCandidatesValidator = v.union(
  v.object({ kind: v.literal("hidden") }),
  v.object({ kind: v.literal("integrityError"), message: v.string() }),
  v.object({
    kind: v.literal("ready"),
    candidates: v.array(
      v.object({
        personId: v.id("organizationPeople"),
        name: v.string(),
        contactEmail: v.string(),
        canSelect: v.boolean(),
        disabledReason: v.optional(v.string()),
      }),
    ),
  }),
);

const MANAGER_SETTINGS_INTEGRITY_ERROR = "管理者情報を確認できません。\n画面を更新して、もう一度お試しください。";
const MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS = {
  people: Math.max(...Object.values(ORGANIZATION_PLAN_LIMITS).map((limits) => limits.maxPeople)),
  activeManagers: Math.max(...Object.values(ORGANIZATION_PLAN_LIMITS).map((limits) => limits.maxActiveManagers)),
  readOnlyManagers: Math.max(...Object.values(ORGANIZATION_PLAN_LIMITS).map((limits) => limits.maxPeople)),
  invitations: Math.max(...Object.values(ORGANIZATION_PLAN_LIMITS).map((limits) => limits.maxActiveManagers)),
} as const;

function getManagerSettingsLimits(billingState: Doc<"organizationBillingStates">) {
  const policy = deriveOrganizationBillingPolicy(billingState.state);
  const restrictedState = getEffectiveRestrictedBillingState(billingState.state);
  const restrictedPlan = restrictedState
    ? (resolveRestrictedLimitPlan(restrictedState) ?? restrictedState.previousPlan ?? restrictedState.targetPlan)
    : null;
  return {
    policy,
    restrictedState,
    limits: restrictedPlan ? ORGANIZATION_PLAN_LIMITS[restrictedPlan] : policy.limits,
  };
}

async function readBoundedManagerMembers(
  ctx: Pick<QueryCtx, "db">,
  organizationId: Id<"organizations">,
  limits: { active: number; readOnly: number },
) {
  const [active, readOnly] = await Promise.all([
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
      .take(limits.active + 1),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "readOnly"))
      .take(limits.readOnly + 1),
  ]);
  if (active.length > limits.active || readOnly.length > limits.readOnly) return null;
  const members = [...active, ...readOnly];
  const seenPeople = new Set<Id<"organizationPeople">>();
  const seenUsers = new Set<Id<"users">>();
  const rows = [];
  for (const member of members) {
    if (seenPeople.has(member.personId) || seenUsers.has(member.userId)) return null;
    seenPeople.add(member.personId);
    seenUsers.add(member.userId);
    const [person, user, personMembers, userMembers] = await Promise.all([
      ctx.db.get(member.personId),
      ctx.db.get(member.userId),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", organizationId).eq("personId", member.personId),
        )
        .take(2),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", member.userId).eq("organizationId", organizationId),
        )
        .take(2),
    ]);
    if (
      !person ||
      person.organizationId !== organizationId ||
      person.status !== "active" ||
      person.userId !== member.userId ||
      !user ||
      user.isDeleted ||
      personMembers.length !== 1 ||
      personMembers[0]._id !== member._id ||
      userMembers.length !== 1 ||
      userMembers[0]._id !== member._id
    ) {
      return null;
    }
    rows.push({ member, person });
  }
  return { active, readOnly, rows };
}

/** 管理者専用ページのPIIと操作可否だけを返すbounded DTO。 */
export const getManagerSettingsOverview = managerQuery({
  args: { now: v.number() },
  returns: managerSettingsOverviewValidator,
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.now) || !ctx.user || !ctx.organization || !ctx.organizationMember) {
      return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
    }
    const organization = ctx.organization;
    const organizationMember = ctx.organizationMember;

    const billingState = await getOrganizationBillingState(ctx, organization._id);
    if (!billingState) return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
    const { policy, restrictedState, limits } = getManagerSettingsLimits(billingState);
    if (!limits) return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };

    const [managerState, activeInvitations] = await Promise.all([
      readBoundedManagerMembers(ctx, organization._id, {
        active: MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.activeManagers,
        readOnly: MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.readOnlyManagers,
      }),
      readActiveIssuedInvitationsByOrganization(
        ctx,
        organization._id,
        args.now,
        MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.invitations,
      ),
    ]);
    if (!managerState || managerState.active.length === 0 || activeInvitations.hasOverflow) {
      return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
    }
    if (managerState.active.length !== managerState.rows.filter(({ member }) => member.status === "active").length) {
      return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
    }

    const purposes = activeInvitations.invitations.map((invitation) => getOrganizationInvitationPurpose(invitation));
    const pendingAdditions = purposes.filter((purpose) => purpose === "managerAddition").length;
    const pendingExchanges = purposes.filter((purpose) => purpose === "freeManagerExchange").length;
    const projectedManagers = managerState.active.length + pendingAdditions;
    const isActiveActor = organizationMember.status === "active";
    const isFree = policy.entitlementPlan === "free";
    const canWrite = Boolean(isActiveActor && policy.canWriteBusinessData && !restrictedState);
    const mode = !canWrite
      ? ("restricted" as const)
      : isFree
        ? ("freeManagerExchange" as const)
        : policy.canUsePaidFeatures
          ? ("managerAddition" as const)
          : ("restricted" as const);

    const activePeople = await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organization._id).eq("status", "active"))
      .take(MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.people + 1);
    if (activePeople.length > MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.people) {
      return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
    }
    const activeManagerPersonIds = new Set(managerState.active.map((member) => member.personId));
    let peopleUsage = 0;
    for (const person of activePeople) {
      if (
        activeManagerPersonIds.has(person._id) ||
        (await ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId", (q) =>
            q.eq("organizationId", organization._id).eq("organizationPersonId", person._id),
          )
          .first())
      ) {
        peopleUsage += 1;
      }
    }
    const reservedPeople = activeInvitations.invitations.filter((invitation) => invitation.reservedSeat).length;
    const canFitManager = projectedManagers < limits.maxActiveManagers;
    const canFitPerson = peopleUsage + reservedPeople < limits.maxPeople;
    const hasExchangePending = pendingExchanges > 0;
    const inviteBaseReason = !isActiveActor
      ? "閲覧のみの管理者は、管理者を招待できません。"
      : restrictedState || !policy.canWriteBusinessData
        ? "契約状態を復旧してから変更できます。"
        : !canFitManager
          ? `管理者と招待中の管理者は、組織全体で${limits.maxActiveManagers}名までです。`
          : undefined;
    const canInviteExistingStaff = Boolean(
      canWrite && (mode === "managerAddition" ? canFitManager : mode === "freeManagerExchange" && !hasExchangePending),
    );
    const existingStaffDisabledReason = canInviteExistingStaff
      ? undefined
      : mode === "freeManagerExchange" && hasExchangePending
        ? "次の管理者の承認を待っています。"
        : (inviteBaseReason ?? "現在の契約状態では、管理者を招待できません。");
    const canInviteExternal = Boolean(canWrite && mode === "managerAddition" && canFitManager && canFitPerson);
    const externalDisabledReason = canInviteExternal
      ? undefined
      : mode === "freeManagerExchange"
        ? "Freeでは組織内の既存スタッフと交代できます。"
        : !canFitPerson
          ? `利用人数は、組織全体で${limits.maxPeople}名までです。`
          : (inviteBaseReason ?? "現在の契約状態では、新しいユーザーを招待できません。");

    const validRecoveryPersonIds = restrictedState
      ? (
          await Promise.all(
            restrictedState.recoveryManagerPersonIds.map(async (personId) =>
              (await isValidOrganizationRecoveryManager(ctx, organization._id, personId)) ? personId : null,
            ),
          )
        ).filter((personId): personId is Id<"organizationPeople"> => personId !== null)
      : [];
    const managers = [];
    for (const { member, person } of managerState.rows) {
      const isStaff = Boolean(
        await ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId", (q) =>
            q.eq("organizationId", organization._id).eq("organizationPersonId", person._id),
          )
          .filter((q) => q.eq(q.field("isDeleted"), false))
          .first(),
      );
      const capabilities = deriveOrganizationPersonCapabilities({
        managerRole: member.status === "active" ? "active" : "readOnly",
        activeManagerCount: managerState.active.length,
        canWriteNormally: canWrite,
        policy,
        isStaff,
        isBillingContact: isOrganizationBillingContact(organization, person),
        isActiveActor,
        isRestricted: restrictedState !== null,
        isRestrictedRecovery: validRecoveryPersonIds.includes(organizationMember.personId),
        isLastRecoveryManager: validRecoveryPersonIds.includes(person._id) && validRecoveryPersonIds.length <= 1,
      });
      managers.push({
        personId: person._id,
        name: person.name,
        contactEmail: person.email,
        role: member.status === "active" ? ("active" as const) : ("readOnly" as const),
        isSelf: person._id === organizationMember.personId,
        canRemoveRole: capabilities.canRemoveManagerRole,
        ...(capabilities.managerRoleRemovalDisabledReason
          ? { removeRoleDisabledReason: capabilities.managerRoleRemovalDisabledReason }
          : {}),
      });
    }
    managers.sort(
      (left, right) =>
        Number(right.role === "active") - Number(left.role === "active") ||
        left.name.localeCompare(right.name, "ja") ||
        left.personId.localeCompare(right.personId),
    );

    const invitations = [];
    for (const invitation of activeInvitations.invitations) {
      const purpose = getOrganizationInvitationPurpose(invitation);
      const targetPerson = invitation.targetPersonId ? await ctx.db.get(invitation.targetPersonId) : null;
      const matchingPeople = invitation.targetPersonId
        ? targetPerson
          ? [targetPerson]
          : []
        : await ctx.db
            .query("organizationPeople")
            .withIndex("by_organizationId_and_emailNormalized", (q) =>
              q.eq("organizationId", organization._id).eq("emailNormalized", invitation.emailNormalized),
            )
            .take(2);
      const effectiveTargetPerson = targetPerson ?? (matchingPeople.length === 1 ? matchingPeople[0] : null);
      const effectiveTargetEmail = effectiveTargetPerson
        ? requiredEmailSchema.safeParse(effectiveTargetPerson.email)
        : null;
      const matchingMember = effectiveTargetPerson
        ? await ctx.db
            .query("organizationMembers")
            .withIndex("by_organizationId_and_personId", (q) =>
              q.eq("organizationId", organization._id).eq("personId", effectiveTargetPerson._id),
            )
            .take(2)
        : [];
      const targetConflict = Boolean(
        (invitation.targetPersonId && !targetPerson) ||
          (effectiveTargetPerson &&
            (effectiveTargetPerson.organizationId !== organization._id ||
              effectiveTargetPerson.status !== "active" ||
              effectiveTargetPerson.emailNormalized !== invitation.emailNormalized ||
              !effectiveTargetEmail?.success ||
              normalizeEmail(effectiveTargetEmail.data) !== invitation.emailNormalized)) ||
          matchingPeople.length > 1 ||
          matchingMember.length > 1 ||
          matchingMember[0]?.status === "active" ||
          matchingMember[0]?.status === "readOnly",
      );
      const eligibility = targetConflict ? null : await resolveOrganizationInvitationEligibility(ctx, invitation);
      const outbox = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_organizationInvitationId", (q) => q.eq("organizationInvitationId", invitation._id))
        .filter((q) => q.eq(q.field("organizationInvitationVersion"), invitation.version))
        .order("desc")
        .first();
      const deliveryFailure =
        outbox?.status === "failed"
          ? true
          : Boolean(
              await ctx.db
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
                .first(),
            );
      const limitReached = purpose === "managerAddition" && projectedManagers > limits.maxActiveManagers;
      const status =
        targetConflict || !eligibility
          ? ("conflict" as const)
          : limitReached
            ? ("limitReached" as const)
            : deliveryFailure
              ? ("sendFailed" as const)
              : ("pending" as const);
      invitations.push({
        invitationId: invitation._id,
        name: effectiveTargetPerson?.name ?? invitation.invitedName?.trim() ?? invitation.email.split("@", 1)[0],
        invitedEmail: invitation.email,
        purpose,
        status,
        expiresAt: invitation.expiresAt,
        canResend: Boolean(canWrite && status !== "conflict" && !limitReached),
        canRevoke: canWrite,
      });
    }

    return {
      kind: "ready" as const,
      organizationName: organization.name,
      mode,
      usage: {
        activeManagers: managerState.active.length,
        activeInvitationCount: activeInvitations.invitations.length,
        pendingAdditions,
        pendingExchanges,
        projectedManagers,
        maxManagers: limits.maxActiveManagers,
      },
      actions: {
        canInviteExistingStaff,
        ...(existingStaffDisabledReason ? { existingStaffDisabledReason } : {}),
        canInviteExternal,
        ...(externalDisabledReason ? { externalDisabledReason } : {}),
      },
      managers,
      invitations,
    };
  },
});

/** 既存スタッフ招待subpageでだけ購読するbounded候補一覧。 */
export const getManagerCandidates = managerQuery({
  args: { now: v.number() },
  returns: managerCandidatesValidator,
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.now) || !ctx.organization || !ctx.organizationMember) {
      return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
    }
    const organization = ctx.organization;
    const organizationMember = ctx.organizationMember;
    const billingState = await getOrganizationBillingState(ctx, organization._id);
    if (!billingState) return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
    const { policy, restrictedState, limits } = getManagerSettingsLimits(billingState);
    if (!limits) return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
    const [people, invitations, managers] = await Promise.all([
      ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", organization._id).eq("status", "active"),
        )
        .take(MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.people + 1),
      readActiveIssuedInvitationsByOrganization(
        ctx,
        organization._id,
        args.now,
        MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.invitations,
      ),
      readBoundedManagerMembers(ctx, organization._id, {
        active: MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.activeManagers,
        readOnly: MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.readOnlyManagers,
      }),
    ]);
    if (people.length > MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.people || invitations.hasOverflow || !managers) {
      return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
    }

    const activeStaffPersonIds = new Set<Id<"organizationPeople">>();
    for (const person of people) {
      const staffs = await ctx.db
        .query("staffs")
        .withIndex("by_organizationId_and_organizationPersonId", (q) =>
          q.eq("organizationId", organization._id).eq("organizationPersonId", person._id),
        )
        .take(101);
      if (staffs.length > 100) {
        return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
      }
      for (const staff of staffs) {
        if (staff.isDeleted) continue;
        const shop = await ctx.db.get(staff.shopId);
        if (
          shop &&
          !shop.isDeleted &&
          shop.organizationId === organization._id &&
          organizationShopOperatingStatus(shop.operatingStatus) === "active"
        ) {
          activeStaffPersonIds.add(person._id);
          break;
        }
      }
    }
    const memberByPersonId = new Map(managers.rows.map(({ member }) => [member.personId, member]));
    const pendingTargetIds = new Set(
      invitations.invitations.flatMap((invitation) => (invitation.targetPersonId ? [invitation.targetPersonId] : [])),
    );
    const pendingEmails = new Set(invitations.invitations.map((invitation) => invitation.emailNormalized));
    const isActiveActor = organizationMember.status === "active";
    const isFree = policy.entitlementPlan === "free";
    const canWrite = Boolean(isActiveActor && policy.canWriteBusinessData && !restrictedState);

    const candidates = [];
    for (const person of people) {
      if (!activeStaffPersonIds.has(person._id)) continue;
      const member = memberByPersonId.get(person._id);
      const parsedEmail = requiredEmailSchema.safeParse(person.email);
      const hasValidEmail = parsedEmail.success && normalizeEmail(parsedEmail.data) === person.emailNormalized;
      const pending = pendingTargetIds.has(person._id) || pendingEmails.has(person.emailNormalized);
      const freeEligibility = isFree
        ? await resolveFreeManagerExchangeEligibility(ctx, {
            organizationId: organization._id,
            inviterMemberId: organizationMember._id,
            emailNormalized: person.emailNormalized,
            targetPersonId: person._id,
          })
        : null;
      const disabledReason =
        member?.status === "active"
          ? "すでに管理者です。"
          : member?.status === "readOnly"
            ? "閲覧のみの管理者です。契約状態を復旧してから変更してください。"
            : pending
              ? "管理者招待の承認待ちです。"
              : !hasValidEmail
                ? person.email.trim().length === 0
                  ? "メールアドレスが登録されていません。"
                  : "メールアドレスの形式を確認してください。"
                : !canWrite
                  ? "現在の契約状態では、管理者を招待できません。"
                  : isFree && !freeEligibility
                    ? "Freeの管理者交代の対象にできません。"
                    : undefined;
      candidates.push({
        personId: person._id,
        name: person.name,
        contactEmail: person.email,
        canSelect: disabledReason === undefined,
        ...(disabledReason ? { disabledReason } : {}),
      });
    }
    candidates.sort(
      (left, right) => left.name.localeCompare(right.name, "ja") || left.personId.localeCompare(right.personId),
    );
    return { kind: "ready" as const, candidates };
  },
});
