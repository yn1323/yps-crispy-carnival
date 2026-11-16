import { getWeekday } from "../_lib/dateFormat";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { isSupportedShiftTime, minutesToTime, timeToMinutes } from "../_lib/time";
import {
  SHIFT_BOARD_TIME_UNIT_MINUTES,
  SHIFT_DAY_TEMPLATE_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_LIMIT,
  SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH,
  SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
} from "../constants";

// 日の型（名前を付けた1日分の必要人数）と、その日に当たる必要人数の純粋処理。
// サーバー（mutations.ts、シフト表のquery）とフロント（設定ページ・シフト表）で共有する。
// DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

export const SHIFT_SETUP_WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type ShiftSetupWeekday = (typeof SHIFT_SETUP_WEEKDAYS)[number];

/** 時間指定の必要人数。1本が1人分で、ある時刻の必要人数は重なったバーの本数になる。 */
export type StaffingBar<PositionId extends string = string> = {
  positionId: PositionId;
  startTime: string;
  endTime: string;
};

export type StaffingCount<PositionId extends string = string> = {
  positionId: PositionId;
  count: number;
};

/** 1日分の必要人数。種類は希望シフトの集め方（時間指定、パターン選択、日付選択）に対応する。 */
export type DayRequirements<PositionId extends string = string> =
  | { kind: "time"; bars: StaffingBar<PositionId>[] }
  | { kind: "shiftType"; options: Array<{ optionId: string; counts: StaffingCount<PositionId>[] }> }
  | { kind: "dateOnly"; counts: StaffingCount<PositionId>[] };

export type DayRequirementsKind = DayRequirements["kind"];

export type DayTemplate<TemplateId extends string = string, PositionId extends string = string> = {
  id: TemplateId;
  name: string;
  weekdays: ShiftSetupWeekday[];
  appliesToHolidays: boolean;
  requirements: DayRequirements<PositionId>;
};

type TimeRange = { startTime: string; endTime: string };

/** 必要人数を何も入れていない状態を、集め方の種類に合わせて作る。 */
export function buildEmptyDayRequirements(kind: DayRequirementsKind): DayRequirements<never> {
  if (kind === "time") return { kind: "time", bars: [] };
  if (kind === "shiftType") return { kind: "shiftType", options: [] };
  return { kind: "dateOnly", counts: [] };
}

/** バーを開始、終了、ポジションの順に並べる比較。隣り合うバーは結合しないため、並びだけを安定させる。 */
export function compareStaffingBars(left: StaffingBar, right: StaffingBar): number {
  return (
    timeToMinutes(left.startTime) - timeToMinutes(right.startTime) ||
    timeToMinutes(left.endTime) - timeToMinutes(right.endTime) ||
    (left.positionId < right.positionId ? -1 : left.positionId > right.positionId ? 1 : 0)
  );
}

/** 同じ時刻に重なるバーの最大の本数を返す。終了と開始が同じ時刻のバーは重なりに数えない。 */
export function countMaxConcurrentStaffingBars(bars: ReadonlyArray<TimeRange>): number {
  const edges = bars.flatMap((bar) => [
    { minutes: timeToMinutes(bar.startTime), delta: 1 },
    { minutes: timeToMinutes(bar.endTime), delta: -1 },
  ]);
  // 同じ時刻では終了を先に数え、交代のバーを重なりにしない。
  edges.sort((left, right) => left.minutes - right.minutes || left.delta - right.delta);
  let current = 0;
  let max = 0;
  for (const edge of edges) {
    current += edge.delta;
    max = Math.max(max, current);
  }
  return max;
}

function isStaffingBarWithinRange(bar: TimeRange, range: TimeRange): boolean {
  return (
    timeToMinutes(bar.startTime) >= timeToMinutes(range.startTime) &&
    timeToMinutes(bar.endTime) <= timeToMinutes(range.endTime)
  );
}

