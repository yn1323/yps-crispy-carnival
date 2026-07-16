import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { formatDateTimeJa, todayJST } from "../_lib/dateFormat";
import { managerQuery } from "../_lib/functions";
import {
  deriveOrganizationBillingPolicy,
  getEffectiveRestrictedBillingState,
  ORGANIZATION_PLAN_LIMITS,
  type OrganizationPersonUsageInput,
  projectFreeUsage,
  projectOrganizationUsage,
} from "../organizationBilling/policy";
import {
  getOrganizationInvitationPurpose,
  resolveFreeManagerExchangeEligibility,
  resolveOrganizationInvitationEligibility,
} from "../organizationInvitation/service";
import { getOrganizationBillingState, organizationPersonCountsTowardPeopleLimit } from "./service";
import { organizationShopOperatingStatusValidator } from "./validators";

const organizationPersonViewValidator = v.object({
  id: v.string(),
  name: v.string(),
  email: v.union(v.string(), v.null()),
  managerRole: v.union(v.literal("active"), v.literal("readOnly"), v.literal("none")),
  isStaff: v.boolean(),
  shopNames: v.array(v.string()),
  currentShopStaffId: v.union(v.string(), v.null()),
  canRemoveFromCurrentShop: v.boolean(),
  removeFromCurrentShopDisabledReason: v.optional(v.string()),
  canRemoveManagerRole: v.boolean(),
  managerRoleRemovalDisabledReason: v.optional(v.string()),
  countsTowardPeopleLimit: v.boolean(),
  futureAssignments: v.array(
    v.object({
      date: v.string(),
      startTime: v.string(),
      endTime: v.string(),
      shopName: v.string(),
      periodStart: v.string(),
      periodEnd: v.string(),
    }),
  ),
  hasMoreFutureAssignments: v.boolean(),
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
  status: organizationShopOperatingStatusValidator,
  isFreeRetainedShop: v.boolean(),
  canArchive: v.boolean(),
  canReactivate: v.boolean(),
  actionDisabledReason: v.optional(v.string()),
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

const freeSelectionSummaryValidator = v.object({
  selectedManagerId: v.union(v.string(), v.null()),
  selectedManagerName: v.union(v.string(), v.null()),
  selectedShopId: v.union(v.string(), v.null()),
  selectedShopName: v.union(v.string(), v.null()),
  managerCandidates: v.array(v.object({ id: v.string(), name: v.string(), projectedPeopleCount: v.number() })),
  shopCandidates: v.array(v.object({ id: v.string(), name: v.string() })),
  projectedPeopleCount: v.number(),
  readOnlyManagerNames: v.array(v.string()),
  suspendedShopNames: v.array(v.string()),
  isComplete: v.boolean(),
  incompleteReason: v.optional(v.string()),
});

const organizationSettingsValidator = v.object({
  organizationName: v.string(),
  currentShopName: v.string(),
  people: v.array(organizationPersonViewValidator),
  managerInvitations: v.array(managerInvitationViewValidator),
  shops: v.array(organizationShopViewValidator),
  billing: billingViewValidator,
  freeSelection: freeSelectionSummaryValidator,
  canInviteManager: v.boolean(),
  managerInvitationMode: v.union(v.literal("addition"), v.literal("freeManagerExchange")),
  freeManagerExchangeCandidates: v.array(v.object({ id: v.string(), name: v.string(), email: v.string() })),
  inviteManagerDisabledReason: v.optional(v.string()),
  canUpdateOrganizationName: v.boolean(),
  updateOrganizationNameDisabledReason: v.optional(v.string()),
  canAddShop: v.boolean(),
  addShopDisabledReason: v.optional(v.string()),
});

type ManagerRole = "active" | "readOnly" | "none";
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
  const migrationReason = "事業者単位の設定を移行しています。完了するまで既存データを閲覧できます。";
  return {
    organizationName: shop.name,
    currentShopName: shop.name,
    people: [
      {
        id: user._id,
        name: user.name,
        email: user.email,
        managerRole: "active" as const,
        isStaff: false,
        shopNames: [],
        currentShopStaffId: null,
        canRemoveFromCurrentShop: false,
        removeFromCurrentShopDisabledReason: migrationReason,
        canRemoveManagerRole: false,
        managerRoleRemovalDisabledReason: migrationReason,
        countsTowardPeopleLimit: true,
        futureAssignments: [],
        hasMoreFutureAssignments: false,
        canRemove: false,
        removeDisabledReason: migrationReason,
      },
    ],
    managerInvitations: [],
    shops: [
      {
        id: shop._id,
        name: shop.name,
        status: shop.operatingStatus ?? ("active" as const),
        isFreeRetainedShop: false,
        canArchive: false,
        canReactivate: false,
        actionDisabledReason: migrationReason,
      },
    ],
    billing: {
      state: "migrationPending" as const,
      currentPlan: null,
      isComplimentary: false,
      peopleUsage: { current: 1, max: 0 },
      shopUsage: { current: shop.operatingStatus === "archived" ? 0 : 1, max: 0 },
      blockedReason: "事業者単位のプラン設定を移行しています。完了後に利用状態を再確認します。",
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
    freeSelection: {
      selectedManagerId: null,
      selectedManagerName: null,
      selectedShopId: null,
      selectedShopName: null,
      managerCandidates: [],
      shopCandidates: [],
      projectedPeopleCount: 1,
      readOnlyManagerNames: [],
      suspendedShopNames: [],
      isComplete: false,
      incompleteReason: "設定の移行が完了してからFreeの構成を選択できます。",
    },
    canInviteManager: false,
    managerInvitationMode: "addition" as const,
    freeManagerExchangeCandidates: [],
    inviteManagerDisabledReason: migrationReason,
    canUpdateOrganizationName: false,
    updateOrganizationNameDisabledReason: migrationReason,
    canAddShop: false,
    addShopDisabledReason: migrationReason,
  };
}

function restrictedBlockedReason(state: Extract<Doc<"organizationBillingStates">["state"], { kind: "restricted" }>) {
  switch (state.reason) {
    case "trialFreeConditionsNotMet":
    case "freeConditionsNotMet":
      return "Freeの利用人数または店舗数を超えています。利用者削除や店舗アーカイブ後に再確認してください。";
    case "paymentGraceExpired":
      return "支払い猶予が終了しています。支払い方法を更新するか、Freeで残す構成を整理してください。";
    case "paymentActivationFailed":
      return "有料契約の支払いを確認できませんでした。再契約するか、Freeで残す構成を整理してください。";
    case "unexpectedCancellation":
      return "契約状態を確認できません。再契約するか、Freeで残す構成を整理してください。";
  }
}

export const getSettings = managerQuery({
  args: {},
  returns: v.union(organizationSettingsValidator, v.null()),
  handler: async (ctx) => {
    if (!ctx.user || !ctx.shop) return null;
    if (!ctx.organization) return legacyMigrationPendingSettings(ctx.user, ctx.shop);

    const organization = ctx.organization;
    const currentShopId = ctx.shop._id;
    const currentShopStatus = ctx.shop.operatingStatus ?? "active";
    const now = Date.now();
    const [peopleDocs, memberDocs, shopDocs, invitationDocs, staffDocs, billingState] = await Promise.all([
      ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", organization._id))
        .collect(),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organization._id))
        .collect(),
      ctx.db
        .query("shops")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organization._id))
        .collect(),
      ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organization._id))
        .order("desc")
        .take(100),
      ctx.db
        .query("staffs")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organization._id))
        .collect(),
      getOrganizationBillingState(ctx, organization._id),
    ]);

    const people = peopleDocs.filter((person) => person.status === "active");
    const shops = shopDocs.filter((shop) => !shop.isDeleted);
    const shopById = new Map(shops.map((shop) => [shop._id, shop]));
    const memberUsers = await Promise.all(memberDocs.map(async (member) => await ctx.db.get(member.userId)));
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

    const managerRoleByPersonId = new Map<Id<"organizationPeople">, ManagerRole>();
    for (const person of people) {
      const members = membersByPersonId.get(person._id) ?? [];
      const member = members.length === 1 ? members[0] : null;
      const memberUser = member ? memberUserById.get(member.userId) : null;
      const memberMatchesPerson =
        member && person.userId && member.userId === person.userId && memberUser && !memberUser.isDeleted;
      managerRoleByPersonId.set(
        person._id,
        memberMatchesPerson && member.status === "active"
          ? "active"
          : memberMatchesPerson && member.status === "readOnly"
            ? "readOnly"
            : "none",
      );
    }

    const usageInputs: OrganizationPersonUsageInput[] = people.map((person) => ({
      personId: person._id,
      isActiveInOrganization: true,
      isStaff: (staffRowsByPersonId.get(person._id)?.length ?? 0) > 0,
      managerRole: managerRoleByPersonId.get(person._id) ?? "none",
    }));
    const reservedPersonCount = invitationDocs.filter(
      (invitation) => invitation.status === "pending" && invitation.reservedSeat && invitation.expiresAt > now,
    ).length;
    const usage = projectOrganizationUsage({ people: usageInputs, reservedPersonCount });
    const activeShopCount = shops.filter((shop) => (shop.operatingStatus ?? "active") === "active").length;
    const policy = billingState ? deriveOrganizationBillingPolicy(billingState.state) : null;
    const isComplimentary = billingState?.state.kind === "complimentary";
    const restrictedState = billingState ? getEffectiveRestrictedBillingState(billingState.state) : null;
    const isActiveActor = ctx.organizationMember?.status === "active";
    const isRestrictedRecovery = Boolean(
      restrictedState &&
        ctx.organizationMember &&
        restrictedState.recoveryManagerPersonIds.includes(ctx.organizationMember.personId),
    );
    const canWriteNormally = Boolean(isActiveActor && policy?.canWriteBusinessData);
    const activeManagerCount = usage.activeManagerCount;
    const usageLimits = restrictedState ? ORGANIZATION_PLAN_LIMITS.free : policy?.limits;

    const canInviteManagerAddition = Boolean(
      isActiveActor &&
        policy?.canUsePaidFeatures &&
        policy.limits &&
        activeManagerCount < policy.limits.maxActiveManagers,
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
    const activeFreeManagerExchangeInvitations = invitationDocs.filter(
      (invitation) =>
        invitation.status === "pending" &&
        invitation.expiresAt > now &&
        getOrganizationInvitationPurpose(invitation) === "freeManagerExchange",
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
        const isExpired = invitation.status === "pending" && invitation.expiresAt <= now;
        const currentVersionOutbox =
          invitation.status === "pending"
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
          invitation.status === "pending" &&
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
          invitation.status === "pending" &&
            (currentVersionOutbox?.status === "failed" ||
              (currentVersionEnqueueFailure && !hasSuccessfulCurrentVersionEnqueue)),
        );
        const purpose = getOrganizationInvitationPurpose(invitation);
        const canRetryStatus = invitation.status === "pending" || invitation.status === "expired";
        const eligibility = canRetryStatus ? await resolveOrganizationInvitationEligibility(ctx, invitation) : null;
        const hasOtherPendingFreeExchange = activeFreeManagerExchangeInvitations.some(
          (candidate) => candidate._id !== invitation._id,
        );
        const matchingPeople = peopleDocs.filter((person) => person.emailNormalized === invitation.emailNormalized);
        const existingPerson =
          matchingPeople.length === 1 && matchingPeople[0].status === "active" ? matchingPeople[0] : null;
        const existingPersonCounts = existingPerson
          ? await organizationPersonCountsTowardPeopleLimit(ctx, organization._id, existingPerson._id)
          : false;
        const reservationAlreadyCounted =
          invitation.status === "pending" && invitation.expiresAt > now && invitation.reservedSeat;
        const canFitResentPerson = Boolean(
          policy?.limits &&
            (existingPersonCounts ||
              usage.projectedPeopleCount + (reservationAlreadyCounted ? 0 : 1) <= policy.limits.maxPeople),
        );
        const hasTargetConflict = Boolean(
          canRetryStatus &&
            (matchingPeople.length > 1 ||
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
            policy?.limits &&
            (activeManagerCount >= policy.limits.maxActiveManagers || !canFitResentPerson),
        );
        const canResend = Boolean(
          canRetryStatus &&
            eligibility &&
            (purpose === "freeManagerExchange"
              ? !hasOtherPendingFreeExchange && freeManagerExchangeCandidateEmails.has(invitation.emailNormalized)
              : canInviteManagerAddition &&
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
                : invitation.status;
        const statusDetail =
          status === "expired"
            ? "有効期限が切れました。再送すると新しいURLを発行します。"
            : status === "sendFailed"
              ? "メールを送信できませんでした。アドレスを確認して再送してください。"
              : status === "limitReached"
                ? "現在のプラン上限に達しているため、この招待を承認できません。利用状況またはプランを確認してください。"
                : status === "conflict"
                  ? "招待後に利用者または契約の状態が変わりました。この招待を取り消して内容を確認してください。"
                  : status === "pending" && purpose === "freeManagerExchange"
                    ? "承認が完了するまでは、現在の管理者が操作を継続します。"
                    : undefined;
        return {
          id: invitation._id,
          email: invitation.email,
          status,
          ...(statusDetail ? { statusDetail } : {}),
          ...(invitation.status === "pending" ? { expiresAt: formatDateTimeJa(invitation.expiresAt) } : {}),
          canResend,
          canRevoke: canRevokeInvitation && !isExpired && invitation.status === "pending",
        };
      }),
    );

    const recoveryPersonIds = restrictedState
      ? restrictedState.recoveryManagerPersonIds.filter((personId) => people.some((person) => person._id === personId))
      : [];
    const sourceManagerPersonIds = restrictedState
      ? recoveryPersonIds
      : people.filter((person) => managerRoleByPersonId.get(person._id) === "active").map((person) => person._id);
    const sourceShopIds = restrictedState
      ? restrictedState.previousActiveShopIds.filter((shopId) => {
          const shop = shopById.get(shopId);
          return shop && (shop.operatingStatus ?? "active") !== "archived";
        })
      : shops.filter((shop) => (shop.operatingStatus ?? "active") === "active").map((shop) => shop._id);
    const selectedManagerPersonId =
      billingState?.freeManagerPersonId && sourceManagerPersonIds.includes(billingState.freeManagerPersonId)
        ? billingState.freeManagerPersonId
        : null;
    const requestedFreeShopId =
      billingState?.freeShopId && sourceShopIds.includes(billingState.freeShopId) ? billingState.freeShopId : null;
    const selectedFreeShopId = requestedFreeShopId ?? (sourceShopIds.length === 1 ? sourceShopIds[0] : null);
    const freeProjectionInputs = usageInputs.map((input) => ({
      ...input,
      managerRole:
        selectedManagerPersonId && input.personId === selectedManagerPersonId
          ? ("active" as const)
          : sourceManagerPersonIds.includes(input.personId as Id<"organizationPeople">)
            ? ("readOnly" as const)
            : input.managerRole,
    }));
    const freeProjection = projectFreeUsage(freeProjectionInputs, selectedManagerPersonId);
    const managerCandidates = sourceManagerPersonIds.flatMap((personId) => {
      const person = people.find((candidate) => candidate._id === personId);
      if (!person) return [];
      const candidateProjectionInputs = usageInputs.map((input) => ({
        ...input,
        managerRole:
          input.personId === personId
            ? ("active" as const)
            : sourceManagerPersonIds.includes(input.personId as Id<"organizationPeople">)
              ? ("readOnly" as const)
              : input.managerRole,
      }));
      return [
        {
          id: personId,
          name: person.name,
          projectedPeopleCount: projectFreeUsage(candidateProjectionInputs, personId).projectedPeopleCount,
        },
      ];
    });
    const shopCandidates = sourceShopIds.flatMap((shopId) => {
      const shop = shopById.get(shopId);
      return shop ? [{ id: shopId, name: shop.name }] : [];
    });
    const freeSelectionIsComplete = Boolean(
      selectedManagerPersonId &&
        (sourceShopIds.length === 0 || selectedFreeShopId) &&
        freeProjection.projectedPeopleCount <= ORGANIZATION_PLAN_LIMITS.free.maxPeople,
    );
    const incompleteReason = !selectedManagerPersonId
      ? "Freeで残す管理者を1名選択してください。"
      : sourceShopIds.length > 0 && !selectedFreeShopId
        ? "Freeで残す店舗を1店舗選択してください。"
        : freeProjection.projectedPeopleCount > ORGANIZATION_PLAN_LIMITS.free.maxPeople
          ? "Freeの利用人数上限を超えています。事業者から利用者を削除してください。"
          : undefined;
    const freeSelection = {
      selectedManagerId: selectedManagerPersonId,
      selectedManagerName: people.find((person) => person._id === selectedManagerPersonId)?.name ?? null,
      selectedShopId: selectedFreeShopId,
      selectedShopName: selectedFreeShopId ? (shopById.get(selectedFreeShopId)?.name ?? null) : null,
      managerCandidates,
      shopCandidates,
      projectedPeopleCount: freeProjection.projectedPeopleCount,
      readOnlyManagerNames: sourceManagerPersonIds
        .filter((personId) => personId !== selectedManagerPersonId)
        .flatMap((personId) => {
          const person = people.find((candidate) => candidate._id === personId);
          return person ? [person.name] : [];
        }),
      suspendedShopNames: sourceShopIds
        .filter((shopId) => shopId !== selectedFreeShopId)
        .flatMap((shopId) => {
          const shop = shopById.get(shopId);
          return shop ? [shop.name] : [];
        }),
      isComplete: freeSelectionIsComplete,
      ...(incompleteReason ? { incompleteReason } : {}),
    };

    const futureAssignmentsByPersonId = new Map<
      Id<"organizationPeople">,
      {
        assignments: Array<{
          date: string;
          startTime: string;
          endTime: string;
          shopName: string;
          periodStart: string;
          periodEnd: string;
        }>;
        hasMore: boolean;
      }
    >();
    const futureAssignmentPreviewLimit = 10;
    const today = todayJST();
    for (const [personId, staffRows] of staffRowsByPersonId) {
      const assignmentsForPerson: Array<{
        date: string;
        startTime: string;
        endTime: string;
        shopName: string;
        periodStart: string;
        periodEnd: string;
      }> = [];
      let hasMore = false;
      for (const staff of staffRows) {
        const assignments = ctx.db
          .query("shiftAssignments")
          .withIndex("by_staffId_and_date", (q) => q.eq("staffId", staff._id).gte("date", today));
        for await (const assignment of assignments) {
          const recruitment = await ctx.db.get(assignment.recruitmentId);
          const assignmentShop = recruitment ? shopById.get(recruitment.shopId) : undefined;
          if (!recruitment || recruitment.isDeleted || !assignmentShop) continue;
          if (assignmentsForPerson.length >= futureAssignmentPreviewLimit) {
            hasMore = true;
            break;
          }
          assignmentsForPerson.push({
            date: assignment.date,
            startTime: assignment.startTime,
            endTime: assignment.endTime,
            shopName: assignmentShop.name,
            periodStart: recruitment.periodStart,
            periodEnd: recruitment.periodEnd,
          });
        }
        if (hasMore) break;
      }
      if (assignmentsForPerson.length > 0) {
        assignmentsForPerson.sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.startTime.localeCompare(b.startTime) ||
            a.shopName.localeCompare(b.shopName, "ja"),
        );
        futureAssignmentsByPersonId.set(personId, { assignments: assignmentsForPerson, hasMore });
      }
    }

    const canRemoveNormally = canWriteNormally;
    const billingEmailNormalized = (organization.billingEmailNormalized ?? organization.billingEmail ?? "")
      .trim()
      .toLowerCase();
    const peopleView = people
      .map((person) => {
        const managerRole = managerRoleByPersonId.get(person._id) ?? "none";
        const staffRows = staffRowsByPersonId.get(person._id) ?? [];
        const isStaff = staffRows.some((staff) => !staff.isDeleted);
        const currentShopStaffRows = staffRows.filter((staff) => !staff.isDeleted && staff.shopId === currentShopId);
        const currentShopStaffId = currentShopStaffRows.length === 1 ? currentShopStaffRows[0]._id : null;
        const canRemoveFromCurrentShop = Boolean(
          currentShopStaffId && currentShopStatus === "active" && canRemoveNormally,
        );
        const removeFromCurrentShopDisabledReason = canRemoveFromCurrentShop
          ? undefined
          : currentShopStaffRows.length > 1
            ? "店舗所属を一意に確認できません。"
            : currentShopStaffRows.length === 0
              ? undefined
              : currentShopStatus === "archived"
                ? "アーカイブ済み店舗の所属は変更できません。再稼働してから操作してください。"
                : currentShopStatus === "planSuspended"
                  ? "プラン停止中店舗の所属は変更できません。"
                  : !isActiveActor
                    ? "閲覧のみの管理者は店舗所属を変更できません。"
                    : "現在の契約状態では店舗所属を変更できません。";
        const isLastActiveManager = managerRole === "active" && activeManagerCount <= 1;
        const isRecoveryManager = Boolean(restrictedState && recoveryPersonIds.includes(person._id));
        const isLastRecoveryManager = isRecoveryManager && recoveryPersonIds.length <= 1;
        const isBillingContact =
          billingEmailNormalized.length > 0 && billingEmailNormalized === person.emailNormalized.trim().toLowerCase();
        const futureAssignmentInfo = futureAssignmentsByPersonId.get(person._id);
        const futureAssignments = futureAssignmentInfo?.assignments ?? [];
        const hasFutureAssignment = futureAssignments.length > 0;
        const canRemove =
          (canRemoveNormally || isRestrictedRecovery) &&
          !isLastActiveManager &&
          !isLastRecoveryManager &&
          !isBillingContact &&
          !hasFutureAssignment;
        const canRemoveManagerRole = Boolean(
          managerRole === "active" &&
            activeManagerCount > 1 &&
            canWriteNormally &&
            policy?.canUsePaidFeatures &&
            (isStaff || (!isBillingContact && !hasFutureAssignment)),
        );
        const managerRoleRemovalDisabledReason =
          managerRole !== "active" || canRemoveManagerRole
            ? undefined
            : activeManagerCount <= 1
              ? "最後の有効管理者の管理者権限は外せません。"
              : !isActiveActor
                ? "閲覧のみの管理者は管理者権限を変更できません。"
                : restrictedState
                  ? "契約制限中は管理者権限を外せません。"
                  : policy?.paidFeatureBlockReason === "freePlan"
                    ? "Freeでは管理者の個別解除はできません。管理者交代を利用してください。"
                    : policy?.paidFeatureBlockReason === "paymentResultPending"
                      ? "支払い結果が確定してから管理者権限を変更できます。"
                      : !isStaff && isBillingContact
                        ? "請求先メールアドレスを変更してから管理者権限を外してください。"
                        : !isStaff && hasFutureAssignment
                          ? "将来のシフト割当を解除してから管理者権限を外してください。"
                          : "現在の契約状態では管理者権限を変更できません。";
        const removeDisabledReason = canRemove
          ? undefined
          : isLastRecoveryManager
            ? "最後の復旧担当者は、引き継ぎまたは契約復旧まで削除できません。"
            : isLastActiveManager
              ? "最後の有効管理者は削除できません。"
              : isBillingContact
                ? "請求先メールアドレスを変更してから削除してください。"
                : hasFutureAssignment
                  ? "将来のシフト割当を解除してから削除してください。"
                  : isRestrictedRecovery
                    ? "現在の契約状態ではこの利用者を削除できません。"
                    : !isActiveActor
                      ? "閲覧のみの管理者は利用者を削除できません。"
                      : "現在の契約状態では利用者を削除できません。";
        const shopNames = staffRows
          .filter((staff) => !staff.isDeleted && shopById.has(staff.shopId))
          .flatMap((staff) => {
            const shop = shopById.get(staff.shopId);
            return shop ? [shop.name] : [];
          })
          .filter((name, index, all) => all.indexOf(name) === index)
          .sort((a, b) => a.localeCompare(b, "ja"));
        return {
          id: person._id,
          name: person.name,
          email: person.email || null,
          managerRole,
          isStaff,
          shopNames,
          currentShopStaffId,
          canRemoveFromCurrentShop,
          ...(removeFromCurrentShopDisabledReason ? { removeFromCurrentShopDisabledReason } : {}),
          canRemoveManagerRole,
          ...(managerRoleRemovalDisabledReason ? { managerRoleRemovalDisabledReason } : {}),
          // 店舗から外しただけの人物も事業者に残るため、過去のstaff rowがあれば利用人数へ含め続ける。
          countsTowardPeopleLimit: staffRows.length > 0 || managerRole === "active",
          futureAssignments,
          hasMoreFutureAssignments: futureAssignmentInfo?.hasMore ?? false,
          canRemove,
          ...(removeDisabledReason ? { removeDisabledReason } : {}),
        };
      })
      .sort(
        (a, b) =>
          Number(b.managerRole === "active") - Number(a.managerRole === "active") ||
          Number(b.managerRole === "readOnly") - Number(a.managerRole === "readOnly") ||
          a.name.localeCompare(b.name, "ja"),
      );

    const shopActionReason = (status: "active" | "archived" | "planSuspended", canPerform: boolean) => {
      if (canPerform) return undefined;
      if (!billingState) return "事業者単位のプラン設定を移行しています。完了までお待ちください。";
      if (!isActiveActor && !isRestrictedRecovery) return "閲覧のみの管理者は店舗の状態を変更できません。";
      if (restrictedState) {
        return status === "active"
          ? "契約の復旧担当者だけが店舗をアーカイブできます。"
          : "契約制限中は店舗を再稼働できません。";
      }
      if (!policy?.canWriteBusinessData) return "支払い結果が確定するまで店舗の状態を変更できません。";
      return "稼働店舗数が現在のプラン上限に達しています。別の店舗をアーカイブしてください。";
    };
    const shopsView = shops
      .map((shop) => {
        const status = shop.operatingStatus ?? "active";
        const canArchive = status !== "archived" && (canWriteNormally || isRestrictedRecovery);
        const canReactivate = Boolean(
          status !== "active" &&
            canWriteNormally &&
            policy?.limits &&
            activeShopCount + 1 <= policy.limits.maxActiveShops,
        );
        const canPerform = status === "active" ? canArchive : canReactivate;
        const actionDisabledReason = shopActionReason(status, canPerform);
        return {
          id: shop._id,
          name: shop.name,
          status,
          isFreeRetainedShop: shop._id === selectedFreeShopId,
          canArchive,
          canReactivate,
          ...(actionDisabledReason ? { actionDisabledReason } : {}),
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
      shopUsage: { current: activeShopCount, max: usageLimits?.maxActiveShops ?? 0 },
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
        blockedReason: "事業者単位のプラン設定を移行しています。完了後に利用状態を再確認します。",
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
            nextEvent: { label: "無料体験終了", date: formatDateTimeJa(state.trialEndsAt) },
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
              date: formatDateTimeJa(state.effectiveAt),
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

    const canAddShop = Boolean(
      isActiveActor && policy?.canUsePaidFeatures && policy.limits && activeShopCount < policy.limits.maxActiveShops,
    );
    const inviteManagerDisabledReason = canInviteManager
      ? undefined
      : !billingState
        ? "事業者単位のプラン設定を移行しています。完了までお待ちください。"
        : !isActiveActor
          ? "閲覧のみの管理者は管理者を招待できません。"
          : restrictedState
            ? "契約制限中は管理者を招待できません。"
            : managerInvitationMode === "freeManagerExchange" && activeFreeManagerExchangeInvitations.length > 0
              ? "管理者交代の承認を待っています。承認前は現在の管理者が操作を継続します。"
              : managerInvitationMode === "freeManagerExchange"
                ? "Freeでは、事業者内の既存スタッフとの管理者交代だけを利用できます。"
                : policy?.paidFeatureBlockReason === "freePlan"
                  ? "Freeでは管理者を追加できません。有料プランを選択してください。"
                  : policy?.paidFeatureBlockReason === "paymentResultPending"
                    ? "支払い結果が確定してから管理者を招待できます。"
                    : "有効管理者数が現在のプラン上限に達しています。";
    const addShopDisabledReason = canAddShop
      ? undefined
      : !billingState
        ? "事業者単位のプラン設定を移行しています。完了までお待ちください。"
        : !isActiveActor
          ? "閲覧のみの管理者は店舗を追加できません。"
          : restrictedState
            ? "契約制限中は店舗を追加・再稼働できません。"
            : policy?.paidFeatureBlockReason === "freePlan"
              ? "Freeでは店舗を追加できません。有料プランを選択してください。"
              : policy?.paidFeatureBlockReason === "paymentResultPending"
                ? "支払い結果が確定してから店舗を追加できます。"
                : "稼働店舗数が現在のプラン上限に達しています。プランを確認してください。";
    const canUpdateOrganizationName = canWriteNormally;
    const updateOrganizationNameDisabledReason = canUpdateOrganizationName
      ? undefined
      : !billingState
        ? "事業者単位の設定を移行しています。完了までお待ちください。"
        : !isActiveActor
          ? "閲覧のみの管理者は事業者名を変更できません。"
          : restrictedState
            ? "契約制限中は事業者名を変更できません。"
            : "支払い結果が確定してから事業者名を変更できます。";

    return {
      organizationName: organization.name,
      currentShopName: ctx.shop.name,
      people: peopleView,
      managerInvitations,
      shops: shopsView,
      billing,
      freeSelection,
      canInviteManager,
      managerInvitationMode,
      freeManagerExchangeCandidates,
      ...(inviteManagerDisabledReason ? { inviteManagerDisabledReason } : {}),
      canUpdateOrganizationName,
      ...(updateOrganizationNameDisabledReason ? { updateOrganizationNameDisabledReason } : {}),
      canAddShop,
      ...(addShopDisabledReason ? { addShopDisabledReason } : {}),
    };
  },
});
