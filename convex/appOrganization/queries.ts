import type { PaginationOptions } from "convex/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getReleaseFeatureVisibility } from "../_lib/config";
import { todayJST } from "../_lib/dateFormat";
import { authenticatedQuery, organizationQuery } from "../_lib/functions";
import {
  APP_ORGANIZATION_RECRUITMENT_LEGACY_SUBMISSION_COUNT_LIMIT,
  APP_ORGANIZATION_RECRUITMENT_SHOP_PAGE_SIZE,
  DASHBOARD_RECRUITMENT_CANDIDATE_GROUP_LIMIT,
  DASHBOARD_RESPONSE_COUNT_LIMIT,
} from "../constants";
import {
  dashboardRecruitmentValidator,
  getDashboardRecruitmentCandidateDocs,
  toDashboardRecruitment,
} from "../dashboard/queries";
import { getOrganizationPersonLineState } from "../line/service";
import { type OrganizationReadActor, resolveOrganizationReadActor } from "../organization/access";
import { isOrganizationBillingContact } from "../organization/billingContact";
import { deriveOrganizationPersonCapabilities, type ManagerRole } from "../organization/personCapabilities";
import { getOrganizationBillingState } from "../organization/service";
import {
  deriveOrganizationBillingPolicy,
  getEffectiveRestrictedBillingState,
  ORGANIZATION_PLAN_LIMITS,
  resolveRestrictedLimitPlan,
} from "../organizationBilling/policy";

const MAX_PAGE_SIZE = 50;
const MAX_ROWS_READ = 100;
const ORGANIZATION_PEOPLE_SUMMARY_LIMIT = 1000;

const organizationContextValidator = v.object({
  organizationId: v.id("organizations"),
  organizationName: v.string(),
  memberStatus: v.union(v.literal("active"), v.literal("readOnly")),
});

const activeShopContextValidator = v.object({
  shopId: v.id("shops"),
  shopName: v.string(),
});

const regularClosedDaysValidator = v.array(
  v.union(
    v.literal("sun"),
    v.literal("mon"),
    v.literal("tue"),
    v.literal("wed"),
    v.literal("thu"),
    v.literal("fri"),
    v.literal("sat"),
  ),
);

const dashboardRecruitmentGroupValidator = v.object({
  key: v.union(
    v.literal("current"),
    v.literal("actionRequired"),
    v.literal("collecting"),
    v.literal("confirmed"),
    v.literal("past"),
  ),
  title: v.string(),
  recruitments: v.array(dashboardRecruitmentValidator),
  totalCount: v.number(),
});

const organizationRecruitmentSectionValidator = v.object({
  shop: v.object({
    shopId: v.id("shops"),
    shopName: v.string(),
    operatingStatus: v.literal("active"),
    regularClosedDays: regularClosedDaysValidator,
  }),
  currentGroups: v.array(dashboardRecruitmentGroupValidator),
  hasPastRecruitments: v.boolean(),
  actions: v.object({
    canCreate: v.boolean(),
    createDisabledReason: v.optional(v.string()),
  }),
});

const organizationPersonListItemValidator = v.object({
  id: v.id("organizationPeople"),
  name: v.string(),
  email: v.union(v.string(), v.null()),
  managerRole: v.union(v.literal("active"), v.literal("readOnly"), v.literal("none")),
  isStaff: v.boolean(),
  isLineConnected: v.boolean(),
  lineStatus: v.union(v.literal("unlinked"), v.literal("linked_following"), v.literal("linked_unfollowed")),
  shopNames: v.array(v.string()),
  shopIds: v.array(v.id("shops")),
  canRemoveManagerRole: v.boolean(),
  managerRoleRemovalDisabledReason: v.optional(v.string()),
  canRemove: v.boolean(),
  removeDisabledReason: v.optional(v.string()),
});

const organizationPeopleSummaryValidator = v.object({
  totalCount: v.number(),
  totalCountHasOverflow: v.boolean(),
  visibleCount: v.number(),
  visibleCountHasOverflow: v.boolean(),
  maxPeople: v.number(),
  canAddStaff: v.boolean(),
  addStaffDisabledReason: v.optional(v.string()),
  features: v.object({ managerInvitation: v.boolean() }),
});

