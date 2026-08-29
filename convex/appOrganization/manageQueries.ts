import type { PaginationOptions } from "convex/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { organizationQuery } from "../_lib/functions";
import { getOrganizationDeletionEligibility } from "../organization/deletion";
import {
  billingViewValidator,
  getCanonicalManagerCandidates,
  getCanonicalManagerSettingsOverview,
  getCanonicalOrganizationSettings,
  managerCandidatesValidator,
  managerSettingsOverviewValidator,
} from "../organization/queries";
import { type CanonicalOrganizationBillingStateDocument, getOrganizationUsageSnapshot } from "../organization/service";
import { deriveOrganizationBillingPolicy, ORGANIZATION_PLAN_LIMITS } from "../organizationBilling/policy";
import { getOrganizationAccessPolicy } from "../organizationBilling/service";
import { getOrganizationCreationAvailability } from "../setup/service";

const MAX_PAGE_SIZE = 50;
const MAX_ROWS_READ = 100;
const SHOP_COUNT_LIMIT = 1_000;

const manageBillingStateValidator = v.union(
  v.literal("trial"),
  v.literal("free"),
  v.literal("standard"),
  v.literal("pro"),
  v.literal("initialPaymentPending"),
  v.literal("pendingActivation"),
  v.literal("scheduledChange"),
  v.literal("migrationPending"),
);

const manageUsageItemValidator = v.object({
  current: v.number(),
  max: v.number(),
  pendingInvitations: v.number(),
});

const manageUsageValidator = v.object({
  state: manageBillingStateValidator,
  currentPlan: v.union(v.literal("trial"), v.literal("free"), v.literal("standard"), v.literal("pro"), v.null()),
  peopleUsage: manageUsageItemValidator,
  shopUsage: manageUsageItemValidator,
  managerUsage: manageUsageItemValidator,
});

const manageOverviewValidator = v.object({
  organizationId: v.id("organizations"),
  organizationName: v.string(),
  organizationCreatedAt: v.number(),
  organizationUpdatedAt: v.number(),
  memberStatus: v.literal("active"),
  usage: manageUsageValidator,
  shopCounts: v.object({
    active: v.number(),
    archived: v.number(),
    hasOverflow: v.boolean(),
  }),
  capabilities: v.object({
    canUpdateOrganizationName: v.boolean(),
    updateOrganizationNameDisabledReason: v.optional(v.string()),
    canAddShop: v.boolean(),
    addShopDisabledReason: v.optional(v.string()),
    canDeleteOrganization: v.boolean(),
    deleteOrganizationDisabledReason: v.optional(v.string()),
    canCreateOrganization: v.boolean(),
    createOrganizationDisabledReason: v.optional(v.string()),
  }),
});

const organizationShopListItemValidator = v.object({
  shopId: v.id("shops"),
  shopName: v.string(),
  // rolling deploy中の旧client互換field。非削除店舗だけをactive固定で返す。
  operatingStatus: v.literal("active"),
});

// rolling deploy中の旧clientはstatusを送る。新clientは未指定で全非削除店舗を読む。
const shopStatusFilterValidator = v.optional(v.union(v.literal("all"), v.literal("active"), v.literal("archived")));

function boundedPaginationOptions(paginationOpts: PaginationOptions): PaginationOptions {
  if (
    !Number.isSafeInteger(paginationOpts.numItems) ||
    paginationOpts.numItems < 1 ||
    paginationOpts.numItems > MAX_PAGE_SIZE
  ) {
    throw new ConvexError(`numItems must be between 1 and ${MAX_PAGE_SIZE}`);
  }
  return {
    ...paginationOpts,
    maximumRowsRead: Math.min(paginationOpts.maximumRowsRead ?? MAX_ROWS_READ, MAX_ROWS_READ),
  };
}