/** 受付時間の外へ出ているバー（一部でも外に出ているもの）の本数を返す。 */
export function countStaffingBarsOutsideRange(bars: ReadonlyArray<TimeRange>, range: TimeRange): number {
  return bars.filter((bar) => !isStaffingBarWithinRange(bar, range)).length;
}

/**
 * バーを受付時間の内側へ切りそろえる。完全に外のバーは落とし、またぐバーは内側だけを残す。
 * 設定ページの「受付時間に合わせる」と、募集の受付時間への射影で使う。
 */
export function clipStaffingBarsToRange<PositionId extends string>(
  bars: ReadonlyArray<StaffingBar<PositionId>>,
  range: TimeRange,
): StaffingBar<PositionId>[] {
  // 切った端が刻みから外れると保存できないため、刻みに乗る内側の時刻へ切る。
  const unit = SHIFT_BOARD_TIME_UNIT_MINUTES;
  const rangeStart = Math.ceil(timeToMinutes(range.startTime) / unit) * unit;
  const rangeEnd = Math.floor(timeToMinutes(range.endTime) / unit) * unit;
  return bars
    .flatMap((bar) => {
      const start = timeToMinutes(bar.startTime);
      const end = timeToMinutes(bar.endTime);
      if (Math.max(start, rangeStart) >= Math.min(end, rangeEnd)) return [];
      return [
        {
          positionId: bar.positionId,
          startTime: start < rangeStart ? minutesToTime(rangeStart) : bar.startTime,
          endTime: end > rangeEnd ? minutesToTime(rangeEnd) : bar.endTime,
        },
      ];
    })
    .sort(compareStaffingBars);
}

export type DayTemplateIssue =
  | "TEMPLATE_LIMIT"
  | "NAME_REQUIRED"
  | "NAME_TOO_LONG"
  | "NAME_DUPLICATED"
  | "WEEKDAY_DUPLICATED"
  | "HOLIDAY_DUPLICATED"
  | "REQUIREMENTS_KIND_MISMATCH"
  | "BAR_LIMIT"
  | "BAR_TIME_INVALID"
  | "BAR_TIME_ORDER"
  | "BAR_TIME_UNIT"
  | "BAR_OUT_OF_RANGE"
  | "BAR_CONCURRENT_LIMIT"
  | "OPTION_NOT_FOUND"
  | "OPTION_DUPLICATED"
  | "COUNT_DUPLICATED"
  | "COUNT_INVALID";

export const DAY_TEMPLATE_ISSUE_MESSAGES: Record<DayTemplateIssue, string> = {
  TEMPLATE_LIMIT: `型は${SHIFT_DAY_TEMPLATE_LIMIT}件まで作れます`,
  NAME_REQUIRED: "型の名前を入力してください",
  NAME_TOO_LONG: `型の名前は${SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH}文字以内で入力してください`,
  NAME_DUPLICATED: "型の名前が重複しています",
  WEEKDAY_DUPLICATED: "同じ曜日を2つの型に割り当てることはできません",
  HOLIDAY_DUPLICATED: "祝日に使う型は1つだけ選べます",
  REQUIREMENTS_KIND_MISMATCH: "希望シフトの集め方に合わない必要人数があります",
  BAR_LIMIT: `バーは1つの型に${SHIFT_DAY_TEMPLATE_BAR_LIMIT}本まで置けます`,
  BAR_TIME_INVALID: "バーの時間の形式が正しくありません",
  BAR_TIME_ORDER: "バーの終了時間は開始時間より後にしてください",
  BAR_TIME_UNIT: `バーの時間は${SHIFT_BOARD_TIME_UNIT_MINUTES}分単位にしてください`,
  BAR_OUT_OF_RANGE: "受付時間の外に出ているバーがあります",
  BAR_CONCURRENT_LIMIT: `同じ時間に重ねられるバーは、1つのポジションで${SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT}本までです`,
  OPTION_NOT_FOUND: "勤務パターンが見つかりません",
  OPTION_DUPLICATED: "同じ勤務パターンの必要人数が重複しています",
  COUNT_DUPLICATED: "同じポジションの必要人数が重複しています",
  COUNT_INVALID: "必要人数が正しくありません",
};