const shopFilterValidator = v.union(v.literal("all"), v.id("shops"));

type AppOrganizationQueryCtx = QueryCtx & {
  user: Doc<"users">;
  organization: Doc<"organizations">;
  organizationPerson: Doc<"organizationPeople">;
  organizationMember: Doc<"organizationMembers">;
};

const EMPTY_CONTEXT_PAGE = { page: [], isDone: true, continueCursor: "" } as {
  page: never[];
  isDone: boolean;
  continueCursor: string;
};

function boundedPaginationOptions(
  paginationOpts: PaginationOptions,
  limits: { maxPageSize: number; maxRowsRead: number } = {
    maxPageSize: MAX_PAGE_SIZE,
    maxRowsRead: MAX_ROWS_READ,
  },
): PaginationOptions {
  if (
    !Number.isSafeInteger(paginationOpts.numItems) ||
    paginationOpts.numItems < 1 ||
    paginationOpts.numItems > limits.maxPageSize
  ) {
    throw new ConvexError(`numItems must be between 1 and ${limits.maxPageSize}`);
  }
  if (
    paginationOpts.maximumRowsRead !== undefined &&
    (!Number.isSafeInteger(paginationOpts.maximumRowsRead) || paginationOpts.maximumRowsRead < 1)
  ) {
    throw new ConvexError("maximumRowsRead must be a positive integer");
  }

  return {
    ...paginationOpts,
    maximumRowsRead: Math.min(paginationOpts.maximumRowsRead ?? limits.maxRowsRead, limits.maxRowsRead),
  };
}

function toOrganizationContext(actor: OrganizationReadActor) {
  if (actor.member.status !== "active" && actor.member.status !== "readOnly") {
    throw new ConvexError("Not found");
  }
  return {
    organizationId: actor.organization._id,
    organizationName: actor.organization.name,
    memberStatus: actor.member.status,
  };
}

/** Clerk identityに紐づくcanonicalな所属組織を、店舗をinlineせず返す。 */
export const listMyOrganizationContexts = authenticatedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(organizationContextValidator),
  handler: async (ctx, { paginationOpts }) => {
    const boundedPagination = boundedPaginationOptions(paginationOpts);
    if (!ctx.identity || !ctx.user || ctx.user.isDeleted) return EMPTY_CONTEXT_PAGE;
    const user = ctx.user;

    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_userId_and_organizationId", (q) => q.eq("userId", user._id))
      .filter((q) => q.or(q.eq(q.field("status"), "active"), q.eq(q.field("status"), "readOnly")))
      .paginate(boundedPagination);

    const contexts = await Promise.all(
      memberships.page.map(async (member) => {
        const actor = await resolveOrganizationReadActor(ctx, {
          user,
          organizationId: member.organizationId,
        });
        return actor?.member._id === member._id ? toOrganizationContext(actor) : null;
      }),
    );

    return {
      ...memberships,
      page: contexts.filter((context) => context !== null),
    };
  },
});

/** URLで明示された組織を直接検証し、所属失効時は存在を開示せずnullへ収束させる。 */
export const getOrganizationContext = authenticatedQuery({
  args: { organizationId: v.id("organizations") },
  returns: v.union(organizationContextValidator, v.null()),
  handler: async (ctx, { organizationId }) => {
    if (!ctx.identity || !ctx.user || ctx.user.isDeleted) return null;

    const actor = await resolveOrganizationReadActor(ctx, {
      user: ctx.user,
      organizationId,
    });
    return actor ? toOrganizationContext(actor) : null;
  },
});

/** Homeの店舗selector向けに、認可済み組織のactive店舗だけを返す。 */
export const listOrganizationActiveShops = organizationQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(activeShopContextValidator),
  handler: async (ctx, { paginationOpts }) => {
    const shops = await ctx.db
      .query("shops")
      .withIndex("by_organizationId_and_operatingStatus", (q) =>
        q.eq("organizationId", ctx.organization._id).eq("operatingStatus", "active"),
      )
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .paginate(boundedPaginationOptions(paginationOpts));

    return {
      ...shops,
      page: shops.page.map((shop) => ({ shopId: shop._id, shopName: shop.name })),
    };
  },
});

