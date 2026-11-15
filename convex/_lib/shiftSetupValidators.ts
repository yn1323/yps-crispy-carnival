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

/** 省略を「標準」として扱うため、保存する値は標準以外だけにする。 */
export const staffSkillLevelValidator = v.union(v.literal("newcomer"), v.literal("lead"));

export const shiftBreakRuleValidator = v.object({
  minWorkMinutes: v.number(),
  breakMinutes: v.number(),
});

/** 日の型の区切り。募集方式ごとに、時間帯、勤務パターン、終日のいずれかになる。 */
export const shiftDayTemplateSlotKeyValidator = v.union(
  v.object({ kind: v.literal("time"), startTime: v.string(), endTime: v.string() }),
  v.object({ kind: v.literal("shiftType"), optionId: v.string() }),
  v.object({ kind: v.literal("allDay") }),
);

export const shiftDayTemplateRequirementValidator = v.object({
  positionId: v.id("positions"),
  count: v.number(),
});

export const shiftDayTemplateSlotValidator = v.object({
  key: shiftDayTemplateSlotKeyValidator,
  requirements: v.array(shiftDayTemplateRequirementValidator),
});
