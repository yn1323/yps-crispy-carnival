import type { Id } from "@/convex/_generated/dataModel";
import {
  SHIFT_DAY_TEMPLATE_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
} from "@/convex/constants";
import {
  compareStaffingBars,
  type DayRequirements,
  type DayTemplateIssue,
  findDayTemplateIssue,
  SHIFT_SETUP_WEEKDAYS,
  type ShiftSetupWeekday,
} from "@/convex/shiftSetup/dayTemplates";
import {
  type EditableStaffingBar,
  type StaffingBarLimits,
  type StaffingBarRange,
  toEditableStaffingBars,
} from "@/src/domains/shift/staffingBars";
import { formatShiftClockTimeRange, timeToMinutes } from "@/src/domains/shift/time";
import { WEEKDAY_OPTIONS } from "./script";
import type {
  DayTemplateDraft,
  DayTemplateInput,
  DayTemplateRequirementsDraft,
  RequiredCountChange,
  ShiftSetupAssistTemplate,
  ShiftSetupDayTemplate,
  ShiftSetupPosition,
  ShiftSetupSubmissionPattern,
} from "./types";

// 日の型（名前を付けた1日分の必要人数）を編集するための純粋処理。
// 検証は convex/shiftSetup/dayTemplates.ts、バーの操作は src/domains/shift/staffingBars.ts を正とし、
// ここでは保存の形と編集中の値の変換、型の一覧の操作だけを持つ。

type PositionRef = Pick<ShiftSetupPosition, "_id">;
type StoredRequirements = DayRequirements<Id<"positions">>;

const FIRST_TEMPLATE_NAME = "通常";
const UNNAMED_TEMPLATE_LABEL = "名前のない型";

/** 日付選択の必要人数を表に出すときの、1行だけの行のID。 */
export const ALL_DAY_ROW_ID = "allDay";

/** バーの編集部品へ渡す上限。サーバーの検証と同じ値にする。 */
export const DAY_TEMPLATE_BAR_LIMITS: StaffingBarLimits = {
  maxConcurrentPerPosition: SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT,
  maxBars: SHIFT_DAY_TEMPLATE_BAR_LIMIT,
};

function toCountRecord(counts: ReadonlyArray<{ positionId: string; count: number }>): Record<string, number> {
  const record: Record<string, number> = {};
  for (const entry of counts) {
    if (entry.count > 0) record[entry.positionId] = entry.count;
  }
  return record;
}

/** 保存の形の必要人数を、編集中の形へ直す。バーには編集用のidを振る。 */
function toRequirementsDraft(requirements: StoredRequirements): DayTemplateRequirementsDraft {
  if (requirements.kind === "time") {
    return {
      kind: "time",
      bars: toEditableStaffingBars(
        requirements.bars.map((bar) => ({ positionId: bar.positionId, start: bar.startTime, end: bar.endTime })),
      ),
    };
  }
  if (requirements.kind === "shiftType") {
    const counts: Record<string, Record<string, number>> = {};
    for (const option of requirements.options) {
      const record = toCountRecord(option.counts);
      if (Object.keys(record).length > 0) counts[option.optionId] = record;
    }
    return { kind: "shiftType", counts };
  }
  return { kind: "dateOnly", counts: toCountRecord(requirements.counts) };
}

function createEmptyRequirementsDraft(kind: DayTemplateRequirementsDraft["kind"]): DayTemplateRequirementsDraft {
  if (kind === "time") return { kind: "time", bars: [] };
  if (kind === "shiftType") return { kind: "shiftType", counts: {} };
  return { kind: "dateOnly", counts: {} };
}

/** 保存済みの日の型を、編集中の形へ直す。 */
export function toDayTemplateDrafts(templates: readonly ShiftSetupDayTemplate[]): DayTemplateDraft[] {
  return templates.map((template) => ({
    rowKey: template._id,
    id: template._id,
    name: template.name,
    weekdays: [...template.weekdays],
    appliesToHolidays: template.appliesToHolidays,
    requirements: toRequirementsDraft(template.requirements),
    requiresReentry: template.requiresReentry,
  }));
}

