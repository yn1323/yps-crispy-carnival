import { getWeekday } from "../_lib/dateFormat";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { isSupportedShiftTime, timeToMinutes } from "../_lib/time";

// 日の型（1日分の「区切り＋ポジション別の必要人数」）の純粋処理。
// サーバー（mutations.ts）とフロント（設定ページ・シフト表）で共有する。
// DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

export const SHIFT_SETUP_WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type ShiftSetupWeekday = (typeof SHIFT_SETUP_WEEKDAYS)[number];

export type DayTemplateSlotKey =
  | { kind: "time"; startTime: string; endTime: string }
  | { kind: "shiftType"; optionId: string }
  | { kind: "allDay" };

export type DayTemplateRequirement<PositionId extends string = string> = {
  positionId: PositionId;
  count: number;
};

export type DayTemplateSlot<PositionId extends string = string> = {
  key: DayTemplateSlotKey;
  requirements: DayTemplateRequirement<PositionId>[];
};

export type DayTemplate<TemplateId extends string = string, PositionId extends string = string> = {
  id: TemplateId;
  name: string;
  weekdays: ShiftSetupWeekday[];
  slots: DayTemplateSlot<PositionId>[];
};

/** 区切りを一意に識別する文字列。画面のkeyと、同じ区切りの重複検出に使う。 */
export function dayTemplateSlotKeyId(key: DayTemplateSlotKey): string {
  if (key.kind === "time") return `time:${key.startTime}-${key.endTime}`;
  if (key.kind === "shiftType") return `shiftType:${key.optionId}`;
  return "allDay";
}

/** 提出方法から、最初の型へ入れる区切りの初期値を作る。必要人数は入れない。 */
export function buildDefaultDayTemplateSlotKeys(pattern: ShiftSubmissionPattern): DayTemplateSlotKey[] {
  if (pattern.kind === "time") {
    return [{ kind: "time", startTime: pattern.startTime, endTime: pattern.endTime }];
  }
  if (pattern.kind === "shiftType") {
    return pattern.options.map((option) => ({ kind: "shiftType", optionId: option.id }));
  }
  return [{ kind: "allDay" }];
}

/** 区切りが、いまの提出方法で意味を持つかを返す。提出方法を変えた後に残った区切りを除くために使う。 */
export function isDayTemplateSlotKeyForPattern(key: DayTemplateSlotKey, pattern: ShiftSubmissionPattern): boolean {
  if (pattern.kind === "time") {
    if (key.kind !== "time") return false;
    if (!isSupportedShiftTime(key.startTime) || !isSupportedShiftTime(key.endTime)) return false;
    return (
      timeToMinutes(key.startTime) < timeToMinutes(key.endTime) &&
      timeToMinutes(key.startTime) >= timeToMinutes(pattern.startTime) &&
      timeToMinutes(key.endTime) <= timeToMinutes(pattern.endTime)
    );
  }
  if (pattern.kind === "shiftType") {
    return key.kind === "shiftType" && pattern.options.some((option) => option.id === key.optionId);
  }
  return key.kind === "allDay";
}

/** いまの提出方法に合う区切りだけを残し、時間帯は開始順、勤務パターンは設定順に並べる。 */
export function projectDayTemplateSlotsForPattern<Slot extends { key: DayTemplateSlotKey }>(
  slots: readonly Slot[],
  pattern: ShiftSubmissionPattern,
): Slot[] {
  const matching = slots.filter((slot) => isDayTemplateSlotKeyForPattern(slot.key, pattern));
  if (pattern.kind === "time") {
    return matching.slice().sort((left, right) => {
      if (left.key.kind !== "time" || right.key.kind !== "time") return 0;
      return (
        timeToMinutes(left.key.startTime) - timeToMinutes(right.key.startTime) ||
        timeToMinutes(left.key.endTime) - timeToMinutes(right.key.endTime)
      );
    });
  }
  if (pattern.kind === "shiftType") {
    const order = new Map(pattern.options.map((option, index) => [option.id, index]));
    return matching.slice().sort((left, right) => {
      if (left.key.kind !== "shiftType" || right.key.kind !== "shiftType") return 0;
      return (order.get(left.key.optionId) ?? 0) - (order.get(right.key.optionId) ?? 0);
    });
  }
  return matching.slice(0, 1);
}

