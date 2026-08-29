import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { formatDateJa, formatDateTimeJa } from "../_lib/dateFormat";
import { managerQuery } from "../_lib/functions";
import { resolveOrganizationPersonEmailForManagerAddition } from "../_lib/personIdentity";
import { loadShopManagerNotificationRecipientStatus } from "../_lib/shopManagerRecipients";
import { submissionPatternValidator } from "../_lib/submissionPattern";
import { normalizeEmail, requiredEmailSchema } from "../_lib/validation";
import { NOTIFICATION_DRY_RUN_MANAGER_SCAN_LIMIT } from "../constants";
import { getOrganizationPersonLineState } from "../line/service";
import { getResendDelayedFailureDeadline } from "../notificationOutbox/resendDelayedFailure";
import {
  deriveOrganizationBillingPolicy,
  ORGANIZATION_PLAN_LIMITS,
  type OrganizationPersonUsageInput,
  projectOrganizationUsage,
} from "../organizationBilling/policy";
import { getOrganizationAccessPolicy } from "../organizationBilling/service";
import {
  collectIssuedInvitationsByOrganization,
  collectLinkedInvitationsByOrganization,
  getOrganizationInvitationLifecycleStatus,
  readActiveIssuedInvitationsByOrganization,
} from "../organizationInvitation/lifecycle";
import { resolveOrganizationInvitationEligibility } from "../organizationInvitation/service";
import { getStripeBillingConfiguration } from "../organizationStripe/config";
import { getOrganizationCreationAvailability, type OrganizationCreationAvailability } from "../setup/service";
import { hasCanonicalStaffIdentity } from "../staff/service";
import { getOrganizationDeletionEligibility } from "./deletion";
import { deriveOrganizationPersonCapabilities, type ManagerRole } from "./personCapabilities";
import { organizationPersonCountsTowardPeopleLimit } from "./service";
import { getOrganizationStaffOrderScope, ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT } from "./staffOrder";

async function hasManagerInvitationDeliveryFailure(
  ctx: QueryCtx,
  outbox: Doc<"notificationOutbox"> | null | undefined,
) {
  if (!outbox) return false;
  if (outbox.status === "failed") return true;
  if (outbox.status !== "sent") return false;
  if (outbox.resendLastEventType === undefined && outbox.resendDeliveryStatus === undefined) return false;
  if (outbox.resendLastEventType !== "email.delivery_delayed" || outbox.resendDeliveryStatus !== "delivery_delayed")
    return true;

  // Deadlineがあるdelayedだけが猶予中。欠損した旧rowと期限昇格済みrowは従来どおり失敗扱いにする。
  return (await getResendDelayedFailureDeadline(ctx, outbox._id)) === null;
}

const organizationPersonViewValidator = v.object({
  id: v.string(),
  name: v.string(),
  email: v.union(v.string(), v.null()),
  managerRole: v.union(v.literal("active"), v.literal("none")),
  isStaff: v.boolean(),
  isLineConnected: v.boolean(),
  lineStatus: v.union(v.literal("unlinked"), v.literal("linked_following"), v.literal("linked_unfollowed")),
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
  managerNotificationRecipientStatus: v.union(v.literal("available"), v.literal("none"), v.literal("unknown")),
  canUpdateSettings: v.boolean(),
  settingsDisabledReason: v.optional(v.string()),
  canDelete: v.boolean(),
  deleteDisabledReason: v.optional(v.string()),
});

const billingPlanValidator = v.union(v.literal("trial"), v.literal("free"), v.literal("standard"), v.literal("pro"));

export const billingViewValidator = v.object({
  state: v.union(
    v.literal("trial"),
    v.literal("free"),
    v.literal("standard"),
    v.literal("pro"),
    v.literal("initialPaymentPending"),
    v.literal("pendingActivation"),
    v.literal("scheduledChange"),
    v.literal("migrationPending"),
  ),
  currentPlan: v.union(billingPlanValidator, v.null()),
  isComplimentary: v.boolean(),
  hasTrialContinuation: v.boolean(),
  trialEndsAt: v.optional(v.number()),
  stripeBillingAvailable: v.boolean(),
  hasStripeCustomer: v.boolean(),
  targetPlan: v.optional(v.union(v.literal("free"), v.literal("standard"), v.literal("pro"))),
  restrictAtPeriodEnd: v.optional(v.literal(true)),
  peopleUsage: v.object({ current: v.number(), max: v.number(), pendingInvitations: v.number() }),
  shopUsage: v.object({ current: v.number(), max: v.number(), pendingInvitations: v.number() }),
  managerUsage: v.object({ current: v.number(), max: v.number(), pendingInvitations: v.number() }),
  requiredReductions: v.object({ people: v.number(), shops: v.number(), managers: v.number() }),
  nextEvent: v.optional(v.object({ label: v.string(), date: v.string() })),
  blockedReason: v.optional(v.string()),
  billingEmail: v.string(),
  paymentFailure: v.optional(v.object({ terminationPending: v.boolean() })),
  canManagePlan: v.boolean(),
  canUpdatePaymentMethod: v.boolean(),
  canUpdateBillingEmail: v.boolean(),
  canScheduleFree: v.boolean(),
  managePlanDisabledReason: v.optional(v.string()),
  paymentMethodDisabledReason: v.optional(v.string()),
  billingEmailDisabledReason: v.optional(v.string()),
});

