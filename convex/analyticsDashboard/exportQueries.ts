import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { addDays, dateJST, getDeadlineCutoff, jstDayRangeMs } from "../_lib/dateFormat";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import type {
  ExportSubmissionPatternDto,
  OrganizationExportResponse,
  ShopExportMemberDto,
  ShopExportRecruitmentDto,
  ShopExportResponse,
} from "./dto";
import { currentShop, organizationListRow, SHOP_LIST_STAFF_SCAN_LIMIT, shopListRow, staffRow } from "./queryHelpers";
import { organizationExportResponseValidator, shopExportResponseValidator } from "./validators";

/** 1店舗の出力で読む直近の募集数。全期間を読むと大きな店舗で読み取り上限に達する。 */
export const EXPORT_RECRUITMENT_LIMIT = 8;
/** 募集ごとに読む提出の上限。店舗のスタッフ走査上限と同じ人数まで。 */
export const EXPORT_SUBMISSION_LIMIT = SHOP_LIST_STAFF_SCAN_LIMIT;
/** 募集ごとに読む割当の上限。超えた募集は人数・件数を下限値として扱う。 */
export const EXPORT_ASSIGNMENT_LIMIT = 600;
/** 組織の出力で返す店舗数の上限。 */
export const EXPORT_ORGANIZATION_SHOP_LIMIT = 100;
const EXPORT_ACTIVE_DAYS = 90;

/** パターン名は店舗が自由に付けるため、時間帯だけを返す。 */
function exportSubmissionPattern(pattern: Doc<"recruitments">["submissionPattern"]): ExportSubmissionPatternDto {
  switch (pattern.kind) {
    case "time":
      return { kind: "time", startTime: pattern.startTime, endTime: pattern.endTime };
    case "dateOnly":
      return { kind: "dateOnly" };
    case "shiftType":
      return {
        kind: "shiftType",
        options: [...pattern.options]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(({ startTime, endTime }) => ({ startTime, endTime })),
      };
  }
}

/**
 * 同じメールアドレスの人物を店舗・組織をまたいで照合するキー。
 * メールアドレスのhashは辞書攻撃で戻せるため使わず、同じアドレスを持つ最も古いスタッフのIDを返す。
 */
async function personKeyFor(ctx: QueryCtx, emailNormalized: string, fallback: Id<"staffs">) {
  const oldest = await ctx.db
    .query("staffs")
    .withIndex("by_emailNormalized", (q) => q.eq("emailNormalized", emailNormalized))
    .first();
  return oldest?._id ?? fallback;
}

async function exportMembers(ctx: QueryCtx, shopId: Id<"shops">) {
  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(SHOP_LIST_STAFF_SCAN_LIMIT + 1);
  const members: ShopExportMemberDto[] = [];
  const personKeyByStaffId = new Map<Id<"staffs">, string>();
  const personKeyByEmail = new Map<string, string>();
  for (const staff of staffs.slice(0, SHOP_LIST_STAFF_SCAN_LIMIT)) {
    // 所属・人物・削除状態の検証は一覧と詳細と同じstaffRowに任せ、名前は使わない。
    const row = await staffRow(ctx, staff._id, shopId);
    const person = row ? await ctx.db.get(staff.organizationPersonId) : null;
    if (!row || !person) continue;
    let personKey = personKeyByEmail.get(person.emailNormalized);
    if (personKey === undefined) {
      personKey = await personKeyFor(ctx, person.emailNormalized, staff._id);
      personKeyByEmail.set(person.emailNormalized, personKey);
    }
    personKeyByStaffId.set(staff._id, personKey);
    members.push({
      personKey,
      isManager: row.isManager,
      excludedFromShift: row.excludedFromShift,
      accountLinked: row.accountLinked,
      lineStatus: row.lineStatus,
      joinedAt: staff._creationTime,
    });
  }
  return { members, personKeyByStaffId, membersTruncated: staffs.length > SHOP_LIST_STAFF_SCAN_LIMIT };
}

async function exportRecruitment(
  ctx: QueryCtx,
  recruitment: Doc<"recruitments">,
  personKeyByStaffId: Map<Id<"staffs">, string>,
): Promise<ShopExportRecruitmentDto> {
  const [stats, submissions, assignments] = await Promise.all([
    ctx.db
      .query("recruitmentStats")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
      .first(),
    ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
      .take(EXPORT_SUBMISSION_LIMIT + 1),
    ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
      .take(EXPORT_ASSIGNMENT_LIMIT + 1),
  ]);
  const assignmentTruncated = assignments.length > EXPORT_ASSIGNMENT_LIMIT;
  const countedAssignments = assignments.slice(0, EXPORT_ASSIGNMENT_LIMIT);
  const assignedStaffIds = new Set(countedAssignments.map((assignment) => assignment.staffId));
  const deadlineCutoff = getDeadlineCutoff(recruitment.deadline);
  return {
    periodStart: recruitment.periodStart,
    periodEnd: recruitment.periodEnd,
    deadline: recruitment.deadline,
    createdAt: recruitment._creationTime,
    status: recruitment.status,
    confirmedAt: recruitment.confirmedAt ?? null,
    confirmedBeforeStart:
      recruitment.confirmedAt === undefined
        ? null
        : recruitment.confirmedAt < jstDayRangeMs(recruitment.periodStart).startMs,
    submissionPattern: exportSubmissionPattern(recruitment.submissionPattern),
    shopClosedDateCount: recruitment.shopClosedDates.length,
    editCount: recruitment.editVersion ?? 0,
    reminderScheduledAt: recruitment.reminderScheduledAt ?? null,
    reminderSentAt: recruitment.lastReminderSentAt ?? null,
    draftSavedAt: recruitment.draftSavedAt ?? null,
    stats: stats ? { submittedCount: stats.submittedCount, shiftTargetCount: stats.activeStaffCountSnapshot } : null,
    submissions: submissions.slice(0, EXPORT_SUBMISSION_LIMIT).map((submission) => ({
      personKey: personKeyByStaffId.get(submission.staffId) ?? null,
      firstSubmittedAt: submission.firstSubmittedAt,
      lastSubmittedAt: submission.submittedAt,
      firstSubmittedByDeadline: submission.firstSubmittedAt < deadlineCutoff,
      needsResubmission: submission.needsResubmission === true,
      assigned: assignmentTruncated ? null : assignedStaffIds.has(submission.staffId),
    })),
    submissionsTruncated: submissions.length > EXPORT_SUBMISSION_LIMIT,
    assignment: {
      assignedStaffCount: assignedStaffIds.size,
      assignmentCount: countedAssignments.length,
      isTruncated: assignmentTruncated,
    },
  };
}