/** Manage top専用。店舗実体をinlineせず、組織と利用状況・操作可否だけを返す。 */
export const getManageOverview = organizationQuery({
  args: {},
  returns: manageOverviewValidator,
  handler: async (ctx) => {
    const memberStatus = ctx.organizationMember.status;
    if (memberStatus !== "active") throw new ConvexError("Not found");
    const [access, usage, creationAvailability, shops] = await Promise.all([
      getOrganizationAccessPolicy(ctx, ctx.organization._id),
      getOrganizationUsageSnapshot(ctx, ctx.organization._id),
      getOrganizationCreationAvailability(ctx, ctx.user),
      ctx.db
        .query("shops")
        .withIndex("by_organizationId_and_isDeleted", (q) =>
          q.eq("organizationId", ctx.organization._id).eq("isDeleted", false),
        )
        .take(SHOP_COUNT_LIMIT + 1),
    ]);
    const billingState = access?.billingState ?? null;
    const policy = billingState ? deriveOrganizationBillingPolicy(billingState.state) : null;
    const limits = policy?.limits;
    const isActiveActor = memberStatus === "active";
    // billing state欠損中はm025 rolling migration互換としてserver guardと同じくfail-openにする。
    const canWriteBusinessData = access?.canWriteBusinessData ?? true;
    const canAddShop = Boolean(
      isActiveActor &&
        canWriteBusinessData &&
        policy?.canUsePaidFeatures &&
        limits &&
        usage.shopCount < limits.maxShops,
    );
    const deletionEligibility = await getOrganizationDeletionEligibility(ctx, {
      organizationId: ctx.organization._id,
      actorMemberId: ctx.organizationMember._id,
      billingState,
    });

    return {
      organizationId: ctx.organization._id,
      organizationName: ctx.organization.name,
      organizationCreatedAt: ctx.organization.createdAt,
      organizationUpdatedAt: ctx.organization.updatedAt,
      memberStatus,
      usage: projectManageUsage(billingState, usage, limits),
      // 旧client互換。archive廃止後は全非削除店舗をactiveへ投影し、archivedは常に0にする。
      shopCounts: {
        active: Math.min(shops.length, SHOP_COUNT_LIMIT),
        archived: 0,
        hasOverflow: shops.length > SHOP_COUNT_LIMIT,
      },
      capabilities: {
        canUpdateOrganizationName: isActiveActor && canWriteBusinessData,
        ...(!(isActiveActor && canWriteBusinessData)
          ? {
              updateOrganizationNameDisabledReason: !isActiveActor
                ? "現在のアカウント状態では、組織名を変更できません。"
                : access?.businessWriteBlockReason === "usageLimitExceeded"
                  ? "プラン上限を超過しているため、利用人数・店舗・管理者を上限内に減らすか、プランを変更してください。"
                  : "現在の契約状態では、組織名を変更できません。",
            }
          : {}),
        canAddShop,
        ...(!canAddShop
          ? {
              addShopDisabledReason: !isActiveActor
                ? "現在のアカウント状態では、店舗を追加できません。"
                : !billingState
                  ? "組織単位のプラン設定を移行しています。\n完了するまでお待ちください。"
                  : access?.businessWriteBlockReason === "usageLimitExceeded"
                    ? "プラン上限を超過しているため、利用人数・店舗・管理者を上限内に減らすか、プランを変更してください。"
                    : policy?.paidFeatureBlockReason === "freePlan"
                      ? "Freeプランでは、店舗を追加できません。\n有料プランを選択してください。"
                      : policy?.paidFeatureBlockReason === "paymentResultPending"
                        ? "支払い結果が確定してから、店舗を追加できます。"
                        : `店舗は、組織ごとに${limits?.maxShops ?? ORGANIZATION_PLAN_LIMITS.standard.maxShops}件まで登録できます。`,
            }
          : {}),
        canDeleteOrganization: isActiveActor && deletionEligibility.canDelete,
        ...(!(isActiveActor && deletionEligibility.canDelete)
          ? {
              deleteOrganizationDisabledReason: !isActiveActor
                ? "現在のアカウント状態では、組織を削除できません。"
                : deletionEligibility.canDelete
                  ? "組織を削除できません。"
                  : deletionEligibility.reason,
            }
          : {}),
        canCreateOrganization: isActiveActor && creationAvailability.canCreate,
        ...(!isActiveActor
          ? { createOrganizationDisabledReason: "閲覧のみの権限では、別の組織を作成できません。" }
          : !creationAvailability.canCreate
            ? { createOrganizationDisabledReason: creationAvailability.reason }
            : {}),
      },
    };
  },
});