/** AIサポートの下書きを、まだ保存していない新しい型として編集中の形へ直す。 */
export function toDayTemplateDraftsFromSuggestion(
  templates: readonly ShiftSetupAssistTemplate[],
  createRowKey: () => string,
): DayTemplateDraft[] {
  return templates.map((template) => ({
    rowKey: createRowKey(),
    name: template.name,
    weekdays: [...template.weekdays],
    appliesToHolidays: template.appliesToHolidays,
    requirements: toRequirementsDraft(template.requirements),
    requiresReentry: false,
  }));
}

type InputContext = {
  /** いまあるポジション。並び順は表示順。一覧にないポジションのバーと人数は送らない。 */
  positions: readonly PositionRef[];
  pattern: ShiftSetupSubmissionPattern;
};

function toStoredRequirements(requirements: DayTemplateRequirementsDraft, context: InputContext): StoredRequirements {
  const positionIds = new Map<string, Id<"positions">>(
    context.positions.map((position) => [position._id, position._id]),
  );
  const toCounts = (record: Readonly<Record<string, number>> | undefined) =>
    context.positions.flatMap((position) => {
      const count = record?.[position._id] ?? 0;
      return count > 0 ? [{ positionId: position._id, count }] : [];
    });

  if (requirements.kind === "time") {
    return {
      kind: "time",
      bars: requirements.bars
        .flatMap((bar) => {
          const positionId = positionIds.get(bar.positionId);
          return positionId ? [{ positionId, startTime: bar.start, endTime: bar.end }] : [];
        })
        .sort(compareStaffingBars),
    };
  }
  if (requirements.kind === "shiftType") {
    // 勤務パターンは、店舗の設定順に並べる。人数を入れていない勤務パターンは送らない。
    const optionIds =
      context.pattern.kind === "shiftType"
        ? context.pattern.options.map((option) => option.id)
        : Object.keys(requirements.counts);
    return {
      kind: "shiftType",
      options: optionIds.flatMap((optionId) => {
        const counts = toCounts(requirements.counts[optionId]);
        return counts.length > 0 ? [{ optionId, counts }] : [];
      }),
    };
  }
  return { kind: "dateOnly", counts: toCounts(requirements.counts) };
}

/**
 * 保存する形へ直す。
 * 人数0と、いまは無いポジションのバーと人数は送らない。
 * 曜日は日曜から、バーは開始の早い順に並べ、行の識別子とバーのidは外す。
 */
export function toDayTemplateInputs(drafts: readonly DayTemplateDraft[], context: InputContext): DayTemplateInput[] {
  return drafts.map((draft) => ({
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name,
    weekdays: SHIFT_SETUP_WEEKDAYS.filter((weekday) => draft.weekdays.includes(weekday)),
    appliesToHolidays: draft.appliesToHolidays,
    requirements: toStoredRequirements(draft.requirements, context),
  }));
}

