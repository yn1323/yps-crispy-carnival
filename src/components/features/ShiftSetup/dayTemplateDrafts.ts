import {
  SHIFT_DAY_TEMPLATE_LIMIT,
  SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH,
  SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
  SHIFT_DAY_TEMPLATE_SLOT_LIMIT,
} from "@/convex/constants";
import {
  buildDefaultDayTemplateSlotKeys,
  type DayTemplateIssue,
  type DayTemplateSlotKey,
  dayTemplateSlotKeyId,
  findDayTemplateIssue,
  projectDayTemplateSlotsForPattern,
  SHIFT_SETUP_WEEKDAYS,
  type ShiftSetupWeekday,
} from "@/convex/shiftSetup/dayTemplates";
import {
  formatShiftClockTimeRange,
  generateShiftTimeOptions,
  minutesToTime,
  type ShiftTimeOption,
  timeToMinutes,
} from "@/src/domains/shift/time";
import type {
  DayTemplateDraft,
  DayTemplateInput,
  DayTemplateSlotDraft,
  ShiftSetupPosition,
  ShiftSetupSubmissionPattern,
} from "./types";

// 日の型（曜日ごとの必要人数）を編集するための純粋処理。
// 検証と区切りの形は convex/shiftSetup/dayTemplates.ts を正とし、ここでは編集中の値の操作だけを持つ。

type SlotSource = {
  key: DayTemplateSlotKey;
  requirements: ReadonlyArray<{ positionId: string; count: number }>;
};

type TemplateSource = {
  name: string;
  weekdays: readonly ShiftSetupWeekday[];
  slots: readonly SlotSource[];
};

const DAY_TEMPLATE_LIMITS = {
  templates: SHIFT_DAY_TEMPLATE_LIMIT,
  nameLength: SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH,
  slots: SHIFT_DAY_TEMPLATE_SLOT_LIMIT,
  requiredCount: SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
};

const FIRST_TEMPLATE_NAME = "通常";
const TIME_SLOT_STEP_MINUTES = 30;
/** 2つに分けられる時間帯の最短の長さ。分けたあとの両方が30分以上になる。 */
const SPLITTABLE_SLOT_MINUTES = TIME_SLOT_STEP_MINUTES * 2;

function toCounts(requirements: SlotSource["requirements"]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const requirement of requirements) {
    if (requirement.count > 0) counts[requirement.positionId] = requirement.count;
  }
  return counts;
}

/**
 * 保存済みの区切りを、いまの提出方法で編集する行へ直す。
 * パターン選択は勤務パターンごと、日付選択は1日の1行を必ず出す。
 */
function toSlotDrafts(slots: readonly SlotSource[], pattern: ShiftSetupSubmissionPattern): DayTemplateSlotDraft[] {
  if (pattern.kind === "shiftType") {
    return pattern.options.map((option) => {
      const key: DayTemplateSlotKey = { kind: "shiftType", optionId: option.id };
      const saved = slots.find((slot) => slot.key.kind === "shiftType" && slot.key.optionId === option.id);
      return { rowKey: dayTemplateSlotKeyId(key), key, counts: toCounts(saved?.requirements ?? []) };
    });
  }
  if (pattern.kind === "dateOnly") {
    const key: DayTemplateSlotKey = { kind: "allDay" };
    const saved = slots.find((slot) => slot.key.kind === "allDay");
    return [{ rowKey: dayTemplateSlotKeyId(key), key, counts: toCounts(saved?.requirements ?? []) }];
  }
  return projectDayTemplateSlotsForPattern(slots, pattern).map((slot) => ({
    rowKey: dayTemplateSlotKeyId(slot.key),
    key: slot.key,
    counts: toCounts(slot.requirements),
  }));
}

/** 保存済みの日の型を、編集中の形へ直す。 */
export function toDayTemplateDrafts(
  templates: ReadonlyArray<TemplateSource & { _id: DayTemplateDraft["id"] & string }>,
  pattern: ShiftSetupSubmissionPattern,
): DayTemplateDraft[] {
  return templates.map((template) => ({
    rowKey: template._id,
    id: template._id,
    name: template.name,
    weekdays: [...template.weekdays],
    slots: toSlotDrafts(template.slots, pattern),
  }));
}

/** AIサポートの下書きを、まだ保存していない新しい型として編集中の形へ直す。 */
export function toDayTemplateDraftsFromSuggestion(
  templates: readonly TemplateSource[],
  pattern: ShiftSetupSubmissionPattern,
  createRowKey: () => string,
): DayTemplateDraft[] {
  return templates.map((template) => ({
    rowKey: createRowKey(),
    name: template.name,
    weekdays: [...template.weekdays],
    slots: toSlotDrafts(template.slots, pattern),
  }));
}