type DashboardRecruitment = typeof dashboardRecruitmentValidator.type;
type DashboardRecruitmentGroup = typeof dashboardRecruitmentGroupValidator.type;

function buildCurrentRecruitmentGroups(
  recruitments: readonly DashboardRecruitment[],
  today: string,
): DashboardRecruitmentGroup[] {
  const grouped: Record<Exclude<DashboardRecruitmentGroup["key"], "past">, DashboardRecruitment[]> = {
    current: [],
    actionRequired: [],
    collecting: [],
    confirmed: [],
  };

  for (const recruitment of recruitments) {
    if (recruitment.periodEnd < today) continue;
    if (recruitment.status === "open") {
      grouped[recruitment.deadline < today ? "actionRequired" : "collecting"].push(recruitment);
      continue;
    }
    grouped[recruitment.periodStart <= today ? "current" : "confirmed"].push(recruitment);
  }

  const groups: DashboardRecruitmentGroup[] = [
    { key: "current", title: "現在のシフト", recruitments: grouped.current, totalCount: grouped.current.length },
    {
      key: "actionRequired",
      title: "要シフト調整",
      recruitments: grouped.actionRequired,
      totalCount: grouped.actionRequired.length,
    },
    { key: "collecting", title: "募集中", recruitments: grouped.collecting, totalCount: grouped.collecting.length },
    { key: "confirmed", title: "確定済み", recruitments: grouped.confirmed, totalCount: grouped.confirmed.length },
  ];
  return groups.filter((group) => group.recruitments.length > 0);
}

function resolveBusinessWriteCapability(args: {
  memberStatus: "active" | "readOnly";
  canWriteBusinessData: boolean;
  businessWriteBlockReason: "paymentResultPending" | "restricted" | null;
}) {
  if (args.memberStatus === "readOnly") {
    return { canCreate: false, createDisabledReason: "閲覧のみの管理者は、募集を作成できません。" };
  }
  if (args.canWriteBusinessData) return { canCreate: true };
  return {
    canCreate: false,
    createDisabledReason:
      args.businessWriteBlockReason === "paymentResultPending"
        ? "支払い結果を確認中のため、募集を作成できません。"
        : "契約状態を復旧してから募集を作成できます。",
  };
}

function resolveStaffAdditionCapability(args: {
  memberStatus: "active" | "readOnly";
  canWriteBusinessData: boolean;
  businessWriteBlockReason: "paymentResultPending" | "restricted" | null;
}) {
  if (args.memberStatus === "readOnly") {
    return { canAddStaff: false, addStaffDisabledReason: "閲覧のみの管理者は、スタッフを追加できません。" };
  }
  if (args.canWriteBusinessData) return { canAddStaff: true };
  return {
    canAddStaff: false,
    addStaffDisabledReason:
      args.businessWriteBlockReason === "paymentResultPending"
        ? "支払い結果を確認中のため、スタッフを追加できません。"
        : "契約状態を復旧してからスタッフを追加できます。",
  };
}

async function getBoundedTotalStaffCount(ctx: AppOrganizationQueryCtx, shopId: Id<"shops">) {
  const activeStaffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(DASHBOARD_RESPONSE_COUNT_LIMIT + 1);
  const hasOverflow = activeStaffs.length > DASHBOARD_RESPONSE_COUNT_LIMIT;
  const countedStaffs = hasOverflow ? activeStaffs.slice(0, DASHBOARD_RESPONSE_COUNT_LIMIT) : activeStaffs;
  return {
    count: countedStaffs.filter((staff) => !staff.excludedFromShift).length,
    // excluded対象を含むscan上限到達時も正確な分母とは断定せず、下限値として表示する。
    hasOverflow,
  };
}