function findStaffingCountIssue(counts: ReadonlyArray<StaffingCount>): DayTemplateIssue | null {
  const positionIds = new Set<string>();
  for (const entry of counts) {
    if (positionIds.has(entry.positionId)) return "COUNT_DUPLICATED";
    positionIds.add(entry.positionId);
    if (!Number.isInteger(entry.count) || entry.count < 0 || entry.count > SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX) {
      return "COUNT_INVALID";
    }
  }
  return null;
}

function findStaffingBarIssue(bars: ReadonlyArray<StaffingBar>, range: TimeRange): DayTemplateIssue | null {
  if (bars.length > SHIFT_DAY_TEMPLATE_BAR_LIMIT) return "BAR_LIMIT";

  const barsByPosition = new Map<string, StaffingBar[]>();
  for (const bar of bars) {
    if (!isSupportedShiftTime(bar.startTime) || !isSupportedShiftTime(bar.endTime)) return "BAR_TIME_INVALID";
    const start = timeToMinutes(bar.startTime);
    const end = timeToMinutes(bar.endTime);
    if (start >= end) return "BAR_TIME_ORDER";
    // 開始と終了を刻みにそろえると、長さも刻み以上になる。
    if (start % SHIFT_BOARD_TIME_UNIT_MINUTES !== 0 || end % SHIFT_BOARD_TIME_UNIT_MINUTES !== 0) {
      return "BAR_TIME_UNIT";
    }
    if (!isStaffingBarWithinRange(bar, range)) return "BAR_OUT_OF_RANGE";
    barsByPosition.set(bar.positionId, [...(barsByPosition.get(bar.positionId) ?? []), bar]);
  }
  for (const positionBars of barsByPosition.values()) {
    if (countMaxConcurrentStaffingBars(positionBars) > SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT) {
      return "BAR_CONCURRENT_LIMIT";
    }
  }
  return null;
}

/**
 * 1日分の必要人数を、希望シフトの集め方に照らして検証し、最初に見つけた違反を返す。
 * 型の保存では店舗の集め方、その日だけの必要人数では募集の集め方を渡す。
 */
export function findDayRequirementsIssue(
  requirements: DayRequirements,
  pattern: ShiftSubmissionPattern,
): DayTemplateIssue | null {
  if (requirements.kind !== pattern.kind) return "REQUIREMENTS_KIND_MISMATCH";

  if (requirements.kind === "time" && pattern.kind === "time") {
    return findStaffingBarIssue(requirements.bars, pattern);
  }
  if (requirements.kind === "shiftType" && pattern.kind === "shiftType") {
    const patternOptionIds = new Set(pattern.options.map((option) => option.id));
    const optionIds = new Set<string>();
    for (const option of requirements.options) {
      if (optionIds.has(option.optionId)) return "OPTION_DUPLICATED";
      optionIds.add(option.optionId);
      if (!patternOptionIds.has(option.optionId)) return "OPTION_NOT_FOUND";
      const countIssue = findStaffingCountIssue(option.counts);
      if (countIssue) return countIssue;
    }
    return null;
  }
  if (requirements.kind === "dateOnly") return findStaffingCountIssue(requirements.counts);
  return null;
}

type DayTemplateValidationInput = {
  templates: ReadonlyArray<{
    name: string;
    weekdays: readonly ShiftSetupWeekday[];
    appliesToHolidays: boolean;
    requirements: DayRequirements;
  }>;
  /** 店舗のいまの希望シフトの集め方。 */
  pattern: ShiftSubmissionPattern;
};

