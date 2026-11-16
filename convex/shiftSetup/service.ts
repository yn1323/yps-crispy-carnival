import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { generateDateRange } from "../_lib/dateFormat";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { POSITION_ACTIVE_LIMIT, RECRUITMENT_PERIOD_DAYS_MAX, SHIFT_DAY_TEMPLATE_LIMIT } from "../constants";
import { listNationalHolidayDates } from "../nationalHoliday/service";
import {
  buildEmptyDayRequirements,
  type DayRequirements,
  type DayStaffingSource,
  filterDayRequirementsByPositions,
  projectDayRequirementsForPattern,
  resolveDayStaffing,
} from "./dayTemplates";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

/** 店舗の有効なポジションを、設定した並び順で返す。 */
export async function listActivePositions(ctx: DbCtx, shopId: Id<"shops">): Promise<Doc<"positions">[]> {
  // 既存データの読み取り窓（50件）に合わせて読み、並び順はsortOrderと作成順で安定させる。
  const positions = await ctx.db
    .query("positions")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(50);
  return positions.sort((left, right) => left.sortOrder - right.sortOrder || left._creationTime - right._creationTime);
}

export async function listDayTemplates(ctx: DbCtx, shopId: Id<"shops">): Promise<Doc<"shiftDayTemplates">[]> {
  const templates = await ctx.db
    .query("shiftDayTemplates")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .take(SHIFT_DAY_TEMPLATE_LIMIT + 1);
  return templates
    .slice(0, SHIFT_DAY_TEMPLATE_LIMIT)
    .sort((left, right) => left.sortOrder - right.sortOrder || left._creationTime - right._creationTime);
}

/**
 * 設定ページへ返す型を作る。
 * 保存済みの必要人数の種類が店舗のいまの集め方と違う型は、いまの種類の空の必要人数にして、入れ直しが要ることを伝える。
 * 時間指定で受付時間の外に出たバーは、消さずにそのまま返す。
 * 削除済みのポジションを指すバーと人数、店舗の勤務パターンにないものは返さない。
 */
export function toDayTemplateDto(
  template: Doc<"shiftDayTemplates">,
  pattern: ShiftSubmissionPattern,
  activePositionIds: ReadonlySet<Id<"positions">>,
) {
  const requiresReentry = template.requirements.kind !== pattern.kind;
  const requirements: DayRequirements<Id<"positions">> = requiresReentry
    ? buildEmptyDayRequirements(pattern.kind)
    : template.requirements.kind === "time"
      ? template.requirements
      : (projectDayRequirementsForPattern(template.requirements, pattern) ?? buildEmptyDayRequirements(pattern.kind));
  return {
    _id: template._id,
    name: template.name,
    weekdays: template.weekdays,
    appliesToHolidays: template.appliesToHolidays,
    requirements: filterDayRequirementsByPositions(requirements, activePositionIds),
    requiresReentry,
  };
}

export type RecruitmentStaffingDay = {
  date: string;
  source: DayStaffingSource;
  templateId: Id<"shiftDayTemplates"> | null;
  templateName: string | null;
  requirements: DayRequirements<Id<"positions">> | null;
};

/**
 * 募集期間の各日に当たる必要人数を、いまの型、その日だけの指定、祝日の表から決める。
 * 必要人数は募集の集め方へ写し、削除済みのポジションを除く。
 * 未確定の募集のシフト表と、確定時の保存の両方が同じ結果を使う。
 */
export async function resolveRecruitmentStaffingDays(
  ctx: DbCtx,
  args: {
    shopId: Id<"shops">;
    recruitment: Pick<Doc<"recruitments">, "periodStart" | "periodEnd" | "submissionPattern">;
    templates: ReadonlyArray<Doc<"shiftDayTemplates">>;
    activePositionIds: ReadonlySet<Id<"positions">>;
  },
): Promise<RecruitmentStaffingDay[]> {
  const { recruitment } = args;
  const [overrides, holidayDates] = await Promise.all([
    // その日だけの指定は1日1件で、募集期間は最大31日である。
    ctx.db
      .query("shiftDayTemplateOverrides")
      .withIndex("by_shopId_and_date", (q) =>
        q.eq("shopId", args.shopId).gte("date", recruitment.periodStart).lte("date", recruitment.periodEnd),
      )
      .take(RECRUITMENT_PERIOD_DAYS_MAX),
    listNationalHolidayDates(ctx, recruitment.periodStart, recruitment.periodEnd),
  ]);
  const templates = args.templates.map((template) => ({
    id: template._id,
    name: template.name,
    weekdays: template.weekdays,
    appliesToHolidays: template.appliesToHolidays,
    requirements: template.requirements,
  }));

  return generateDateRange(recruitment.periodStart, recruitment.periodEnd).map((date) => {
    const resolved = resolveDayStaffing({ date, templates, overrides, holidayDates });
    const projected = projectDayRequirementsForPattern(resolved.requirements, recruitment.submissionPattern);
    return {
      date,
      source: resolved.source,
      templateId: resolved.templateId,
      templateName: resolved.templateName,
      requirements: projected ? filterDayRequirementsByPositions(projected, args.activePositionIds) : null,
    };
  });
}

/**
 * スタッフのポジションごとの扱いのうち、いまも有効なポジションの項目だけを、ポジションの並び順で返す。
 * ポジションの削除で、残ったポジションのすべてが「入れない」になったスタッフは、「入れない」の項目を返さない。
 * どこにも入れないスタッフを作らないためである。
 */
export function toPositionSkillsDto(
  staff: Pick<Doc<"staffs">, "positionSkills">,
  activePositions: ReadonlyArray<Pick<Doc<"positions">, "_id">>,
) {
  const levelByPositionId = new Map((staff.positionSkills ?? []).map((skill) => [skill.positionId, skill.level]));
  const skills = activePositions.flatMap((position) => {
    const level = levelByPositionId.get(position._id);
    return level ? [{ positionId: position._id, level }] : [];
  });
  const unavailableCount = skills.filter((skill) => skill.level === "unavailable").length;
  return unavailableCount >= activePositions.length ? skills.filter((skill) => skill.level !== "unavailable") : skills;
}

export const ACTIVE_POSITION_LIMIT_MESSAGE = `ポジションは${POSITION_ACTIVE_LIMIT}件まで登録できます`;