/** 組織内のactive店舗と現在募集を、店舗単位の一つのcursor familyで返す。 */
export const listOrganizationRecruitments = organizationQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(organizationRecruitmentSectionValidator),
  handler: async (ctx, { paginationOpts }) => {
    const shops = await ctx.db
      .query("shops")
      .withIndex("by_organizationId_and_operatingStatus", (q) =>
        q.eq("organizationId", ctx.organization._id).eq("operatingStatus", "active"),
      )
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .paginate(
        boundedPaginationOptions(paginationOpts, {
          maxPageSize: APP_ORGANIZATION_RECRUITMENT_SHOP_PAGE_SIZE,
          maxRowsRead: APP_ORGANIZATION_RECRUITMENT_SHOP_PAGE_SIZE,
        }),
      );
    const policy = await getOrganizationBillingState(ctx, ctx.organization._id).then((state) =>
      state ? deriveOrganizationBillingPolicy(state.state) : null,
    );
    const memberStatus = ctx.organizationMember.status;
    if (memberStatus !== "active" && memberStatus !== "readOnly") throw new ConvexError("Not found");
    const writeCapability = resolveBusinessWriteCapability({
      memberStatus,
      // billing state未作成の移行中組織は既存managerMutationと同じく許可扱いにする。
      canWriteBusinessData: policy?.canWriteBusinessData ?? true,
      businessWriteBlockReason: policy?.businessWriteBlockReason ?? null,
    });
    const today = todayJST();

    return {
      ...shops,
      page: await Promise.all(
        shops.page.map(async (shop) => {
          const [recruitmentDocs, totalStaffCount, pastRecruitment] = await Promise.all([
            getDashboardRecruitmentCandidateDocs(ctx, shop._id, DASHBOARD_RECRUITMENT_CANDIDATE_GROUP_LIMIT),
            getBoundedTotalStaffCount(ctx, shop._id),
            ctx.db
              .query("recruitments")
              .withIndex("by_shopId_and_isDeleted_and_periodEnd", (q) =>
                q.eq("shopId", shop._id).eq("isDeleted", false).lt("periodEnd", today),
              )
              .order("desc")
              .first(),
          ]);
          const recruitments = await Promise.all(
            recruitmentDocs.map(async (recruitment) => ({
              ...(await toDashboardRecruitment(ctx, recruitment, totalStaffCount.count, {
                legacySubmissionCountLimit: APP_ORGANIZATION_RECRUITMENT_LEGACY_SUBMISSION_COUNT_LIMIT,
              })),
              totalStaffCountHasOverflow: totalStaffCount.hasOverflow,
            })),
          );

          return {
            shop: {
              shopId: shop._id,
              shopName: shop.name,
              operatingStatus: "active" as const,
              // TODO[narrow]: m039完走後にfallbackを削除する。
              regularClosedDays: shop.regularClosedDays ?? [],
            },
            currentGroups: buildCurrentRecruitmentGroups(recruitments, today),
            hasPastRecruitments: pastRecruitment !== null,
            actions: writeCapability,
          };
        }),
      ),
    };
  },
});

async function requireOrganizationFilterShop(ctx: AppOrganizationQueryCtx, shopFilter: "all" | Id<"shops">) {
  if (shopFilter === "all") return null;
  const shop = await ctx.db.get(shopFilter);
  if (!shop || shop.isDeleted || shop.organizationId !== ctx.organization._id) {
    throw new ConvexError("Not found");
  }
  return shop;
}

async function getCanonicalManagerRole(
  ctx: AppOrganizationQueryCtx,
  organizationId: Id<"organizations">,
  person: Doc<"organizationPeople">,
): Promise<ManagerRole> {
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_personId", (q) =>
      q.eq("organizationId", organizationId).eq("personId", person._id),
    )
    .take(2);
  if (members.length !== 1 || !person.userId || members[0].userId !== person.userId) return "none";
  const user = await ctx.db.get(members[0].userId);
  if (!user || user.isDeleted || (members[0].status !== "active" && members[0].status !== "readOnly")) return "none";
  return members[0].status;
}