/** どの型にも割り当てていない曜日を返す。 */
export function getUnassignedWeekdays(drafts: readonly DayTemplateDraft[]): ShiftSetupWeekday[] {
  const assigned = new Set(drafts.flatMap((draft) => draft.weekdays));
  return SHIFT_SETUP_WEEKDAYS.filter((weekday) => !assigned.has(weekday));
}

function createDefaultName(drafts: readonly DayTemplateDraft[]): string {
  const names = new Set(drafts.map((draft) => draft.name.trim()));
  if (drafts.length === 0) return FIRST_TEMPLATE_NAME;
  for (let number = drafts.length + 1; ; number += 1) {
    const name = `型${number}`;
    if (!names.has(name)) return name;
  }
}

/**
 * 新しく足す型を作る。
 * 曜日は、まだ割り当てていない営業日を初期値にする。
 * 区切りと人数は、直前の型があればそれを写し、なければ提出方法から作る。
 */
export function createDayTemplateDraft(input: {
  drafts: readonly DayTemplateDraft[];
  pattern: ShiftSetupSubmissionPattern;
  regularClosedDays: readonly ShiftSetupWeekday[];
  rowKey: string;
}): DayTemplateDraft {
  const closedDays = new Set(input.regularClosedDays);
  const previous = input.drafts.at(-1);
  const slots: DayTemplateSlotDraft[] = previous
    ? previous.slots.map((slot) => ({ ...slot, counts: { ...slot.counts } }))
    : buildDefaultDayTemplateSlotKeys(input.pattern).map((key) => ({
        rowKey: dayTemplateSlotKeyId(key),
        key,
        counts: {},
      }));

  return {
    rowKey: input.rowKey,
    name: createDefaultName(input.drafts),
    weekdays: getUnassignedWeekdays(input.drafts).filter((weekday) => !closedDays.has(weekday)),
    slots,
  };
}

function updateDraft(
  drafts: readonly DayTemplateDraft[],
  rowKey: string,
  update: (draft: DayTemplateDraft) => DayTemplateDraft,
): DayTemplateDraft[] {
  return drafts.map((draft) => (draft.rowKey === rowKey ? update(draft) : draft));
}

function updateSlot(
  drafts: readonly DayTemplateDraft[],
  templateRowKey: string,
  slotRowKey: string,
  update: (slot: DayTemplateSlotDraft) => DayTemplateSlotDraft,
): DayTemplateDraft[] {
  return updateDraft(drafts, templateRowKey, (draft) => ({
    ...draft,
    slots: draft.slots.map((slot) => (slot.rowKey === slotRowKey ? update(slot) : slot)),
  }));
}

export function renameDayTemplate(drafts: readonly DayTemplateDraft[], rowKey: string, name: string) {
  return updateDraft(drafts, rowKey, (draft) => ({ ...draft, name }));
}

export function removeDayTemplate(drafts: readonly DayTemplateDraft[], rowKey: string) {
  return drafts.filter((draft) => draft.rowKey !== rowKey);
}

/**
 * 曜日の割り当てを切り替える。
 * 1つの曜日は1つの型にだけ割り当てられるため、別の型が持つ曜日を選んだら、その型から外して移す。
 */
export function toggleDayTemplateWeekday(
  drafts: readonly DayTemplateDraft[],
  rowKey: string,
  weekday: ShiftSetupWeekday,
): DayTemplateDraft[] {
  const target = drafts.find((draft) => draft.rowKey === rowKey);
  if (!target) return [...drafts];
  const isAssigned = target.weekdays.includes(weekday);

  return drafts.map((draft) => {
    if (draft.rowKey === rowKey) {
      return {
        ...draft,
        weekdays: isAssigned ? draft.weekdays.filter((day) => day !== weekday) : [...draft.weekdays, weekday],
      };
    }
    return draft.weekdays.includes(weekday)
      ? { ...draft, weekdays: draft.weekdays.filter((day) => day !== weekday) }
      : draft;
  });
}

/** 必要人数を増減する。0から上限までの範囲に収める。 */
export function changeRequiredCount(
  drafts: readonly DayTemplateDraft[],
  target: { templateRowKey: string; slotRowKey: string; positionId: string },
  delta: number,
): DayTemplateDraft[] {
  return updateSlot(drafts, target.templateRowKey, target.slotRowKey, (slot) => {
    const current = slot.counts[target.positionId] ?? 0;
    const next = Math.min(SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX, Math.max(0, current + delta));
    const counts = { ...slot.counts };
    if (next > 0) counts[target.positionId] = next;
    else delete counts[target.positionId];
    return { ...slot, counts };
  });
}