export type DayTemplateIssue =
  | "TEMPLATE_LIMIT"
  | "NAME_REQUIRED"
  | "NAME_TOO_LONG"
  | "NAME_DUPLICATED"
  | "WEEKDAY_DUPLICATED"
  | "SLOT_LIMIT"
  | "SLOT_NOT_FOR_PATTERN"
  | "SLOT_DUPLICATED"
  | "SLOT_OVERLAP"
  | "REQUIREMENT_DUPLICATED"
  | "REQUIREMENT_COUNT_INVALID";

export const DAY_TEMPLATE_ISSUE_MESSAGES: Record<DayTemplateIssue, string> = {
  TEMPLATE_LIMIT: "日の型が上限を超えています",
  NAME_REQUIRED: "型の名前を入力してください",
  NAME_TOO_LONG: "型の名前が長すぎます",
  NAME_DUPLICATED: "型の名前が重複しています",
  WEEKDAY_DUPLICATED: "同じ曜日を2つの型に割り当てることはできません",
  SLOT_LIMIT: "時間帯が上限を超えています",
  SLOT_NOT_FOR_PATTERN: "希望シフトの集め方に合わない区切りがあります",
  SLOT_DUPLICATED: "同じ区切りが重複しています",
  SLOT_OVERLAP: "時間帯が重なっています",
  REQUIREMENT_DUPLICATED: "同じポジションの必要人数が重複しています",
  REQUIREMENT_COUNT_INVALID: "必要人数が正しくありません",
};

type DayTemplateValidationInput = {
  templates: ReadonlyArray<{
    name: string;
    weekdays: readonly ShiftSetupWeekday[];
    slots: ReadonlyArray<{
      key: DayTemplateSlotKey;
      requirements: ReadonlyArray<{ positionId: string; count: number }>;
    }>;
  }>;
  pattern: ShiftSubmissionPattern;
  limits: { templates: number; nameLength: number; slots: number; requiredCount: number };
};

/** 日の型の一覧を検証し、最初に見つけた違反を返す。違反がなければnullを返す。 */
export function findDayTemplateIssue(input: DayTemplateValidationInput): DayTemplateIssue | null {
  if (input.templates.length > input.limits.templates) return "TEMPLATE_LIMIT";

  const names = new Set<string>();
  const weekdays = new Set<ShiftSetupWeekday>();
  for (const template of input.templates) {
    const name = template.name.trim();
    if (!name) return "NAME_REQUIRED";
    if (name.length > input.limits.nameLength) return "NAME_TOO_LONG";
    if (names.has(name)) return "NAME_DUPLICATED";
    names.add(name);

    for (const weekday of template.weekdays) {
      if (weekdays.has(weekday)) return "WEEKDAY_DUPLICATED";
      weekdays.add(weekday);
    }

    if (template.slots.length > input.limits.slots) return "SLOT_LIMIT";
    const slotIds = new Set<string>();
    const timeRanges: Array<{ start: number; end: number }> = [];
    for (const slot of template.slots) {
      if (!isDayTemplateSlotKeyForPattern(slot.key, input.pattern)) return "SLOT_NOT_FOR_PATTERN";
      const slotId = dayTemplateSlotKeyId(slot.key);
      if (slotIds.has(slotId)) return "SLOT_DUPLICATED";
      slotIds.add(slotId);
      if (slot.key.kind === "time") {
        const start = timeToMinutes(slot.key.startTime);
        const end = timeToMinutes(slot.key.endTime);
        if (timeRanges.some((range) => start < range.end && end > range.start)) return "SLOT_OVERLAP";
        timeRanges.push({ start, end });
      }

      const positionIds = new Set<string>();
      for (const requirement of slot.requirements) {
        if (positionIds.has(requirement.positionId)) return "REQUIREMENT_DUPLICATED";
        positionIds.add(requirement.positionId);
        if (
          !Number.isInteger(requirement.count) ||
          requirement.count < 0 ||
          requirement.count > input.limits.requiredCount
        ) {
          return "REQUIREMENT_COUNT_INVALID";
        }
      }
    }
  }
  return null;
}

/** その日に当てる日の型を返す。特別な日の指定を曜日の割り当てより優先する。 */
export function resolveDayTemplateForDate<Template extends { id: string; weekdays: readonly ShiftSetupWeekday[] }>(
  date: string,
  templates: readonly Template[],
  overrides: ReadonlyArray<{ date: string; templateId: string }>,
): Template | null {
  const override = overrides.find((entry) => entry.date === date);
  if (override) {
    const overridden = templates.find((template) => template.id === override.templateId);
    if (overridden) return overridden;
  }
  const weekday = SHIFT_SETUP_WEEKDAYS[getWeekday(date)];
  return templates.find((template) => template.weekdays.includes(weekday)) ?? null;
}