export const organizationSettingsValidator = v.object({
  organizationId: v.optional(v.id("organizations")),
  organizationUpdatedAt: v.optional(v.number()),
  organizationName: v.string(),
  people: v.array(organizationPersonViewValidator),
  managerInvitations: v.array(managerInvitationViewValidator),
  shops: v.array(organizationShopViewValidator),
  billing: billingViewValidator,
  canInviteManager: v.boolean(),
  inviteManagerDisabledReason: v.optional(v.string()),
  canUpdateOrganizationName: v.boolean(),
  updateOrganizationNameDisabledReason: v.optional(v.string()),
  canAddShop: v.boolean(),
  addShopDisabledReason: v.optional(v.string()),
  canDeleteOrganization: v.boolean(),
  deleteOrganizationDisabledReason: v.optional(v.string()),
  canCreateOrganization: v.boolean(),
  createOrganizationDisabledReason: v.optional(v.string()),
});

type BillingPlan = "trial" | "free" | "standard" | "pro";

type BillingView = {
  state: BillingPlan | "initialPaymentPending" | "pendingActivation" | "scheduledChange" | "migrationPending";
  currentPlan: BillingPlan | null;
  isComplimentary: boolean;
  hasTrialContinuation: boolean;
  trialEndsAt?: number;
  stripeBillingAvailable: boolean;
  hasStripeCustomer: boolean;
  targetPlan?: Exclude<BillingPlan, "trial">;
  restrictAtPeriodEnd?: true;
  peopleUsage: { current: number; max: number; pendingInvitations: number };
  shopUsage: { current: number; max: number; pendingInvitations: number };
  managerUsage: { current: number; max: number; pendingInvitations: number };
  requiredReductions: { people: number; shops: number; managers: number };
  nextEvent?: { label: string; date: string };
  blockedReason?: string;
  billingEmail: string;
  paymentFailure?: { terminationPending: boolean };
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
        lineStatus: "unlinked" as const,
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
        managerNotificationRecipientStatus: "unknown" as const,
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
  };
}

type CanonicalOrganizationSettingsCtx = QueryCtx & {
  user: Doc<"users">;
  organization: Doc<"organizations">;
  organizationMember: Doc<"organizationMembers">;
};

