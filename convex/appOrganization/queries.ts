import type { PaginationOptions } from "convex/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
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
import { deriveOrganizationPersonCapabilities, type ManagerRole } from "../organization/personCapabilities";
import { getOrganizationStaffOrderScope } from "../organization/staffOrder";
import type { OrganizationBillingPolicy } from "../organizationBilling/policy";
import { getOrganizationAccessPolicy } from "../organizationBilling/service";

const MAX_PAGE_SIZE = 50;
const MAX_ROWS_READ = 100;
const ORGANIZATION_PEOPLE_SUMMARY_LIMIT = 1000;

const organizationContextValidator = v.object({
  organizationId: v.id("organizations"),
  organizationName: v.string(),
  memberStatus: v.literal("active"),
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
  managerRole: v.union(v.literal("active"), v.literal("none")),
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
  canChangeStaffOrder: v.boolean(),
  changeStaffOrderDisabledReason: v.optional(v.string()),
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
  if (actor.member.status !== "active") {
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
      .filter((q) => q.eq(q.field("status"), "active"))
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
  memberStatus: "active";
  canWriteBusinessData: boolean;
  businessWriteBlockReason: "paymentResultPending" | "usageLimitExceeded" | null;
}) {
  if (args.canWriteBusinessData) return { canCreate: true };
  return {
    canCreate: false,
    createDisabledReason:
      args.businessWriteBlockReason === "paymentResultPending"
        ? "支払い結果を確認中のため、募集を作成できません。"
        : args.businessWriteBlockReason === "usageLimitExceeded"
          ? "プラン上限を超過しているため、利用人数・店舗・管理者を上限内に減らすか、プランを変更してください。"
          : "現在の契約状態では、募集を作成できません。",
  };
}

function resolveStaffAdditionCapability(args: {
  memberStatus: "active";
  canWriteBusinessData: boolean;
  businessWriteBlockReason: "paymentResultPending" | "usageLimitExceeded" | null;
}) {
  if (args.canWriteBusinessData) return { canAddStaff: true };
  return {
    canAddStaff: false,
    addStaffDisabledReason:
      args.businessWriteBlockReason === "paymentResultPending"
        ? "支払い結果を確認中のため、スタッフを追加できません。"
        : args.businessWriteBlockReason === "usageLimitExceeded"
          ? "プラン上限を超過しているため、利用人数・店舗・管理者を上限内に減らすか、プランを変更してください。"
          : "現在の契約状態では、スタッフを追加できません。",
  };
}

function resolveStaffOrderChangeCapability(args: {
  memberStatus: "active";
  canWriteBusinessData: boolean;
  businessWriteBlockReason: "paymentResultPending" | "usageLimitExceeded" | null;
}) {
  if (args.canWriteBusinessData) return { canChangeStaffOrder: true };
  return {
    canChangeStaffOrder: false,
    changeStaffOrderDisabledReason:
      args.businessWriteBlockReason === "paymentResultPending"
        ? "支払い結果を確認中のため、スタッフの並び順を変更できません。"
        : args.businessWriteBlockReason === "usageLimitExceeded"
          ? "プラン上限を超過しているため、利用人数・店舗・管理者を上限内に減らすか、プランを変更してください。"
          : "現在の契約状態では、スタッフの並び順を変更できません。",
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
    const access = await getOrganizationAccessPolicy(ctx, ctx.organization._id);
    const memberStatus = ctx.organizationMember.status;
    if (memberStatus !== "active") throw new ConvexError("Not found");
    const writeCapability = resolveBusinessWriteCapability({
      memberStatus,
      // billing state未作成の移行中組織は既存managerMutationと同じく許可扱いにする。
      canWriteBusinessData: access?.canWriteBusinessData ?? true,
      businessWriteBlockReason: access?.businessWriteBlockReason ?? null,
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
  if (!user || user.isDeleted || members[0].status !== "active") return "none";
  return "active";
}

async function projectOrganizationPerson(
  ctx: AppOrganizationQueryCtx,
  args: {
    person: Doc<"organizationPeople">;
    activeManagerCount: number;
    policy: OrganizationBillingPolicy | null;
    canWriteBusinessData: boolean;
    canRecoverUsageLimits: boolean;
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
  const capabilities = deriveOrganizationPersonCapabilities({
    managerRole,
    activeManagerCount: args.activeManagerCount,
    canWriteNormally: ctx.organizationMember.status === "active" && args.canWriteBusinessData,
    canRecoverUsageLimits: ctx.organizationMember.status === "active" && args.canRecoverUsageLimits,
    policy: args.policy,
    isActiveActor: ctx.organizationMember.status === "active",
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
  const [access, activeManagers] = await Promise.all([
    getOrganizationAccessPolicy(ctx, ctx.organization._id),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) =>
        q.eq("organizationId", ctx.organization._id).eq("status", "active"),
      )
      .take(MAX_ROWS_READ),
  ]);
  return {
    activeManagerCount: activeManagers.length,
    policy: access?.billingPolicy ?? null,
    canWriteBusinessData: access?.canWriteBusinessData ?? true,
    canRecoverUsageLimits: access?.accessMode === "limitRecoveryOnly",
  };
}

/** 組織人物を、店舗filterをpaginationより前に適用して返す。 */
export const listOrganizationPeople = organizationQuery({
  args: {
    shopFilter: shopFilterValidator,
    paginationOpts: paginationOptsValidator,
    orderRevision: v.optional(v.union(v.number(), v.null())),
  },
  returns: paginationResultValidator(organizationPersonListItemValidator),
  handler: async (ctx, { shopFilter, paginationOpts, orderRevision }) => {
    const filterShop = await requireOrganizationFilterShop(ctx, shopFilter);
    const projectionContext = await getOrganizationPeopleProjectionContext(ctx);
    const boundedPagination = boundedPaginationOptions(paginationOpts);
    const useOrderedIndex = orderRevision !== undefined && orderRevision !== null;
    if (useOrderedIndex && (!Number.isSafeInteger(orderRevision) || orderRevision < 1)) {
      throw new ConvexError("orderRevision must be a positive safe integer");
    }
    if (useOrderedIndex) {
      const scope = await getOrganizationStaffOrderScope(ctx, {
        organizationId: ctx.organization._id,
        ...(filterShop ? { shopId: filterShop._id } : {}),
      });
      if (scope.mode !== "ordered" || scope.revision !== orderRevision) {
        return {
          page: [] as Array<Awaited<ReturnType<typeof projectOrganizationPerson>>>,
          isDone: true,
          continueCursor: "",
        };
      }
    }

    if (!filterShop) {
      if (useOrderedIndex) {
        const entries = await ctx.db
          .query("organizationStaffOrderEntries")
          .withIndex("by_organizationId_and_displayOrder", (q) => q.eq("organizationId", ctx.organization._id))
          .paginate(boundedPagination);
        const people = (
          await Promise.all(
            entries.page.map(async (entry) => {
              if (entry.organizationId !== ctx.organization._id) return null;
              const person = await ctx.db.get(entry.organizationPersonId);
              return person?.organizationId === ctx.organization._id && person.status === "active" ? person : null;
            }),
          )
        ).filter((person): person is Doc<"organizationPeople"> => person !== null);
        return {
          ...entries,
          page: await Promise.all(
            people.map(async (person) => await projectOrganizationPerson(ctx, { person, ...projectionContext })),
          ),
        };
      }
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

    if (useOrderedIndex) {
      const entries = await ctx.db
        .query("shopStaffOrderEntries")
        .withIndex("by_shopId_and_displayOrder", (q) => q.eq("shopId", filterShop._id))
        .paginate(boundedPagination);
      const people = (
        await Promise.all(
          entries.page.map(async (entry) => {
            if (entry.organizationId !== ctx.organization._id || entry.shopId !== filterShop._id) return null;
            const [staff, person] = await Promise.all([
              ctx.db.get(entry.staffId),
              ctx.db.get(entry.organizationPersonId),
            ]);
            return staff &&
              !staff.isDeleted &&
              staff.shopId === filterShop._id &&
              staff.organizationId === ctx.organization._id &&
              staff.organizationPersonId === entry.organizationPersonId &&
              person?.organizationId === ctx.organization._id &&
              person.status === "active"
              ? person
              : null;
          }),
        )
      ).filter((person): person is Doc<"organizationPeople"> => person !== null);
      return {
        ...entries,
        page: await Promise.all(
          people.map(async (person) => await projectOrganizationPerson(ctx, { person, ...projectionContext })),
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
    const [total, visible, access] = await Promise.all([
      totalPromise,
      shopFilter === "all" ? totalPromise : countVisibleOrganizationPeople(ctx, shopFilter),
      getOrganizationAccessPolicy(ctx, ctx.organization._id),
    ]);
    const policy = access?.billingPolicy ?? null;
    const limits = policy?.limits;
    const memberStatus = ctx.organizationMember.status;
    if (memberStatus !== "active") throw new ConvexError("Not found");
    const capability = resolveStaffAdditionCapability({
      memberStatus,
      canWriteBusinessData: access?.canWriteBusinessData ?? true,
      businessWriteBlockReason: access?.businessWriteBlockReason ?? null,
    });
    const staffOrderCapability = resolveStaffOrderChangeCapability({
      memberStatus,
      canWriteBusinessData: access?.canWriteBusinessData ?? true,
      businessWriteBlockReason: access?.businessWriteBlockReason ?? null,
    });
    return {
      totalCount: total.count,
      totalCountHasOverflow: total.hasOverflow,
      visibleCount: visible.count,
      visibleCountHasOverflow: visible.hasOverflow,
      maxPeople: limits?.maxPeople ?? 0,
      ...capability,
      ...staffOrderCapability,
    };
  },
});