async function projectOrganizationPerson(
  ctx: AppOrganizationQueryCtx,
  args: {
    person: Doc<"organizationPeople">;
    activeManagerCount: number;
    policy: ReturnType<typeof deriveOrganizationBillingPolicy> | null;
    restrictedState: ReturnType<typeof getEffectiveRestrictedBillingState>;
  },
) {
  const organization = ctx.organization;
  const [managerRole, staffRows, lineState] = await Promise.all([
    getCanonicalManagerRole(ctx, organization._id, args.person),
    ctx.db
      .query("staffs")
      .withIndex("by_organizationId_and_organizationPersonId_and_isDeleted", (q) =>
        q.eq("organizationId", organization._id).eq("organizationPersonId", args.person._id).eq("isDeleted", false),
      )
      .take(MAX_ROWS_READ),
    getOrganizationPersonLineState(ctx, {
      organizationId: organization._id,
      organizationPersonId: args.person._id,
    }),
  ]);
  const shops = (
    await Promise.all(
      [...new Set(staffRows.map((staff) => staff.shopId))].map(async (shopId) => await ctx.db.get(shopId)),
    )
  )
    .filter((shop): shop is Doc<"shops"> =>
      Boolean(shop && !shop.isDeleted && shop.organizationId === organization._id),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ja") || String(a._id).localeCompare(String(b._id)));
  const isStaff = staffRows.length > 0;
  const isRestrictedRecovery = Boolean(
    args.restrictedState?.recoveryManagerPersonIds.includes(ctx.organizationPerson._id),
  );
  const isRecoveryManager = Boolean(args.restrictedState?.recoveryManagerPersonIds.includes(args.person._id));
  const capabilities = deriveOrganizationPersonCapabilities({
    managerRole,
    activeManagerCount: args.activeManagerCount,
    canWriteNormally: Boolean(
      ctx.organizationMember.status === "active" && (args.policy?.canWriteBusinessData ?? true),
    ),
    policy: args.policy,
    isStaff,
    isBillingContact: isOrganizationBillingContact(organization, args.person),
    isActiveActor: ctx.organizationMember.status === "active",
    isRestricted: args.restrictedState !== null,
    isRestrictedRecovery,
    isLastRecoveryManager: isRecoveryManager && (args.restrictedState?.recoveryManagerPersonIds.length ?? 0) <= 1,
  });
  const lineStatus = lineState?.status ?? "unlinked";

  return {
    id: args.person._id,
    name: args.person.name,
    email: args.person.email || null,
    managerRole,
    isStaff,
    isLineConnected: lineStatus !== "unlinked",
    lineStatus,
    shopNames: shops.map((shop) => shop.name),
    shopIds: shops.map((shop) => shop._id),
    ...capabilities,
  };
}

async function getOrganizationPeopleProjectionContext(ctx: AppOrganizationQueryCtx) {
  const [billingState, activeManagers] = await Promise.all([
    getOrganizationBillingState(ctx, ctx.organization._id),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) =>
        q.eq("organizationId", ctx.organization._id).eq("status", "active"),
      )
      .take(MAX_ROWS_READ),
  ]);
  return {
    activeManagerCount: activeManagers.length,
    policy: billingState ? deriveOrganizationBillingPolicy(billingState.state) : null,
    restrictedState: billingState ? getEffectiveRestrictedBillingState(billingState.state) : null,
  };
}

/** 組織人物を、店舗filterをpaginationより前に適用して返す。 */
export const listOrganizationPeople = organizationQuery({
  args: { shopFilter: shopFilterValidator, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(organizationPersonListItemValidator),
  handler: async (ctx, { shopFilter, paginationOpts }) => {
    const filterShop = await requireOrganizationFilterShop(ctx, shopFilter);
    const projectionContext = await getOrganizationPeopleProjectionContext(ctx);
    const boundedPagination = boundedPaginationOptions(paginationOpts);

    if (!filterShop) {
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", ctx.organization._id).eq("status", "active"),
        )
        .paginate(boundedPagination);
      return {
        ...people,
        page: await Promise.all(
          people.page.map(async (person) => await projectOrganizationPerson(ctx, { person, ...projectionContext })),
        ),
      };
    }

    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", filterShop._id).eq("isDeleted", false))
      .paginate(boundedPagination);
    const people = (
      await Promise.all(
        staffs.page.map(async (staff) => {
          if (staff.organizationId !== ctx.organization._id || !staff.organizationPersonId) {
            return null;
          }
          const canonicalStaff = await ctx.db
            .query("staffs")
            .withIndex("by_organizationId_and_organizationPersonId_and_isDeleted", (q) =>
              q
                .eq("organizationId", ctx.organization._id)
                .eq("organizationPersonId", staff.organizationPersonId)
                .eq("isDeleted", false),
            )
            .filter((q) => q.eq(q.field("shopId"), filterShop._id))
            .first();
          if (canonicalStaff?._id !== staff._id) return null;
          const person = await ctx.db.get(staff.organizationPersonId);
          return person?.organizationId === ctx.organization._id && person.status === "active" ? person : null;
        }),
      )
    ).filter((person): person is Doc<"organizationPeople"> => person !== null);

    return {
      ...staffs,
      page: await Promise.all(
        people.map(async (person) => await projectOrganizationPerson(ctx, { person, ...projectionContext })),
      ),
    };
  },
});