/** canonical organization actorから設定DTOを組み立てる。app用queryと旧shop入口で同じ表示契約を共有する。 */
export async function getCanonicalOrganizationSettings(ctx: CanonicalOrganizationSettingsCtx) {
  // 新しい組織を作れるかは選択中組織の課金状態や所属状態と独立しており、利用者単位で決まる。
  const creationAvailability = await getOrganizationCreationAvailability(ctx, ctx.user);
  const organization = ctx.organization;
  const now = Date.now();
  const [
    peopleDocs,
    activeMembers,
    shops,
    pendingInvitations,
    acceptedInvitations,
    revokedInvitations,
    expiredInvitations,
    accessPolicy,
    stripeCustomer,
    latestStripeSubscription,
  ] = await Promise.all([
    ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", organization._id))
      .collect(),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organization._id).eq("status", "active"))
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
    getOrganizationAccessPolicy(ctx, organization._id),
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
  const billingState = accessPolicy?.billingState ?? null;
  const people = peopleDocs.filter((person) => person.status === "active");
  const staffOrderScope = await getOrganizationStaffOrderScope(ctx, { organizationId: organization._id });
  let organizationStaffOrderRank: Map<string, number> | null = null;
  if (staffOrderScope.mode === "ordered") {
    const orderEntries = await ctx.db
      .query("organizationStaffOrderEntries")
      .withIndex("by_organizationId_and_displayOrder", (q) => q.eq("organizationId", organization._id))
      .take(ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT + 1);
    const activePersonIds = new Set(people.map((person) => person._id));
    if (
      orderEntries.length === people.length &&
      orderEntries.every((entry) => activePersonIds.has(entry.organizationPersonId))
    ) {
      organizationStaffOrderRank = new Map(
        orderEntries.map((entry) => [entry.organizationPersonId, entry.displayOrder] as const),
      );
    }
  }
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
  const memberDocs = activeMembers;
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
    if (!hasCanonicalStaffIdentity(staff) || staff.organizationId !== organization._id) continue;
    const current = staffRowsByPersonId.get(staff.organizationPersonId) ?? [];
    current.push(staff);
    staffRowsByPersonId.set(staff.organizationPersonId, current);
  }
  const lineStateByPersonId = new Map(
    await Promise.all(
      people.map(
        async (person) =>
          [
            person._id,
            await getOrganizationPersonLineState(ctx, {
              organizationId: organization._id,
              organizationPersonId: person._id,
            }),
          ] as const,
      ),
    ),
  );

  const managerRoleByPersonId = new Map<Id<"organizationPeople">, ManagerRole>();
  for (const person of people) {
    const members = membersByPersonId.get(person._id) ?? [];
    const member = members.length === 1 ? members[0] : null;
    const memberUser = member ? memberUserById.get(member.userId) : null;
    const memberMatchesPerson = Boolean(
      member && person.userId && member.userId === person.userId && memberUser && !memberUser.isDeleted,
    );
    managerRoleByPersonId.set(person._id, memberMatchesPerson && member?.status === "active" ? "active" : "none");
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
  const shopCount = shops.length;
  const policy = accessPolicy?.billingPolicy ?? null;
  const usageLimitStatus = accessPolicy?.usageLimitStatus ?? null;
  const usageLimitBlockedReason =
    usageLimitStatus?.kind === "overLimit"
      ? "現在のプランの利用上限を超えています。\n利用人数・店舗・有効管理者を上限内まで減らすと、業務操作は自動的に再開されます。"
      : usageLimitStatus?.kind === "unknown"
        ? "現在の利用数を安全に確認できないため、通常の業務操作を一時的に制限しています。\n利用人数・店舗・有効管理者を整理するか、プランを変更してください。"
        : undefined;
  const stripeBillingConfiguration = getStripeBillingConfiguration();
  const stripeBillingAvailable = stripeBillingConfiguration.status === "ready";
  const isComplimentary = billingState?.state.kind === "complimentary";
  const hasStripeCustomer = Boolean(!isComplimentary && stripeCustomer);
  const stripeCustomerMatchesConfiguration = Boolean(
    stripeBillingConfiguration.status === "ready" && stripeCustomer?.livemode === stripeBillingConfiguration.livemode,
  );
  const isActiveActor = ctx.organizationMember?.status === "active";
  const canWriteNormally = Boolean(isActiveActor && accessPolicy?.canWriteBusinessData);
  const canRecoverUsageLimits = Boolean(isActiveActor && accessPolicy?.accessMode === "limitRecoveryOnly");
  // 購入対象の表示ではなく、現在のentitlementを利用上限の根拠にする。
  const usageLimits = policy?.limits;
  const activeManagerCount = usage.activeManagerCount;
  const pendingManagerInvitationCount = pendingInvitations.filter((invitation) => invitation.expiresAt > now).length;
  const projectedActiveManagerCount = activeManagerCount + pendingManagerInvitationCount;
  const canInviteManagerAddition = Boolean(
    isActiveActor &&
      canWriteNormally &&
      policy?.canManageManagers &&
      policy.limits &&
      projectedActiveManagerCount < policy.limits.maxActiveManagers,
  );
  const invitedPersonIds = new Set(
    pendingInvitations.flatMap((invitation) =>
      invitation.expiresAt > now && invitation.targetPersonId ? [invitation.targetPersonId] : [],
    ),
  );
  const canInviteManager = canInviteManagerAddition;
  const canRevokeInvitation = Boolean(isActiveActor && (canWriteNormally || canRecoverUsageLimits));
  const managerAdditionPersonResolutionByEmail = new Map<
    string,
    ReturnType<typeof resolveOrganizationPersonEmailForManagerAddition>
  >();
  const resolveManagerAdditionPersonByEmail = (emailNormalized: string) => {
    const cached = managerAdditionPersonResolutionByEmail.get(emailNormalized);
    if (cached) return cached;
    const resolution = resolveOrganizationPersonEmailForManagerAddition(ctx, {
      organizationId: organization._id,
      emailNormalized,
    });
    managerAdditionPersonResolutionByEmail.set(emailNormalized, resolution);
    return resolution;
  };
  const managerInvitations = await Promise.all(
    invitationDocs.map(async (invitation) => {
      const lifecycleStatus = getOrganizationInvitationLifecycleStatus(invitation);
      const isExpired = lifecycleStatus === "expired" || (lifecycleStatus === "issued" && invitation.expiresAt <= now);
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
        lifecycleStatus === "issued" && currentVersionOutbox?.status !== "failed" && !hasSuccessfulCurrentVersionEnqueue
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
          ((await hasManagerInvitationDeliveryFailure(ctx, currentVersionOutbox)) ||
            (currentVersionEnqueueFailure && !hasSuccessfulCurrentVersionEnqueue)),
      );
      const canRetryStatus = lifecycleStatus === "issued" || lifecycleStatus === "expired";
      const eligibility = canRetryStatus ? await resolveOrganizationInvitationEligibility(ctx, invitation) : null;
      const targetPerson = invitation.targetPersonId ? await ctx.db.get(invitation.targetPersonId) : null;
      const targetResolution = canRetryStatus
        ? await resolveManagerAdditionPersonByEmail(invitation.emailNormalized)
        : null;
      const resolvedPerson =
        targetResolution?.kind === "active" || targetResolution?.kind === "removed" ? targetResolution.person : null;
      const targetPersonMismatch = Boolean(
        canRetryStatus &&
          invitation.targetPersonId &&
          (!targetPerson ||
            targetPerson.organizationId !== organization._id ||
            targetPerson.emailNormalized !== invitation.emailNormalized ||
            resolvedPerson?._id !== targetPerson._id),
      );
      const matchingPeople = !canRetryStatus
        ? []
        : invitation.targetPersonId
          ? targetPerson && !targetPersonMismatch
            ? [targetPerson]
            : []
          : resolvedPerson
            ? [resolvedPerson]
            : [];
      const existingPerson = matchingPeople.length === 1 ? matchingPeople[0] : null;
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
      const managerReservationAlreadyCounted = lifecycleStatus === "issued" && invitation.expiresAt > now;
      const canFitResentManager = Boolean(
        policy?.limits &&
          projectedActiveManagerCount - (managerReservationAlreadyCounted ? 1 : 0) + 1 <=
            policy.limits.maxActiveManagers,
      );
      const hasTargetConflict = Boolean(
        canRetryStatus &&
          (targetPersonMismatch ||
            targetResolution?.kind === "conflict" ||
            matchingPeople.length > 1 ||
            (existingPerson && managerRoleByPersonId.get(existingPerson._id) === "active") ||
            (!eligibility && !isExpired)),
      );
      const hasCapacityConflict = Boolean(
        canRetryStatus && !hasTargetConflict && (!canFitResentManager || !canFitResentPerson),
      );
      const canResend = Boolean(
        canRevokeInvitation &&
          canRetryStatus &&
          eligibility &&
          !hasTargetConflict &&
          canFitResentManager &&
          matchingPeople.length <= 1 &&
          (!existingPerson || managerRoleByPersonId.get(existingPerson._id) !== "active") &&
          canFitResentPerson,
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
      (person) =>
        canRecoverUsageLimits ||
        staffRolePersonIds.has(person._id) ||
        (managerRoleByPersonId.get(person._id) ?? "none") !== "none",
    )
    .map((person) => {
      const managerRole = managerRoleByPersonId.get(person._id) ?? "none";
      const staffRows = staffRowsByPersonId.get(person._id) ?? [];
      const isStaff = staffRows.length > 0;
      const lineStatus = lineStateByPersonId.get(person._id)?.status ?? "unlinked";
      const isLineConnected = lineStatus !== "unlinked";
      const hasManagerInvitation = invitedPersonIds.has(person._id);
      const capabilities = deriveOrganizationPersonCapabilities({
        managerRole,
        activeManagerCount,
        canWriteNormally,
        canRecoverUsageLimits,
        policy,
        isActiveActor,
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
        lineStatus,
        hasManagerInvitation,
        shopNames,
        shopIds,
        ...capabilities,
      };
    })
    .sort((a, b) => {
      if (organizationStaffOrderRank) {
        return (
          (organizationStaffOrderRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (organizationStaffOrderRank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
        );
      }
      return (
        Number(b.managerRole === "active") - Number(a.managerRole === "active") || a.name.localeCompare(b.name, "ja")
      );
    });

  const staffCountByShopId = new Map<Id<"shops">, number>();
  for (const staff of staffDocs) {
    staffCountByShopId.set(staff.shopId, (staffCountByShopId.get(staff.shopId) ?? 0) + 1);
  }
  const canDeleteShop = Boolean(shops.length > 1 && (canWriteNormally || canRecoverUsageLimits));
  const deleteShopDisabledReason = canDeleteShop
    ? undefined
    : shops.length <= 1
      ? "組織には少なくとも1店舗が必要です。"
      : !isActiveActor
        ? "現在のアカウント状態では、店舗を削除できません。"
        : "現在の契約状態では、店舗を削除できません。";
  const shopsView = (
    await Promise.all(
      shops.map(async (shop) => {
        const canUpdateSettings = canWriteNormally;
        const settingsDisabledReason = canUpdateSettings
          ? undefined
          : !billingState
            ? "組織単位の設定を移行しています。\n完了するまでお待ちください。"
            : !isActiveActor
              ? "現在のアカウント状態では、店舗設定を変更できません。"
              : accessPolicy?.businessWriteBlockReason === "usageLimitExceeded"
                ? usageLimitBlockedReason
                : "支払い結果が確定するまで、店舗設定を変更できません。";
        const recipientStatus = await loadShopManagerNotificationRecipientStatus(
          ctx,
          shop._id,
          NOTIFICATION_DRY_RUN_MANAGER_SCAN_LIMIT,
        );
        const managerNotificationRecipientStatus =
          recipientStatus.activeRecipientCount > 0
            ? ("available" as const)
            : recipientStatus.scanComplete
              ? ("none" as const)
              : ("unknown" as const);
        return {
          id: shop._id,
          name: shop.name,
          // TODO[narrow]: 全deploymentでm039のshop workerが完走し、
          // verifyShops.missingRegularClosedDaysが0件になった後にfallbackを削除する。
          regularClosedDays: shop.regularClosedDays ?? [],
          submissionPattern: shop.submissionPattern,
          staffCount: staffCountByShopId.get(shop._id) ?? 0,
          managerNotificationRecipientStatus,
          canUpdateSettings,
          ...(settingsDisabledReason ? { settingsDisabledReason } : {}),
          canDelete: canDeleteShop,
          ...(deleteShopDisabledReason ? { deleteDisabledReason: deleteShopDisabledReason } : {}),
        };
      }),
    )
  ).sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const runtimeBillingState = billingState?.state ?? null;
  const canAccessCustomerPortal = Boolean(
    isActiveActor &&
      billingState &&
      ((billingState.state.kind === "trial" && billingState.state.selectedPaidPlan !== undefined) ||
        billingState.state.kind === "scheduledChange" ||
        (billingState.state.kind === "active" && billingState.state.plan !== "free")),
  );
  const billingCapabilities = {
    canManagePlan: Boolean(
      stripeBillingAvailable &&
        !isComplimentary &&
        isActiveActor &&
        billingState &&
        billingState.state.kind !== "initialPaymentPending" &&
        billingState.state.kind !== "pendingActivation" &&
        billingState.state.kind !== "paymentTerminationPending",
    ),
    canUpdatePaymentMethod: Boolean(
      stripeBillingAvailable && stripeCustomerMatchesConfiguration && !isComplimentary && canAccessCustomerPortal,
    ),
    canUpdateBillingEmail: Boolean(
      !isComplimentary &&
        isActiveActor &&
        billingState &&
        (billingState.state.kind !== "pendingActivation" || billingState.state.fallback === "free"),
    ),
    canScheduleFree: Boolean(
      stripeBillingAvailable &&
        !isComplimentary &&
        isActiveActor &&
        runtimeBillingState?.kind === "active" &&
        runtimeBillingState.plan !== "free",
    ),
  };
  const peopleUsageCurrent = usage.currentPeopleCount;
  const managerUsageCurrent = activeManagerCount;
  const maxPeople = usageLimits?.maxPeople ?? 0;
  const maxShops = usageLimits?.maxShops ?? 0;
  const maxManagers = usageLimits?.maxActiveManagers ?? 0;
  const requiredReductionLimits =
    runtimeBillingState?.kind === "scheduledChange"
      ? ORGANIZATION_PLAN_LIMITS[runtimeBillingState.targetPlan]
      : usageLimits;
  const billingBase = {
    peopleUsage: {
      current: peopleUsageCurrent,
      max: maxPeople,
      pendingInvitations: usage.reservedPersonCount,
    },
    shopUsage: { current: shopCount, max: maxShops, pendingInvitations: 0 },
    managerUsage: {
      current: managerUsageCurrent,
      max: maxManagers,
      pendingInvitations: pendingManagerInvitationCount,
    },
    requiredReductions: {
      people: Math.max(0, peopleUsageCurrent - (requiredReductionLimits?.maxPeople ?? 0)),
      shops: Math.max(0, shopCount - (requiredReductionLimits?.maxShops ?? 0)),
      managers: Math.max(0, managerUsageCurrent - (requiredReductionLimits?.maxActiveManagers ?? 0)),
    },
    billingEmail: organization.billingEmail ?? "",
    isComplimentary,
    stripeBillingAvailable,
    hasStripeCustomer,
    hasTrialContinuation: Boolean(
      runtimeBillingState?.kind === "trial" && runtimeBillingState.selectedPaidPlan !== undefined,
    ),
    ...(billingState?.lastPlanChange
      ? {
          paymentFailure: {
            terminationPending: billingState.state.kind === "paymentTerminationPending",
          },
        }
      : {}),
    ...billingCapabilities,
  };
  const accessDisabledReason = !isActiveActor ? "現在のアカウント状態では、この操作を行えません。" : undefined;
  const managePlanDisabledReason =
    billingCapabilities.canManagePlan || isComplimentary
      ? undefined
      : !stripeBillingAvailable
        ? "有料プランの料金は準備中です。"
        : !billingState
          ? "設定の移行が完了するまでお待ちください。"
          : (accessDisabledReason ??
            (billingState.state.kind === "initialPaymentPending"
              ? "初回支払いの結果を確認中のため、プランを変更できません。"
              : billingState.state.kind === "pendingActivation"
                ? "支払い結果を確認中のため、別のプランへは変更できません。"
                : billingState.state.kind === "paymentTerminationPending"
                  ? "支払い失敗後の契約終了処理中です。"
                  : "現在の契約状態では、プランを変更できません。"));
  const paymentMethodDisabledReason =
    billingCapabilities.canUpdatePaymentMethod || isComplimentary
      ? undefined
      : !stripeBillingAvailable
        ? "有料プランの料金は準備中です。"
        : !billingState
          ? "設定の移行が完了するまでお待ちください。"
          : (accessDisabledReason ??
            (!canAccessCustomerPortal
              ? billingState.state.kind === "trial" && !billingState.state.selectedPaidPlan
                ? "トライアル終了後の有料プラン継続を登録すると、Stripeで支払い情報を管理できます。"
                : billingState.state.kind === "initialPaymentPending"
                  ? "初回支払いの結果を確認中です。\n確定後に、Stripeで支払い情報を管理できます。"
                  : billingState.state.kind === "active" && billingState.state.plan === "free"
                    ? "Freeプランでは、支払い情報の管理は不要です。\n有料プランを契約するときに、Stripeで登録します。"
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
          // trialEndsAt は登録開始日の2か月後の同日（同日がなければ月末）の0:00 JSTを表す排他的な境界。
          // 次の予定ではトライアルを利用できる最終日を表示する。
          nextEvent: { label: "トライアル最終日", date: formatDateJa(state.trialEndsAt - 1) },
        };
        break;
      case "initialPaymentPending":
        billing = {
          ...billingBase,
          ...billingCapabilityReasons,
          state: "initialPaymentPending",
          currentPlan: "free",
          targetPlan: state.plan,
          nextEvent: { label: "支払い結果", date: "確認中" },
        };
        break;
      case "pendingActivation":
        billing = {
          ...billingBase,
          ...billingCapabilityReasons,
          state: "pendingActivation",
          currentPlan: state.fallback === "free" || state.fallback === "standard" ? state.fallback : null,
          targetPlan: state.plan,
          blockedReason:
            state.fallback === "free"
              ? "有料プランの支払い結果を確認中です。\n無料の基本機能は引き続き利用できます。"
              : "支払い結果を確認しています。\n確認が終わるまで、契約状態を変更できません。",
          nextEvent: { label: "支払い結果", date: "確認中" },
        };
        break;
      case "active":
        billing = {
          ...billingBase,
          ...billingCapabilityReasons,
          state: state.plan,
          currentPlan: state.plan,
          ...(usageLimitBlockedReason ? { blockedReason: usageLimitBlockedReason } : {}),
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
          state: "pro",
          currentPlan: "pro",
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
                  ? "契約終了日"
                  : "無料適用予定日"
                : "Standard適用予定日",
            date: formatDateJa(state.effectiveAt),
          },
        };
        break;
      case "paymentTerminationPending":
        billing = {
          ...billingBase,
          ...billingCapabilityReasons,
          state: "free",
          currentPlan: "free",
          ...(usageLimitBlockedReason ? { blockedReason: usageLimitBlockedReason } : {}),
        };
        break;
    }
  }

  const inviteManagerDisabledReason = canInviteManager
    ? undefined
    : !billingState
      ? "組織単位のプラン設定を移行しています。\n完了するまでお待ちください。"
      : !isActiveActor
        ? "現在のアカウント状態では、管理者を招待できません。"
        : accessPolicy?.businessWriteBlockReason === "usageLimitExceeded"
          ? usageLimitBlockedReason
          : policy?.paidFeatureBlockReason === "paymentResultPending"
            ? "支払い結果が確定してから、管理者を招待できます。"
            : `管理者と招待中の管理者は、組織全体で${policy?.limits?.maxActiveManagers ?? ORGANIZATION_PLAN_LIMITS.standard.maxActiveManagers}名までです。`;
  const canAddShop = Boolean(
    isActiveActor &&
      canWriteNormally &&
      policy?.canUsePaidFeatures &&
      policy.limits &&
      shopCount < policy.limits.maxShops,
  );
  const addShopDisabledReason = canAddShop
    ? undefined
    : !billingState
      ? "組織単位のプラン設定を移行しています。\n完了するまでお待ちください。"
      : !isActiveActor
        ? "現在のアカウント状態では、店舗を追加できません。"
        : accessPolicy?.businessWriteBlockReason === "usageLimitExceeded"
          ? usageLimitBlockedReason
          : policy?.paidFeatureBlockReason === "freePlan"
            ? "Freeプランでは、店舗を追加できません。\n有料プランを選択してください。"
            : policy?.paidFeatureBlockReason === "paymentResultPending"
              ? "支払い結果が確定してから、店舗を追加できます。"
              : `店舗は、組織ごとに${policy?.limits?.maxShops ?? ORGANIZATION_PLAN_LIMITS.standard.maxShops}件まで登録できます。`;
  const canUpdateOrganizationName = Boolean(isActiveActor && (!billingState || canWriteNormally));
  const updateOrganizationNameDisabledReason = canUpdateOrganizationName
    ? undefined
    : !ctx.organizationMember
      ? "組織単位の設定を移行しています。\n完了するまでお待ちください。"
      : !isActiveActor
        ? "現在のアカウント状態では、組織名を変更できません。"
        : accessPolicy?.businessWriteBlockReason === "usageLimitExceeded"
          ? usageLimitBlockedReason
          : "現在の契約状態では、組織名を変更できません。";

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
    ...(inviteManagerDisabledReason ? { inviteManagerDisabledReason } : {}),
    canUpdateOrganizationName,
    ...(updateOrganizationNameDisabledReason ? { updateOrganizationNameDisabledReason } : {}),
    canAddShop,
    ...(addShopDisabledReason ? { addShopDisabledReason } : {}),
    canDeleteOrganization: deletionEligibility.canDelete,
    ...(!deletionEligibility.canDelete ? { deleteOrganizationDisabledReason: deletionEligibility.reason } : {}),
    canCreateOrganization: creationAvailability.canCreate,
    ...(creationAvailability.canCreate ? {} : { createOrganizationDisabledReason: creationAvailability.reason }),
  };
}

export const getSettings = managerQuery({
  args: {},
  returns: v.union(organizationSettingsValidator, v.null()),
  handler: async (ctx) => {
    if (!ctx.user || !ctx.shop) return null;
    const creationAvailability = await getOrganizationCreationAvailability(ctx, ctx.user);
    if (!ctx.organization || !ctx.organizationMember) {
      return legacyMigrationPendingSettings(ctx.user, ctx.shop, creationAvailability);
    }
    return await getCanonicalOrganizationSettings({
      ...ctx,
      user: ctx.user,
      organization: ctx.organization,
      organizationMember: ctx.organizationMember,
    });
  },
});

export const managerSettingsOverviewValidator = v.union(
  v.object({ kind: v.literal("integrityError"), message: v.string() }),
  v.object({
    kind: v.literal("ready"),
    organizationName: v.string(),
    usage: v.object({
      activeManagers: v.number(),
      activeInvitationCount: v.number(),
      pendingAdditions: v.number(),
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
        role: v.literal("active"),
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

export const managerCandidatesValidator = v.union(
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
  invitations: Math.max(...Object.values(ORGANIZATION_PLAN_LIMITS).map((limits) => limits.maxActiveManagers)),
} as const;

function getManagerSettingsLimits(billingState: Doc<"organizationBillingStates">) {
  const policy = deriveOrganizationBillingPolicy(billingState.state);
  return {
    policy,
    limits: policy.limits,
  };
}

async function readBoundedManagerMembers(
  ctx: Pick<QueryCtx, "db">,
  organizationId: Id<"organizations">,
  limit: number,
) {
  const active = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
    .take(limit + 1);
  const hasOverflow = active.length > limit;
  const members = active;
  const seenPeople = new Set<Id<"organizationPeople">>();
  const seenUsers = new Set<Id<"users">>();
  const rows: Array<{ member: Doc<"organizationMembers">; person: Doc<"organizationPeople"> }> = [];
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
  return { active, rows, hasOverflow };
}

/** canonical organization actorから管理者専用のbounded DTOを組み立てる。 */
export async function getCanonicalManagerSettingsOverview(
  ctx: CanonicalOrganizationSettingsCtx,
  args: { now: number },
) {
  if (!Number.isFinite(args.now)) {
    return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
  }
  const organization = ctx.organization;
  const organizationMember = ctx.organizationMember;

  const access = await getOrganizationAccessPolicy(ctx, organization._id);
  if (!access) return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
  const billingState = access.billingState;
  const { policy, limits } = getManagerSettingsLimits(billingState);
  if (!limits) return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
  const isActiveActor = organizationMember.status === "active";
  const canWrite = Boolean(isActiveActor && access.canWriteBusinessData);
  const canRecoverUsageLimits = isActiveActor && access.accessMode === "limitRecoveryOnly";

  const [managerState, activeInvitations] = await Promise.all([
    readBoundedManagerMembers(ctx, organization._id, MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.activeManagers),
    readActiveIssuedInvitationsByOrganization(
      ctx,
      organization._id,
      args.now,
      MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.invitations,
    ),
  ]);
  if (
    !managerState ||
    managerState.active.length === 0 ||
    (managerState.hasOverflow && !canRecoverUsageLimits) ||
    (activeInvitations.hasOverflow && !canRecoverUsageLimits)
  ) {
    return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
  }
  if (managerState.active.length !== managerState.rows.filter(({ member }) => member.status === "active").length) {
    return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
  }
  const observedActiveManagerCount = Math.max(
    managerState.active.length,
    access.usageProbe?.usage.activeManagerCount ?? 0,
  );

  const pendingAdditions = activeInvitations.invitations.length;
  const projectedManagers = observedActiveManagerCount + pendingAdditions;

  const activePeople = await ctx.db
    .query("organizationPeople")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organization._id).eq("status", "active"))
    .take(MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.people + 1);
  const activePeopleHaveOverflow = activePeople.length > MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.people;
  if (activePeopleHaveOverflow && !canRecoverUsageLimits) {
    return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
  }
  const activePeopleForCapacity = activePeople.slice(0, MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.people);
  const activeManagerPersonIds = new Set(managerState.active.map((member) => member.personId));
  let peopleUsage = 0;
  for (const person of activePeopleForCapacity) {
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
  const usageLimitDisabledReason =
    access.usageLimitStatus?.kind === "unknown"
      ? "現在の利用数を安全に確認できないため、管理者を招待できません。利用人数・店舗・管理者を確認してください。"
      : "プラン上限を超過しているため、管理者を招待できません。利用人数・店舗・管理者を上限内に減らすか、プランを変更してください。";
  const inviteBaseReason = !isActiveActor
    ? "現在のアカウント状態では、管理者を招待できません。"
    : access.businessWriteBlockReason === "usageLimitExceeded"
      ? usageLimitDisabledReason
      : !access.canWriteBusinessData
        ? "現在の契約状態では変更できません。"
        : !policy.canManageManagers
          ? "現在の契約状態では、管理者を招待できません。"
          : !canFitManager
            ? `管理者と招待中の管理者は、組織全体で${limits.maxActiveManagers}名までです。`
            : undefined;
  const canInviteExistingStaff = Boolean(canWrite && policy.canManageManagers && canFitManager);
  const existingStaffDisabledReason = canInviteExistingStaff
    ? undefined
    : (inviteBaseReason ?? "現在の契約状態では、管理者を招待できません。");
  const canInviteExternal = Boolean(canWrite && policy.canManageManagers && canFitManager && canFitPerson);
  const externalDisabledReason = canInviteExternal
    ? undefined
    : !canWrite
      ? (inviteBaseReason ?? "現在の契約状態では、新しいユーザーを招待できません。")
      : !canFitPerson
        ? `利用人数は、組織全体で${limits.maxPeople}名までです。`
        : (inviteBaseReason ?? "現在の契約状態では、新しいユーザーを招待できません。");

  const managers = [];
  for (const { person } of managerState.rows) {
    const capabilities = deriveOrganizationPersonCapabilities({
      managerRole: "active",
      activeManagerCount: observedActiveManagerCount,
      canWriteNormally: canWrite,
      canRecoverUsageLimits,
      policy,
      isActiveActor,
    });
    managers.push({
      personId: person._id,
      name: person.name,
      contactEmail: person.email,
      role: "active" as const,
      isSelf: person._id === organizationMember.personId,
      canRemoveRole: capabilities.canRemoveManagerRole,
      ...(capabilities.managerRoleRemovalDisabledReason
        ? { removeRoleDisabledReason: capabilities.managerRoleRemovalDisabledReason }
        : {}),
    });
  }
  managers.sort(
    (left, right) => left.name.localeCompare(right.name, "ja") || left.personId.localeCompare(right.personId),
  );

  const invitations = [];
  for (const invitation of activeInvitations.invitations) {
    const targetPerson = invitation.targetPersonId ? await ctx.db.get(invitation.targetPersonId) : null;
    const targetResolution = await resolveOrganizationPersonEmailForManagerAddition(ctx, {
      organizationId: organization._id,
      emailNormalized: invitation.emailNormalized,
    });
    const resolvedPerson =
      targetResolution.kind === "active" || targetResolution.kind === "removed" ? targetResolution.person : null;
    const matchingPeople = invitation.targetPersonId
      ? targetPerson && resolvedPerson?._id === targetPerson._id
        ? [targetPerson]
        : []
      : resolvedPerson
        ? [resolvedPerson]
        : [];
    const effectiveTargetPerson = matchingPeople.length === 1 ? matchingPeople[0] : null;
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
      targetResolution.kind === "conflict" ||
        (invitation.targetPersonId && (!targetPerson || resolvedPerson?._id !== targetPerson._id)) ||
        (effectiveTargetPerson &&
          (effectiveTargetPerson.organizationId !== organization._id ||
            effectiveTargetPerson.emailNormalized !== invitation.emailNormalized ||
            !effectiveTargetEmail?.success ||
            normalizeEmail(effectiveTargetEmail.data) !== invitation.emailNormalized)) ||
        matchingPeople.length > 1 ||
        matchingMember.length > 1 ||
        matchingMember[0]?.status === "active",
    );
    const eligibility = targetConflict ? null : await resolveOrganizationInvitationEligibility(ctx, invitation);
    const outbox = await ctx.db
      .query("notificationOutbox")
      .withIndex("by_organizationInvitationId", (q) => q.eq("organizationInvitationId", invitation._id))
      .filter((q) => q.eq(q.field("organizationInvitationVersion"), invitation.version))
      .order("desc")
      .first();
    const deliveryFailure = (await hasManagerInvitationDeliveryFailure(ctx, outbox))
      ? true
      : Boolean(
          await ctx.db
            .query("notificationDeliveryEvents")
            .withIndex("by_organizationInvitationId_createdAt", (q) => q.eq("organizationInvitationId", invitation._id))
            .filter((q) =>
              q.and(
                q.eq(q.field("eventType"), "enqueue_failed"),
                q.eq(q.field("organizationInvitationVersion"), invitation.version),
              ),
            )
            .first(),
        );
    const limitReached = projectedManagers > limits.maxActiveManagers;
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
      name: effectiveTargetPerson?.name ?? invitation.invitedName.trim(),
      invitedEmail: invitation.email,
      status,
      expiresAt: invitation.expiresAt,
      canResend: Boolean(canWrite && status !== "conflict" && !limitReached),
      canRevoke: canWrite || canRecoverUsageLimits,
    });
  }

  return {
    kind: "ready" as const,
    organizationName: organization.name,
    usage: {
      activeManagers: observedActiveManagerCount,
      activeInvitationCount: activeInvitations.invitations.length,
      pendingAdditions,
      projectedManagers,
      maxManagers: Number(limits.maxActiveManagers),
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
}

/** canonical organization actorから既存スタッフ招待候補を組み立てる。 */
export async function getCanonicalManagerCandidates(ctx: CanonicalOrganizationSettingsCtx, args: { now: number }) {
  if (!Number.isFinite(args.now)) {
    return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
  }
  const organization = ctx.organization;
  const organizationMember = ctx.organizationMember;
  const access = await getOrganizationAccessPolicy(ctx, organization._id);
  if (!access) return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
  const billingState = access.billingState;
  const { policy, limits } = getManagerSettingsLimits(billingState);
  if (!limits) return { kind: "integrityError" as const, message: MANAGER_SETTINGS_INTEGRITY_ERROR };
  const [people, invitations, managers] = await Promise.all([
    ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organization._id).eq("status", "active"))
      .take(MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.people + 1),
    readActiveIssuedInvitationsByOrganization(
      ctx,
      organization._id,
      args.now,
      MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.invitations,
    ),
    readBoundedManagerMembers(ctx, organization._id, MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.activeManagers),
  ]);
  if (
    !managers ||
    people.length > MANAGER_SETTINGS_ABSOLUTE_READ_LIMITS.people ||
    invitations.hasOverflow ||
    managers.hasOverflow
  ) {
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
      if (shop && !shop.isDeleted && shop.organizationId === organization._id) {
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
  const canWrite = Boolean(isActiveActor && access.canWriteBusinessData);
  const pendingAdditions = invitations.invitations.length;
  const canFitManager = managers.active.length + pendingAdditions < limits.maxActiveManagers;
  const canInviteManager = Boolean(canWrite && policy.canManageManagers && canFitManager);
  const managerInvitationDisabledReason =
    access.businessWriteBlockReason === "usageLimitExceeded"
      ? "プラン上限を超過しているため、利用人数・店舗・管理者を上限内に減らすか、プランを変更してください。"
      : !canWrite || !policy.canManageManagers
        ? "現在の契約状態では、管理者を招待できません。"
        : !canFitManager
          ? `管理者と招待中の管理者は、組織全体で${limits.maxActiveManagers}名までです。`
          : undefined;

  const candidates = [];
  for (const person of people) {
    if (!activeStaffPersonIds.has(person._id)) continue;
    const member = memberByPersonId.get(person._id);
    const parsedEmail = requiredEmailSchema.safeParse(person.email);
    const hasValidEmail = parsedEmail.success && normalizeEmail(parsedEmail.data) === person.emailNormalized;
    const pending = pendingTargetIds.has(person._id) || pendingEmails.has(person.emailNormalized);
    const disabledReason =
      member?.status === "active"
        ? "すでに管理者です。"
        : pending
          ? "管理者招待の承認待ちです。"
          : !hasValidEmail
            ? person.email.trim().length === 0
              ? "メールアドレスが登録されていません。"
              : "メールアドレスの形式を確認してください。"
            : !canInviteManager
              ? managerInvitationDisabledReason
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
}