/** 日の型の一覧を検証し、最初に見つけた違反を返す。違反がなければnullを返す。 */
export function findDayTemplateIssue(input: DayTemplateValidationInput): DayTemplateIssue | null {
  if (input.templates.length > SHIFT_DAY_TEMPLATE_LIMIT) return "TEMPLATE_LIMIT";

  const names = new Set<string>();
  const weekdays = new Set<ShiftSetupWeekday>();
  let hasHolidayTemplate = false;
  for (const template of input.templates) {
    const name = template.name.trim();
    if (!name) return "NAME_REQUIRED";
    if (name.length > SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH) return "NAME_TOO_LONG";
    if (names.has(name)) return "NAME_DUPLICATED";
    names.add(name);

    for (const weekday of template.weekdays) {
      if (weekdays.has(weekday)) return "WEEKDAY_DUPLICATED";
      weekdays.add(weekday);
    }
    if (template.appliesToHolidays) {
      if (hasHolidayTemplate) return "HOLIDAY_DUPLICATED";
      hasHolidayTemplate = true;
    }

    const requirementsIssue = findDayRequirementsIssue(template.requirements, input.pattern);
    if (requirementsIssue) return requirementsIssue;
  }
  return null;
}

/**
 * 検証済みの必要人数を、保存する形へそろえる。
 * バーは開始、終了、ポジションの順、勤務パターンは集め方の設定順に並べる。
 * 人数0は「未設定」と同じ意味なので残さない。隣り合うバーは結合しない。
 */
export function normalizeDayRequirements<PositionId extends string>(
  requirements: DayRequirements<PositionId>,
  pattern: ShiftSubmissionPattern,
): DayRequirements<PositionId> {
  const toCounts = (counts: ReadonlyArray<StaffingCount<PositionId>>) =>
    counts.filter((entry) => entry.count > 0).map((entry) => ({ positionId: entry.positionId, count: entry.count }));

  if (requirements.kind === "time") {
    return {
      kind: "time",
      bars: requirements.bars
        .map((bar) => ({ positionId: bar.positionId, startTime: bar.startTime, endTime: bar.endTime }))
        .sort(compareStaffingBars),
    };
  }
  if (requirements.kind === "shiftType") {
    const order = new Map(
      pattern.kind === "shiftType" ? pattern.options.map((option, index) => [option.id, index] as const) : [],
    );
    return {
      kind: "shiftType",
      options: requirements.options
        .map((option) => ({ optionId: option.optionId, counts: toCounts(option.counts) }))
        .filter((option) => option.counts.length > 0)
        .sort((left, right) => (order.get(left.optionId) ?? 0) - (order.get(right.optionId) ?? 0)),
    };
  }
  return { kind: "dateOnly", counts: toCounts(requirements.counts) };
}

/** 渡したポジションに含まれないバーと人数を除く。削除済みのポジションを返さないために使う。 */
export function filterDayRequirementsByPositions<PositionId extends string>(
  requirements: DayRequirements<PositionId>,
  positionIds: ReadonlySet<string>,
): DayRequirements<PositionId> {
  const toCounts = (counts: ReadonlyArray<StaffingCount<PositionId>>) =>
    counts.filter((entry) => positionIds.has(entry.positionId));

  if (requirements.kind === "time") {
    return { kind: "time", bars: requirements.bars.filter((bar) => positionIds.has(bar.positionId)) };
  }
  if (requirements.kind === "shiftType") {
    return {
      kind: "shiftType",
      options: requirements.options.map((option) => ({ optionId: option.optionId, counts: toCounts(option.counts) })),
    };
  }
  return { kind: "dateOnly", counts: toCounts(requirements.counts) };
}

/**
 * 必要人数を、募集の集め方へ写す。
 * 種類が募集の集め方と違う場合は未設定（null）にする。
 * 時間指定はバーを募集の受付時間の内側へ切り、完全に外のバーを落とす。
 * パターン選択は、募集の勤務パターンにあるものだけを設定順で残す。
 */