export const getShopExport = internalQuery({
  args: { shopId: v.string(), asOf: v.number() },
  returns: shopExportResponseValidator,
  handler: async (ctx, args): Promise<ShopExportResponse | null> => {
    const current = await currentShop(ctx, args.shopId);
    if (!current) return null;
    const { shop, organization } = current;
    const today = dateJST(args.asOf);
    const [listRow, state, days, recruitments] = await Promise.all([
      shopListRow(ctx, shop, organization, today),
      ctx.db
        .query("analyticsState")
        .withIndex("by_key", (q) => q.eq("key", "usage"))
        .unique(),
      ctx.db
        .query("analyticsShopDays")
        .withIndex("by_shopId_and_date", (q) =>
          q
            .eq("shopId", shop._id)
            .gte("date", addDays(today, -(EXPORT_ACTIVE_DAYS - 1)))
            .lte("date", today),
        )
        .take(EXPORT_ACTIVE_DAYS),
      ctx.db
        .query("recruitments")
        .withIndex("by_shopId_and_isDeleted_and_periodStart", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .order("desc")
        .take(EXPORT_RECRUITMENT_LIMIT + 1),
    ]);
    const { members, personKeyByStaffId, membersTruncated } = await exportMembers(ctx, shop._id);
    const recruitmentRows: ShopExportRecruitmentDto[] = [];
    for (const recruitment of recruitments.slice(0, EXPORT_RECRUITMENT_LIMIT)) {
      recruitmentRows.push(await exportRecruitment(ctx, recruitment, personKeyByStaffId));
    }
    return {
      kind: "shopExport",
      asOf: args.asOf,
      shop: {
        shopId: shop._id,
        name: shop.name,
        organizationId: organization._id,
        organizationName: organization.name,
        registeredAt: shop._creationTime,
        regularClosedDays: shop.regularClosedDays,
        submissionPattern: exportSubmissionPattern(shop.submissionPattern),
      },
      usage: {
        analyticsStartedAt: state?.startedAt ?? null,
        staffCount: listRow?.staffCount ?? null,
        lastActivityDate: listRow?.lastActivityDate ?? null,
        lastNotifiedAt: listRow?.lastNotifiedAt ?? null,
        attention: listRow?.attention ?? [],
        activeDays: days
          .filter((day) => day.submitted || day.confirmed)
          .map(({ date, submitted, confirmed }) => ({ date, submitted, confirmed })),
      },
      members,
      membersTruncated,
      recruitments: recruitmentRows,
      recruitmentsTruncated: recruitments.length > EXPORT_RECRUITMENT_LIMIT,
    };
  },
});

export const getOrganizationExport = internalQuery({
  args: { organizationId: v.string(), asOf: v.number() },
  returns: organizationExportResponseValidator,
  handler: async (ctx, args): Promise<OrganizationExportResponse | null> => {
    const organizationId = ctx.db.normalizeId("organizations", args.organizationId);
    const organization = organizationId ? await ctx.db.get(organizationId) : null;
    if (!organization || organization.isDeleted) return null;
    const row = await organizationListRow(ctx, organization, {
      billing: null,
      notifiedSince: null,
      minStaff: null,
      search: "",
    });
    if (!row) return null;
    const shops = await ctx.db
      .query("shops")
      .withIndex("by_organizationId_and_isDeleted", (q) =>
        q.eq("organizationId", organization._id).eq("isDeleted", false),
      )
      .take(EXPORT_ORGANIZATION_SHOP_LIMIT + 1);
    return {
      kind: "organizationExport",
      asOf: args.asOf,
      organization: {
        organizationId: row.organizationId,
        name: row.name,
        registeredAt: row.registeredAt,
        billing: row.billing,
        peopleCount: row.peopleCount,
        activeManagerCount: row.activeManagerCount,
        shopCount: row.shopCount,
        lastNotifiedAt: row.lastNotifiedAt,
      },
      shops: shops.slice(0, EXPORT_ORGANIZATION_SHOP_LIMIT).map((shop) => ({ shopId: shop._id, name: shop.name })),
      shopsTruncated: shops.length > EXPORT_ORGANIZATION_SHOP_LIMIT,
    };
  },
});
