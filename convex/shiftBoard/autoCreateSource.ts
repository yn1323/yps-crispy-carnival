import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAiShiftDraftRecruitmentLimit } from "../_lib/config";
import { generateDateRange } from "../_lib/dateFormat";
import { isCurrentSubmission } from "../_lib/recruitmentEditing";
import {
  AUTO_CREATE_HISTORY_RECRUITMENT_LIMIT,
  SHIFT_ASSIGNMENT_LIMIT,
  SHIFT_BOARD_DATE_NOTE_LIMIT,
  SHIFT_BOARD_SHIFT_REQUEST_LIMIT,
  SHIFT_BOARD_STAFF_LIMIT,
} from "../constants";
import { isPositionsUnsplit } from "../position/service";
import {
  listActivePositions,
  listDayTemplates,
  listRecruitmentPositions,
  resolveRecruitmentStaffingDays,
  toPositionSkillsDto,
} from "../shiftSetup/service";
import { listShiftTargetStaffsInShop } from "../staff/service";
import type { AiDraftSource } from "./autoCreate/ai/aiDraftPrompt";
import {
  type AutoCreateHistory,
  type AutoCreateHistoryRecruitment,
  summarizeAutoCreateHistory,
} from "./autoCreate/history";
import type { AutoCreateInput } from "./autoCreate/types";

// シフトの自動作成が使う材料を、DBから読む。
// 画面から値を受け取らず、希望、必要人数、熟練度、過去の集計、日付メモをサーバーで集める。

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

/**
 * 過去に確定した1つの募集の希望と勤務を、自動作成の集計に渡す形で読む。
 * 読む件数が上限を超える募集は、数を正しく出せないためnullを返す。
 */
async function readAutoCreateHistoryRecruitment(
  ctx: DbCtx,
  recruitment: Doc<"recruitments">,
  activePositionIds: ReadonlySet<Id<"positions">>,
): Promise<AutoCreateHistoryRecruitment<Id<"staffs">, Id<"positions">> | null> {
  const [submissions, requestedDays, assignments] = await Promise.all([
    ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
      .take(SHIFT_BOARD_STAFF_LIMIT + 1),
    recruitment.submissionPattern.kind === "dateOnly"
      ? ctx.db
          .query("shiftSubmissionDates")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
          .take(SHIFT_BOARD_SHIFT_REQUEST_LIMIT + 1)
      : ctx.db
          .query("shiftSubmissionSlots")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
          .take(SHIFT_BOARD_SHIFT_REQUEST_LIMIT + 1),
    ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
      .take(SHIFT_ASSIGNMENT_LIMIT + 1),
  ]);
  if (
    submissions.length > SHIFT_BOARD_STAFF_LIMIT ||
    requestedDays.length > SHIFT_BOARD_SHIFT_REQUEST_LIMIT ||
    assignments.length > SHIFT_ASSIGNMENT_LIMIT
  ) {
    return null;
  }

  return {
    submittedStaffIds: submissions.filter(isCurrentSubmission).map((submission) => submission.staffId),
    requestedDays: requestedDays.map(({ staffId, date }) => ({ staffId, date })),
    // 仮の勤務は希望のない日に入れたものなので、希望が通った日として数えない。
    // いまの設定にないポジションは、自動作成で入れる先にならないため除く。
    assignments: assignments
      .filter((assignment) => !assignment.isProvisional && activePositionIds.has(assignment.positionId))
      .map(({ staffId, date, positionId }) => ({ staffId, date, positionId })),
  };
}

/**
 * 直近に確定した募集のうち、今回と希望シフトの集め方が同じものを、人ごとの日数に数える。
 */
export async function loadAutoCreateHistory(
  ctx: DbCtx,
  shop: Pick<Doc<"shops">, "_id" | "organizationId">,
  recruitment: Pick<Doc<"recruitments">, "periodStart" | "submissionPattern">,
): Promise<AutoCreateHistory<Id<"staffs">, Id<"positions">>> {
  const [staffs, positions, previousRecruitments] = await Promise.all([
    listShiftTargetStaffsInShop(ctx, shop),
    listActivePositions(ctx, shop._id),
    ctx.db
      .query("recruitments")
      .withIndex("by_shopId_and_isDeleted_and_status_and_periodStart", (q) =>
        q
          .eq("shopId", shop._id)
          .eq("isDeleted", false)
          .eq("status", "confirmed")
          .lt("periodStart", recruitment.periodStart),
      )
      .order("desc")
      .take(AUTO_CREATE_HISTORY_RECRUITMENT_LIMIT),
  ]);
  const activePositionIds = new Set(positions.map((position) => position._id));

  // 希望シフトの集め方が違う募集は、日数の数え方がそろわないため使わない。
  const comparableRecruitments = previousRecruitments.filter(
    (previous) => previous.submissionPattern.kind === recruitment.submissionPattern.kind,
  );
  const histories: AutoCreateHistoryRecruitment<Id<"staffs">, Id<"positions">>[] = [];
  for (const previous of comparableRecruitments) {
    const history = await readAutoCreateHistoryRecruitment(ctx, previous, activePositionIds);
    if (history) histories.push(history);
  }

  return summarizeAutoCreateHistory({ recruitments: histories, staffIds: staffs.map((staff) => staff._id) });
}