export function projectDayRequirementsForPattern<PositionId extends string>(
  requirements: DayRequirements<PositionId> | null,
  pattern: ShiftSubmissionPattern,
): DayRequirements<PositionId> | null {
  if (requirements === null || requirements.kind !== pattern.kind) return null;

  if (requirements.kind === "time" && pattern.kind === "time") {
    return { kind: "time", bars: clipStaffingBarsToRange(requirements.bars, pattern) };
  }
  if (requirements.kind === "shiftType" && pattern.kind === "shiftType") {
    const order = new Map(pattern.options.map((option, index) => [option.id, index] as const));
    return {
      kind: "shiftType",
      options: requirements.options
        .filter((option) => order.has(option.optionId))
        .sort((left, right) => (order.get(left.optionId) ?? 0) - (order.get(right.optionId) ?? 0)),
    };
  }
  return requirements;
}

/** その日だけの指定。別の型を当てるか、その日だけの必要人数を持つ。 */
export type DayStaffingOverride<TemplateId extends string = string, PositionId extends string = string> =
  | { date: string; kind: "template"; templateId: TemplateId }
  | { date: string; kind: "custom"; requirements: DayRequirements<PositionId> };

/** その日の必要人数を決めた理由。 */
export type DayStaffingSource = "dateCustom" | "dateTemplate" | "holiday" | "weekday" | "none";

export type ResolvedDayStaffing<TemplateId extends string = string, PositionId extends string = string> = {
  source: DayStaffingSource;
  /** 当たった型。その日だけの必要人数（dateCustom）と未設定（none）ではnull。 */
  templateId: TemplateId | null;
  templateName: string | null;
  requirements: DayRequirements<PositionId> | null;
};

type ResolveDayStaffingInput<TemplateId extends string, PositionId extends string> = {
  date: string;
  /** 設定した並び順の型。同じ曜日を持つ型が複数あっても、先頭の型を使う。 */
  templates: ReadonlyArray<
    Omit<DayTemplate<TemplateId, PositionId>, "weekdays"> & { weekdays: readonly ShiftSetupWeekday[] }
  >;
  overrides: ReadonlyArray<DayStaffingOverride<TemplateId, PositionId>>;
  /** 祝日の表にある日付。 */
  holidayDates: ReadonlySet<string>;
};

/**
 * その日に当たる必要人数を決める。
 * 優先順位は「その日だけの指定 ＞ 祝日に使う型（その日が祝日の場合）＞ 曜日の型」。
 * 削除済みの型を指す指定は無視して、下の順位へ落とす。
 */
export function resolveDayStaffing<TemplateId extends string, PositionId extends string>(
  input: ResolveDayStaffingInput<TemplateId, PositionId>,
): ResolvedDayStaffing<TemplateId, PositionId> {
  const fromTemplate = (
    source: DayStaffingSource,
    template: ResolveDayStaffingInput<TemplateId, PositionId>["templates"][number],
  ): ResolvedDayStaffing<TemplateId, PositionId> => ({
    source,
    templateId: template.id,
    templateName: template.name,
    requirements: template.requirements,
  });

  const override = input.overrides.find((entry) => entry.date === input.date);
  if (override?.kind === "custom") {
    return { source: "dateCustom", templateId: null, templateName: null, requirements: override.requirements };
  }
  if (override?.kind === "template") {
    const overridden = input.templates.find((template) => template.id === override.templateId);
    if (overridden) return fromTemplate("dateTemplate", overridden);
  }

  if (input.holidayDates.has(input.date)) {
    const holidayTemplate = input.templates.find((template) => template.appliesToHolidays);
    if (holidayTemplate) return fromTemplate("holiday", holidayTemplate);
  }

  const weekday = SHIFT_SETUP_WEEKDAYS[getWeekday(input.date)];
  const weekdayTemplate = input.templates.find((template) => template.weekdays.includes(weekday));
  if (weekdayTemplate) return fromTemplate("weekday", weekdayTemplate);

  return { source: "none", templateId: null, templateName: null, requirements: null };
}