export function changeTimeSlotRange(
  drafts: readonly DayTemplateDraft[],
  target: { templateRowKey: string; slotRowKey: string },
  patch: { startTime?: string; endTime?: string },
): DayTemplateDraft[] {
  return updateSlot(drafts, target.templateRowKey, target.slotRowKey, (slot) =>
    slot.key.kind === "time" ? { ...slot, key: { ...slot.key, ...patch } } : slot,
  );
}

export function removeDayTemplateSlot(
  drafts: readonly DayTemplateDraft[],
  target: { templateRowKey: string; slotRowKey: string },
): DayTemplateDraft[] {
  return updateDraft(drafts, target.templateRowKey, (draft) => ({
    ...draft,
    slots: draft.slots.filter((slot) => slot.rowKey !== target.slotRowKey),
  }));
}

type TimeSlotRange = { rowKey: string; start: number; end: number };

function toTimeRanges(slots: readonly DayTemplateSlotDraft[]): TimeSlotRange[] {
  return slots
    .flatMap((slot) =>
      slot.key.kind === "time"
        ? [{ rowKey: slot.rowKey, start: timeToMinutes(slot.key.startTime), end: timeToMinutes(slot.key.endTime) }]
        : [],
    )
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

type TimeSlotAddition =
  | { kind: "fill"; start: number; end: number }
  | { kind: "split"; rowKey: string; at: number }
  | null;

/**
 * 時間帯の足し方を決める。
 * 受付時間の中に空きがあれば、最初の空きを埋める。空きがなければ、最後の時間帯を2つに分ける。
 */
function planTimeSlotAddition(
  slots: readonly DayTemplateSlotDraft[],
  pattern: ShiftSetupSubmissionPattern,
): TimeSlotAddition {
  if (pattern.kind !== "time" || slots.length >= SHIFT_DAY_TEMPLATE_SLOT_LIMIT) return null;

  const ranges = toTimeRanges(slots);
  const patternEnd = timeToMinutes(pattern.endTime);
  let cursor = timeToMinutes(pattern.startTime);
  for (const range of ranges) {
    if (range.start > cursor) return { kind: "fill", start: cursor, end: Math.min(range.start, patternEnd) };
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < patternEnd) return { kind: "fill", start: cursor, end: patternEnd };

  const splittable = ranges.filter((range) => range.end - range.start >= SPLITTABLE_SLOT_MINUTES);
  const last = ranges.at(-1);
  const target =
    last && splittable.includes(last)
      ? last
      : splittable.reduce<TimeSlotRange | null>(
          (longest, range) => (!longest || range.end - range.start >= longest.end - longest.start ? range : longest),
          null,
        );
  if (!target) return null;

  const middle = (target.start + target.end) / 2;
  const onTheHour = Math.round(middle / 60) * 60;
  const at =
    onTheHour > target.start && onTheHour < target.end
      ? onTheHour
      : Math.floor(middle / TIME_SLOT_STEP_MINUTES) * TIME_SLOT_STEP_MINUTES;
  return { kind: "split", rowKey: target.rowKey, at };
}

export function canAddTimeSlot(draft: DayTemplateDraft, pattern: ShiftSetupSubmissionPattern): boolean {
  return planTimeSlotAddition(draft.slots, pattern) !== null;
}

/**
 * 時間帯を1つ足す。
 * 分けて足した時間帯には、元の時間帯の必要人数を写す。
 */
export function addTimeSlot(
  drafts: readonly DayTemplateDraft[],
  templateRowKey: string,
  pattern: ShiftSetupSubmissionPattern,
  rowKey: string,
): DayTemplateDraft[] {
  return updateDraft(drafts, templateRowKey, (draft) => {
    const plan = planTimeSlotAddition(draft.slots, pattern);
    if (!plan) return draft;

    const slots: DayTemplateSlotDraft[] =
      plan.kind === "fill"
        ? [
            ...draft.slots,
            {
              rowKey,
              key: { kind: "time", startTime: minutesToTime(plan.start), endTime: minutesToTime(plan.end) },
              counts: {},
            },
          ]
        : draft.slots.flatMap((slot) => {
            if (slot.rowKey !== plan.rowKey || slot.key.kind !== "time") return [slot];
            const at = minutesToTime(plan.at);
            return [
              { ...slot, key: { ...slot.key, endTime: at } },
              { rowKey, key: { ...slot.key, startTime: at }, counts: { ...slot.counts } },
            ];
          });
    return { ...draft, slots: sortSlots(slots) };
  });
}

function sortSlots(slots: readonly DayTemplateSlotDraft[]): DayTemplateSlotDraft[] {
  return slots.slice().sort((left, right) => {
    if (left.key.kind !== "time" || right.key.kind !== "time") return 0;
    return (
      timeToMinutes(left.key.startTime) - timeToMinutes(right.key.startTime) ||
      timeToMinutes(left.key.endTime) - timeToMinutes(right.key.endTime)
    );
  });
}

/**
 * 保存する形へ直す。
 * 人数0と、いまは無いポジションの人数は送らない。時間帯は開始の早い順に並べる。
 */
export function toDayTemplateInputs(
  drafts: readonly DayTemplateDraft[],
  positions: ReadonlyArray<Pick<ShiftSetupPosition, "_id">>,
): DayTemplateInput[] {
  return drafts.map((draft) => ({
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name,
    weekdays: SHIFT_SETUP_WEEKDAYS.filter((weekday) => draft.weekdays.includes(weekday)),
    slots: sortSlots(draft.slots).map((slot) => ({
      key: slot.key,
      requirements: positions.flatMap((position) => {
        const count = slot.counts[position._id] ?? 0;
        return count > 0 ? [{ positionId: position._id, count }] : [];
      }),
    })),
  }));
}

export function isSameDayTemplateInputs(left: readonly DayTemplateInput[], right: readonly DayTemplateInput[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * 型ごとの入力の誤りを返す。誤りのない型は結果に含めない。
 * 型をまたぐ誤りのうち名前の重複は、あとから出てくる型の誤りとして返す。
 */
export function findDayTemplateDraftIssues(
  drafts: readonly DayTemplateDraft[],
  pattern: ShiftSetupSubmissionPattern,
  positions: ReadonlyArray<Pick<ShiftSetupPosition, "_id">>,
): Record<string, DayTemplateIssue> {
  const inputs = toDayTemplateInputs(drafts, positions);
  const issues: Record<string, DayTemplateIssue> = {};
  const names = new Set<string>();

  drafts.forEach((draft, index) => {
    const name = draft.name.trim();
    const issue =
      findDayTemplateIssue({ templates: [inputs[index]], pattern, limits: DAY_TEMPLATE_LIMITS }) ??
      (names.has(name) ? "NAME_DUPLICATED" : null);
    if (issue) issues[draft.rowKey] = issue;
    names.add(name);
  });
  return issues;
}

/** 型の一覧全体を検証する。型ごとの検証では見つからない件数の上限も含む。 */
export function findDayTemplateInputsIssue(
  inputs: readonly DayTemplateInput[],
  pattern: ShiftSetupSubmissionPattern,
): DayTemplateIssue | null {
  return findDayTemplateIssue({ templates: inputs, pattern, limits: DAY_TEMPLATE_LIMITS });
}

export type DayTemplateSlotLabel = { title: string; detail?: string };

/** 区切りの見出しを返す。勤務パターンは名前と時刻、日付選択は「1日」を出す。 */
export function getDayTemplateSlotLabel(
  key: DayTemplateSlotKey,
  pattern: ShiftSetupSubmissionPattern,
): DayTemplateSlotLabel {
  if (key.kind === "time") return { title: formatShiftClockTimeRange(key.startTime, key.endTime) };
  if (key.kind === "allDay") return { title: "1日" };

  const option = pattern.kind === "shiftType" ? pattern.options.find((item) => item.id === key.optionId) : undefined;
  if (!option) return { title: "勤務パターン" };
  return { title: option.name, detail: formatShiftClockTimeRange(option.startTime, option.endTime) };
}

/** 時間帯の開始に選べる時刻。受付時間の中で、終了より前に限る。 */
export function getTimeSlotStartOptions(pattern: ShiftSetupSubmissionPattern, endTime: string): ShiftTimeOption[] {
  if (pattern.kind !== "time") return [];
  return generateShiftTimeOptions({
    startMinutes: timeToMinutes(pattern.startTime),
    endMinutes: Math.min(timeToMinutes(pattern.endTime), timeToMinutes(endTime)) - TIME_SLOT_STEP_MINUTES,
  });
}

/** 時間帯の終了に選べる時刻。受付時間の中で、開始より後に限る。 */
export function getTimeSlotEndOptions(pattern: ShiftSetupSubmissionPattern, startTime: string): ShiftTimeOption[] {
  if (pattern.kind !== "time") return [];
  const patternStart = timeToMinutes(pattern.startTime);
  const firstEnd = Math.max(patternStart, timeToMinutes(startTime)) + TIME_SLOT_STEP_MINUTES;
  // 受付時間の開始から30分刻みの時刻にそろえ、開始より後の最初の時刻から並べる。
  const offset = (firstEnd - patternStart) % TIME_SLOT_STEP_MINUTES;
  return generateShiftTimeOptions({
    startMinutes: offset === 0 ? firstEnd : firstEnd + TIME_SLOT_STEP_MINUTES - offset,
    endMinutes: timeToMinutes(pattern.endTime),
  });
}