/**
 * シフトのAI作成へ渡す材料を、募集から読む。
 * 作る対象は、希望を提出済みのシフト対象のスタッフと、定休日でない日だけである。
 * 日付メモは要配慮の情報を含みうるため、呼ぶ側は、店舗の管理者であることを確かめてから使う。
 */
export async function loadAiDraftSource(
  ctx: DbCtx,
  args: { shop: Doc<"shops">; recruitment: Doc<"recruitments">; includesBreaks: boolean },
): Promise<AiDraftSource> {
  const { shop, recruitment, includesBreaks } = args;
  const [positions, templates, shiftTargetStaffs, submissions, shiftSlots, requestedDates, notes, history] =
    await Promise.all([
      listRecruitmentPositions(ctx, recruitment),
      listDayTemplates(ctx, shop._id),
      listShiftTargetStaffsInShop(ctx, shop),
      ctx.db
        .query("shiftSubmissions")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
        .take(SHIFT_BOARD_STAFF_LIMIT),
      ctx.db
        .query("shiftSubmissionSlots")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
        .take(SHIFT_BOARD_SHIFT_REQUEST_LIMIT),
      ctx.db
        .query("shiftSubmissionDates")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
        .take(SHIFT_BOARD_SHIFT_REQUEST_LIMIT),
      ctx.db
        .query("shiftSubmissionDateNotes")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
        .take(SHIFT_BOARD_DATE_NOTE_LIMIT),
      loadAutoCreateHistory(ctx, shop, recruitment),
    ]);

  const submittedStaffIds = new Set(submissions.filter(isCurrentSubmission).map((submission) => submission.staffId));
  const staffs = shiftTargetStaffs.filter((staff) => submittedStaffIds.has(staff._id));
  const targetStaffIds = new Set(staffs.map((staff) => staff._id));
  const activePositionIds = new Set(positions.map((position) => position._id));
  // ポジションを追加していない店舗は必要人数を扱えないため、どの日も必要人数なしにする。
  const days = isPositionsUnsplit(positions)
    ? []
    : await resolveRecruitmentStaffingDays(ctx, { shopId: shop._id, recruitment, templates, activePositionIds });
  const closedDates = new Set(recruitment.shopClosedDates);

  const input: AutoCreateInput = {
    pattern: recruitment.submissionPattern,
    periodStart: recruitment.periodStart,
    dates: generateDateRange(recruitment.periodStart, recruitment.periodEnd).filter((date) => !closedDates.has(date)),
    staffs: staffs.map((staff) => ({ id: staff._id, positionSkills: toPositionSkillsDto(staff, positions) })),
    positionIds: positions.map((position) => position._id),
    requestedSlots: shiftSlots.map((slot) => ({
      staffId: slot.staffId,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      ...(slot.optionId ? { optionId: slot.optionId } : {}),
    })),
    requestedDates: requestedDates.map((request) => ({ staffId: request.staffId, date: request.date })),
    days: days.map((day) => ({ date: day.date, requirements: day.requirements })),
    history: history.recruitmentCount > 0 ? history : null,
    includesBreaks: includesBreaks,
  };

  return {
    input,
    positions: positions.map((position) => ({ id: position._id, name: position.name })),
    notes: notes
      .filter(
        (entry) =>
          targetStaffIds.has(entry.staffId) &&
          entry.date >= recruitment.periodStart &&
          entry.date <= recruitment.periodEnd,
      )
      .map(({ staffId, date, note }) => ({ staffId, date, note })),
  };
}

/**
 * その募集で、AIでの作成をあと何回使えるかを返す。
 * 使った回数は、AIが下書きを返せた回の記録の数である。失敗した回と、AIを呼ばなかった回は数えない。
 * 上限の回数は環境変数で決まる。
 */
export async function countAiDraftRemaining(ctx: DbCtx, recruitmentId: Id<"recruitments">): Promise<number> {
  const limit = getAiShiftDraftRecruitmentLimit();
  if (limit === 0) return 0;
  const used = await ctx.db
    .query("aiShiftDraftUsages")
    .withIndex("by_recruitmentId_and_outcome", (q) => q.eq("recruitmentId", recruitmentId).eq("outcome", "created"))
    .take(limit);
  return limit - used.length;
}
