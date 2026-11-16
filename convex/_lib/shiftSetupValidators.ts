import { v } from "convex/values";

export const shiftDayTemplateWeekdayValidator = v.union(
  v.literal("sun"),
  v.literal("mon"),
  v.literal("tue"),
  v.literal("wed"),
  v.literal("thu"),
  v.literal("fri"),
  v.literal("sat"),
);

/**
 * スタッフとポジションの組み合わせごとの扱い。
 * 項目がないポジションは「入れる・熟練度が標準」として扱うため、標準以外だけを持つ。
 */
export const staffPositionSkillValidator = v.object({
  positionId: v.id("positions"),
  level: v.union(v.literal("unavailable"), v.literal("newcomer"), v.literal("lead")),
});

export const shiftBreakRuleValidator = v.object({
  minWorkMinutes: v.number(),
  breakMinutes: v.number(),
});

/** 時間指定の必要人数。1本のバーが1人分で、ある時刻の必要人数は重なったバーの本数になる。 */
export const staffingBarValidator = v.object({
  positionId: v.id("positions"),
  startTime: v.string(),
  endTime: v.string(),
});

/** パターン選択と日付選択の必要人数。ポジションごとの人数を持つ。 */
export const staffingCountValidator = v.object({
  positionId: v.id("positions"),
  count: v.number(),
});

/** 1日分の必要人数。希望シフトの集め方ごとに、バー、勤務パターンごとの人数、1日の人数のいずれかになる。 */
export const dayRequirementsValidator = v.union(
  v.object({ kind: v.literal("time"), bars: v.array(staffingBarValidator) }),
  v.object({
    kind: v.literal("shiftType"),
    options: v.array(v.object({ optionId: v.string(), counts: v.array(staffingCountValidator) })),
  }),
  v.object({ kind: v.literal("dateOnly"), counts: v.array(staffingCountValidator) }),
);