/** 保存内容として同じかを返す。変更の有無の判定に使う。 */
export function isSameDayTemplateInputs(left: readonly DayTemplateInput[], right: readonly DayTemplateInput[]) {
  return JSON.stringify(left) === JSON.stringify(right);
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
 * 曜日は、まだ割り当てていない営業日を初期値にする。祝日は選ばない。
 * 必要人数は空で始める。ほかの型と同じ内容から始めたいときは、画面の「ほかの型からコピー」で写す。
 */
export function createDayTemplateDraft(input: {
  drafts: readonly DayTemplateDraft[];
  pattern: ShiftSetupSubmissionPattern;
  regularClosedDays: readonly ShiftSetupWeekday[];
  rowKey: string;
}): DayTemplateDraft {
  const closedDays = new Set(input.regularClosedDays);
  const name = createDefaultName(input.drafts);
  const weekdays = getUnassignedWeekdays(input.drafts).filter((weekday) => !closedDays.has(weekday));
  return {
    rowKey: input.rowKey,
    name,
    weekdays,
    appliesToHolidays: false,
    requirements: createEmptyRequirementsDraft(input.pattern.kind),
    requiresReentry: false,
    initial: { name, weekdays: [...weekdays] },
  };
}

function updateDraft(
  drafts: readonly DayTemplateDraft[],
  rowKey: string,
  update: (draft: DayTemplateDraft) => DayTemplateDraft,
): DayTemplateDraft[] {
  return drafts.map((draft) => (draft.rowKey === rowKey ? update(draft) : draft));
}

export function renameDayTemplate(drafts: readonly DayTemplateDraft[], rowKey: string, name: string) {
  return updateDraft(drafts, rowKey, (draft) => ({ ...draft, name }));
}

export function removeDayTemplate(drafts: readonly DayTemplateDraft[], rowKey: string) {
  return drafts.filter((draft) => draft.rowKey !== rowKey);
}

export type DayTemplateSelection = {
  /** 選んだ型の`rowKey`。 */
  rowKey: string | null;
  /** 選んだ型の、一覧の中の位置。`rowKey`の型が一覧からなくなったときに使う。 */
  index: number;
};

/**
 * 編集する型を返す。型が1つもなければnullを返す。
 * 選んだ型が一覧からなくなった場合は、同じ位置の型、なければ最後の型を選ぶ。
 * 型を削除したあとはすぐ下の型へ移り、新しい型を保存してidが変わったあとも同じ型を選んだままにするためである。
 */
export function resolveSelectedDayTemplate(
  drafts: readonly DayTemplateDraft[],
  selection: DayTemplateSelection,
): DayTemplateDraft | null {
  return (
    drafts.find((draft) => draft.rowKey === selection.rowKey) ??
    drafts[Math.min(Math.max(selection.index, 0), drafts.length - 1)] ??
    null
  );
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

/**
 * 祝日に使うかどうかを切り替える。
 * 祝日に使える型は1つだけのため、選んだら、別の型の祝日を外して移す。
 */
export function toggleDayTemplateHoliday(drafts: readonly DayTemplateDraft[], rowKey: string): DayTemplateDraft[] {
  const target = drafts.find((draft) => draft.rowKey === rowKey);
  if (!target) return [...drafts];
  const next = !target.appliesToHolidays;

  return drafts.map((draft) => {
    if (draft.rowKey === rowKey) return { ...draft, appliesToHolidays: next };
    return next && draft.appliesToHolidays ? { ...draft, appliesToHolidays: false } : draft;
  });
}

/** 時間指定の型のバーを置き換える。時間指定でない型は変えない。 */
export function changeDayTemplateBars(
  drafts: readonly DayTemplateDraft[],
  rowKey: string,
  bars: readonly EditableStaffingBar[],
): DayTemplateDraft[] {
  return updateDraft(drafts, rowKey, (draft) =>
    draft.requirements.kind === "time" ? { ...draft, requirements: { kind: "time", bars: [...bars] } } : draft,
  );
}

function setCount(record: Readonly<Record<string, number>>, positionId: string, count: number) {
  const next = { ...record };
  if (count > 0) next[positionId] = count;
  else delete next[positionId];
  return next;
}

/**
 * パターン選択と日付選択の型の、1マスの人数を変える。
 * 0から上限までの整数に収め、0は「未設定」として持たない。
 */
export function changeRequiredCount(
  drafts: readonly DayTemplateDraft[],
  rowKey: string,
  change: RequiredCountChange,
): DayTemplateDraft[] {
  const count = Number.isFinite(change.count)
    ? Math.min(SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX, Math.max(0, Math.trunc(change.count)))
    : 0;

  return updateDraft(drafts, rowKey, (draft) => {
    const { requirements } = draft;
    if (requirements.kind === "dateOnly") {
      return {
        ...draft,
        requirements: { kind: "dateOnly", counts: setCount(requirements.counts, change.positionId, count) },
      };
    }
    if (requirements.kind === "shiftType") {
      const { [change.rowId]: current = {}, ...rest } = requirements.counts;
      const row = setCount(current, change.positionId, count);
      return {
        ...draft,
        requirements: {
          kind: "shiftType",
          counts: Object.keys(row).length > 0 ? { ...rest, [change.rowId]: row } : rest,
        },
      };
    }
    return draft;
  });
}

function cloneRequirementsDraft(requirements: DayTemplateRequirementsDraft): DayTemplateRequirementsDraft {
  // バーのidは型の中だけで一意ならよいため、写した先で振り直す。
  if (requirements.kind === "time") return { kind: "time", bars: toEditableStaffingBars(requirements.bars) };
  if (requirements.kind === "dateOnly") return { kind: "dateOnly", counts: { ...requirements.counts } };
  return {
    kind: "shiftType",
    counts: Object.fromEntries(
      Object.entries(requirements.counts).map(([optionId, counts]) => [optionId, { ...counts }]),
    ),
  };
}

/** 別の型の必要人数を写して、いまの必要人数を置き換える。名前と使う日は変えない。 */
export function copyDayTemplateRequirements(
  drafts: readonly DayTemplateDraft[],
  target: { fromRowKey: string; toRowKey: string },
): DayTemplateDraft[] {
  const source = drafts.find((draft) => draft.rowKey === target.fromRowKey);
  if (!source || target.fromRowKey === target.toRowKey) return [...drafts];
  return updateDraft(drafts, target.toRowKey, (draft) => ({
    ...draft,
    requirements: cloneRequirementsDraft(source.requirements),
  }));
}

/** 必要人数を1つも入れていないかを返す。 */
function isDayTemplateRequirementsEmpty(requirements: DayTemplateRequirementsDraft): boolean {
  if (requirements.kind === "time") return requirements.bars.length === 0;
  return Object.keys(requirements.counts).length === 0;
}

/**
 * 作ったまま、まだ何も入れていない新しい型かを返す。
 * 名前と使う日が作ったときのままで、必要人数が空の型を指す。
 */
export function isUntouchedNewDayTemplate(draft: DayTemplateDraft): boolean {
  const { initial } = draft;
  if (draft.id || !initial) return false;
  return (
    draft.name === initial.name &&
    draft.weekdays.length === initial.weekdays.length &&
    initial.weekdays.every((weekday) => draft.weekdays.includes(weekday)) &&
    !draft.appliesToHolidays &&
    isDayTemplateRequirementsEmpty(draft.requirements)
  );
}

/**
 * 保存していない変更として扱う型の変更があるかを返す。
 * 作ったまま何も入れていない新しい型は変更に数えない。「型を追加」を押しただけで、保存と離脱の確認を求めないためである。
 */
export function hasPendingDayTemplateChanges(
  drafts: readonly DayTemplateDraft[],
  savedInputs: readonly DayTemplateInput[],
  context: InputContext,
): boolean {
  const entered = drafts.filter((draft) => !isUntouchedNewDayTemplate(draft));
  return !isSameDayTemplateInputs(toDayTemplateInputs(entered, context), savedInputs);
}

/** 希望シフトの集め方を変えたあと、まだ必要人数を入れ直していない型かを返す。 */
export function needsDayTemplateReentry(draft: DayTemplateDraft): boolean {
  return draft.requiresReentry && isDayTemplateRequirementsEmpty(draft.requirements);
}

/**
 * 型ごとの入力の誤りを返す。誤りのない型は結果に含めない。
 * 型をまたぐ誤り（名前、曜日、祝日の重複）は、あとから出てくる型の誤りとして返す。
 */
export function findDayTemplateDraftIssues(
  drafts: readonly DayTemplateDraft[],
  context: InputContext,
): Record<string, DayTemplateIssue> {
  const inputs = toDayTemplateInputs(drafts, context);
  const issues: Record<string, DayTemplateIssue> = {};
  const names = new Set<string>();
  const weekdays = new Set<ShiftSetupWeekday>();
  let hasHolidayTemplate = false;

  drafts.forEach((draft, index) => {
    const input = inputs[index];
    const name = draft.name.trim();
    const crossTemplateIssue: DayTemplateIssue | null = names.has(name)
      ? "NAME_DUPLICATED"
      : input.weekdays.some((weekday) => weekdays.has(weekday))
        ? "WEEKDAY_DUPLICATED"
        : input.appliesToHolidays && hasHolidayTemplate
          ? "HOLIDAY_DUPLICATED"
          : null;
    const issue = findDayTemplateIssue({ templates: [input], pattern: context.pattern }) ?? crossTemplateIssue;
    if (issue) issues[draft.rowKey] = issue;

    names.add(name);
    for (const weekday of input.weekdays) weekdays.add(weekday);
    hasHolidayTemplate ||= input.appliesToHolidays;
  });
  return issues;
}

/** 型の一覧全体を検証する。型ごとの検証では見つからない件数の上限も含む。 */
export function findDayTemplateInputsIssue(
  inputs: readonly DayTemplateInput[],
  pattern: ShiftSetupSubmissionPattern,
): DayTemplateIssue | null {
  return findDayTemplateIssue({ templates: inputs, pattern });
}

/** 型の見出しに出す名前。名前が空の型も一覧で選べるようにする。 */
export function getDayTemplateLabel(draft: Pick<DayTemplateDraft, "name">): string {
  return draft.name.trim() || UNNAMED_TEMPLATE_LABEL;
}

/**
 * 型を使う日を「月〜金」「土・日・祝日」の形で返す。
 * 3日以上続く曜日は「〜」でつなぐ。曜日も祝日も選んでいない型は「個別に当てる」と返す。
 */
export function formatDayTemplateUsage(draft: Pick<DayTemplateDraft, "weekdays" | "appliesToHolidays">): string {
  const selected = WEEKDAY_OPTIONS.filter((day) => draft.weekdays.includes(day.value));
  const parts: string[] = [];

  if (selected.length === WEEKDAY_OPTIONS.length) {
    parts.push("毎日");
  } else {
    let run: string[] = [];
    const flush = () => {
      if (run.length >= 3) parts.push(`${run[0]}〜${run[run.length - 1]}`);
      else parts.push(...run);
      run = [];
    };
    for (const day of WEEKDAY_OPTIONS) {
      if (draft.weekdays.includes(day.value)) run.push(day.label);
      else flush();
    }
    flush();
  }
  if (draft.appliesToHolidays) parts.push("祝日");
  return parts.length > 0 ? parts.join("・") : "個別に当てる";
}

export type RequiredCountRow = { id: string; label: string; detail?: string };

/** 数字で入れる必要人数の表の行。パターン選択は勤務パターンごと、日付選択は「1日」の1行。 */
export function getRequiredCountRows(pattern: ShiftSetupSubmissionPattern): RequiredCountRow[] {
  if (pattern.kind === "shiftType") {
    return pattern.options.map((option) => ({
      id: option.id,
      label: option.name,
      detail: formatShiftClockTimeRange(option.startTime, option.endTime),
    }));
  }
  if (pattern.kind === "dateOnly") return [{ id: ALL_DAY_ROW_ID, label: "1日" }];
  return [];
}

/** 編集中の人数を、表へ渡す「行のID → ポジションのID → 人数」の形へ直す。 */
export function getRequiredCountTableCounts(
  requirements: DayTemplateRequirementsDraft,
): Record<string, Record<string, number>> {
  if (requirements.kind === "shiftType") return requirements.counts;
  if (requirements.kind === "dateOnly") return { [ALL_DAY_ROW_ID]: requirements.counts };
  return {};
}

/** バーを置ける範囲（分）。時間指定でない集め方ではnullを返す。 */
export function getStaffingBarRange(pattern: ShiftSetupSubmissionPattern): StaffingBarRange | null {
  if (pattern.kind !== "time") return null;
  return { startMinutes: timeToMinutes(pattern.startTime), endMinutes: timeToMinutes(pattern.endTime) };
}