type ManageUsageSnapshot = Awaited<ReturnType<typeof getOrganizationUsageSnapshot>>;

function projectManageUsage(
  billingState: CanonicalOrganizationBillingStateDocument | null,
  usage: ManageUsageSnapshot,
  limits: { maxPeople: number; maxShops: number; maxActiveManagers: number } | null | undefined,
) {
  const state = manageBillingState(billingState);
  const currentPlan = manageCurrentPlan(billingState);
  return {
    state,
    currentPlan,
    peopleUsage: {
      current: usage.personCount,
      max: limits?.maxPeople ?? 0,
      pendingInvitations: usage.reservedSeatCount,
    },
    shopUsage: {
      current: usage.shopCount,
      max: limits?.maxShops ?? 0,
      pendingInvitations: 0,
    },
    managerUsage: {
      current: usage.activeManagerCount,
      max: limits?.maxActiveManagers ?? 0,
      pendingInvitations: usage.pendingManagerInvitationCount,
    },
  };
}

function manageBillingState(billingState: CanonicalOrganizationBillingStateDocument | null) {
  if (!billingState) return "migrationPending" as const;
  const state = billingState.state;
  if (state.kind === "active") return state.plan;
  if (state.kind === "complimentary") return "pro" as const;
  if (state.kind === "paymentTerminationPending") return "free" as const;
  return state.kind;
}

function manageCurrentPlan(billingState: CanonicalOrganizationBillingStateDocument | null) {
  if (!billingState) return null;
  const state = billingState.state;
  switch (state.kind) {
    case "trial":
      return "trial" as const;
    case "active":
      return state.plan;
    case "complimentary":
      return "pro" as const;
    case "scheduledChange":
      return state.currentPlan;
    case "pendingActivation":
      return state.fallback;
    case "initialPaymentPending":
    case "paymentTerminationPending":
      return "free" as const;
  }
}

/** 非削除店舗をcursor paginationする。旧clientのarchived指定には空結果を返す。 */
export const listOrganizationShops = organizationQuery({
  args: {
    status: shopStatusFilterValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(organizationShopListItemValidator),
  handler: async (ctx, { status, paginationOpts }) => {
    const bounded = boundedPaginationOptions(paginationOpts);
    if (status === "archived") {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const result = await ctx.db
      .query("shops")
      .withIndex("by_organizationId_and_isDeleted", (q) =>
        q.eq("organizationId", ctx.organization._id).eq("isDeleted", false),
      )
      .paginate(bounded);

    return {
      ...result,
      page: result.page.map((shop) => ({
        shopId: shop._id,
        shopName: shop.name,
        // rolling deploy中の旧client互換。DBのlegacy fieldは参照しない。
        operatingStatus: "active" as const,
      })),
    };
  },
});

/** Billing detail専用。canonical組織に紐づく表示DTOを返す。 */
export const getBillingOverview = organizationQuery({
  args: {},
  returns: v.object({
    organizationName: v.string(),
    memberStatus: v.literal("active"),
    billing: billingViewValidator,
  }),
  handler: async (ctx) => {
    const memberStatus = ctx.organizationMember.status;
    if (memberStatus !== "active") throw new ConvexError("Not found");
    const settings = await getCanonicalOrganizationSettings(ctx);
    return {
      organizationName: ctx.organization.name,
      memberStatus,
      billing: settings.billing,
    };
  },
});

export const getManagerSettingsOverview = organizationQuery({
  args: { now: v.number() },
  returns: managerSettingsOverviewValidator,
  handler: async (ctx, args) => await getCanonicalManagerSettingsOverview(ctx, args),
});

export const getManagerCandidates = organizationQuery({
  args: { now: v.number() },
  returns: managerCandidatesValidator,
  handler: async (ctx, args) => await getCanonicalManagerCandidates(ctx, args),
});