async function countVisibleOrganizationPeople(ctx: AppOrganizationQueryCtx, shopFilter: "all" | Id<"shops">) {
  const filterShop = await requireOrganizationFilterShop(ctx, shopFilter);
  if (!filterShop) {
    const people = await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_status", (q) =>
        q.eq("organizationId", ctx.organization._id).eq("status", "active"),
      )
      .take(ORGANIZATION_PEOPLE_SUMMARY_LIMIT + 1);
    return {
      count: Math.min(people.length, ORGANIZATION_PEOPLE_SUMMARY_LIMIT),
      hasOverflow: people.length > ORGANIZATION_PEOPLE_SUMMARY_LIMIT,
    };
  }
  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", filterShop._id).eq("isDeleted", false))
    .take(ORGANIZATION_PEOPLE_SUMMARY_LIMIT + 1);
  const peopleIds = new Set(
    staffs.flatMap((staff) =>
      staff.organizationId === ctx.organization._id && staff.organizationPersonId ? [staff.organizationPersonId] : [],
    ),
  );
  return {
    count: Math.min(peopleIds.size, ORGANIZATION_PEOPLE_SUMMARY_LIMIT),
    hasOverflow: staffs.length > ORGANIZATION_PEOPLE_SUMMARY_LIMIT,
  };
}

/** Staff見出し用のboundedな件数とentitlement上限。人物pageのread上限には使わない。 */
export const getOrganizationPeopleSummary = organizationQuery({
  args: { shopFilter: shopFilterValidator },
  returns: organizationPeopleSummaryValidator,
  handler: async (ctx, { shopFilter }) => {
    const totalPromise = countVisibleOrganizationPeople(ctx, "all");
    const [total, visible, billingState] = await Promise.all([
      totalPromise,
      shopFilter === "all" ? totalPromise : countVisibleOrganizationPeople(ctx, shopFilter),
      getOrganizationBillingState(ctx, ctx.organization._id),
    ]);
    const policy = billingState ? deriveOrganizationBillingPolicy(billingState.state) : null;
    const restrictedState = billingState ? getEffectiveRestrictedBillingState(billingState.state) : null;
    const restrictedLimitPlan = restrictedState ? resolveRestrictedLimitPlan(restrictedState) : null;
    const limits = restrictedLimitPlan ? ORGANIZATION_PLAN_LIMITS[restrictedLimitPlan] : policy?.limits;
    const memberStatus = ctx.organizationMember.status;
    if (memberStatus !== "active" && memberStatus !== "readOnly") throw new ConvexError("Not found");
    const capability = resolveStaffAdditionCapability({
      memberStatus,
      canWriteBusinessData: policy?.canWriteBusinessData ?? true,
      businessWriteBlockReason: policy?.businessWriteBlockReason ?? null,
    });
    return {
      totalCount: total.count,
      totalCountHasOverflow: total.hasOverflow,
      visibleCount: visible.count,
      visibleCountHasOverflow: visible.hasOverflow,
      maxPeople: limits?.maxPeople ?? 0,
      features: { managerInvitation: getReleaseFeatureVisibility().managerInvitation },
      ...capability,
    };
  },
});
