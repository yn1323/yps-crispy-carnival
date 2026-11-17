import type { Id } from "@/convex/_generated/dataModel";
import { SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX } from "@/convex/constants";
import {
  compareStaffingBars,
  type DayRequirements,
  type DayTemplateIssue,
  findDayTemplateIssue,
  SHIFT_SETUP_WEEKDAYS,
  type ShiftSetupWeekday,
} from "@/convex/shiftSetup/dayTemplates";
import {
  barsToStaffingSegments,
  normalizeStaffingSegments,
  type StaffingSegment,
  type StaffingSegmentRange,
  staffingSegmentsToBars,
} from "@/src/domains/shift/staffingSegments";
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

// テンプレート（名前を付けた1日分の必要人数）を編集するための純粋処理。
// 検証は convex/shiftSetup/dayTemplates.ts、人数の区間の操作は src/domains/shift/staffingSegments.ts を正とし、
// ここでは保存の形と編集中の値の変換、テンプレートの一覧の操作だけを持つ。
// 時間指定の必要人数は、編集中は「この時間は何人」の区間で持ち、保存の形（1本が1人分のバー）とは読み込みと保存の境目で変える。

type PositionRef = Pick<ShiftSetupPosition, "_id">;
type StoredRequirements = DayRequirements<Id<"positions">>;

const FIRST_TEMPLATE_NAME = "通常";
const UNNAMED_TEMPLATE_LABEL = "名前のないテンプレート";

/** 日付選択の必要人数を表に出すときの、1行だけの行のID。 */
export const ALL_DAY_ROW_ID = "allDay";

function toCountRecord(counts: ReadonlyArray<{ positionId: string; count: number }>): Record<string, number> {
  const record: Record<string, number> = {};
  for (const entry of counts) {
    if (entry.count > 0) record[entry.positionId] = entry.count;
  }
  return record;
}

/** 保存の形の必要人数を、編集中の形へ直す。バーは、重なった本数を数えて、時間ごとの人数の区間にする。 */
function toRequirementsDraft(requirements: StoredRequirements): DayTemplateRequirementsDraft {
  if (requirements.kind === "time") {
    return {
      kind: "time",
      segments: barsToStaffingSegments(
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
  if (kind === "time") return { kind: "time", segments: [] };
  if (kind === "shiftType") return { kind: "shiftType", counts: {} };
  return { kind: "dateOnly", counts: {} };
}

/** 保存済みの日のテンプレートを、編集中の形へ直す。 */
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

/** AIサポートの下書きを、まだ保存していない新しいテンプレートとして編集中の形へ直す。 */
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
  /** いまあるポジション。並び順は表示順。一覧にないポジションの人数は送らない。 */
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
    // 人数の区間を、同じ人数の並びを表せる最少の本数のバーへ変える。
    // 保存済みのバーの置き方が違っても、時間ごとの人数が同じなら、同じ並びのバーになる。
    return {
      kind: "time",
      bars: staffingSegmentsToBars(requirements.segments)
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
 * 人数0と、いまは無いポジションの人数は送らない。時間指定の人数は、バー（1本が1人分）へ変える。
 * 曜日は日曜から、バーは開始の早い順に並べ、行の識別子は外す。
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

/**
 * 保存内容として同じかを返す。変更の有無の判定に使う。
 * 時間指定の人数は、どちらも toDayTemplateInputs で同じ並びのバーへそろえてから比べる。
 * そのため、保存済みのバーの置き方と違っていても、時間ごとの人数が同じなら同じと判定する。
 */
export function isSameDayTemplateInputs(left: readonly DayTemplateInput[], right: readonly DayTemplateInput[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** どのテンプレートにも割り当てていない曜日を返す。 */
export function getUnassignedWeekdays(drafts: readonly DayTemplateDraft[]): ShiftSetupWeekday[] {
  const assigned = new Set(drafts.flatMap((draft) => draft.weekdays));
  return SHIFT_SETUP_WEEKDAYS.filter((weekday) => !assigned.has(weekday));
}

function createDefaultName(drafts: readonly DayTemplateDraft[]): string {
  const names = new Set(drafts.map((draft) => draft.name.trim()));
  if (drafts.length === 0) return FIRST_TEMPLATE_NAME;
  for (let number = drafts.length + 1; ; number += 1) {
    const name = `テンプレート${number}`;
    if (!names.has(name)) return name;
  }
}

/**
 * 新しく足すテンプレートを作る。
 * 曜日は、まだ割り当てていない営業日を初期値にする。祝日は選ばない。
 * 必要人数は空で始める。ほかのテンプレートと同じ内容から始めたいときは、画面の「コピーする」で写す。
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

/** つかんだテンプレートを、重ねたテンプレートの位置へ動かす。どちらかが一覧になければ、そのまま返す。 */
export function reorderDayTemplates(
  drafts: readonly DayTemplateDraft[],
  activeRowKey: string,
  overRowKey: string,
): DayTemplateDraft[] {
  const from = drafts.findIndex((draft) => draft.rowKey === activeRowKey);
  const to = drafts.findIndex((draft) => draft.rowKey === overRowKey);
  if (from < 0 || to < 0 || from === to) return [...drafts];
  const next = [...drafts];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export type DayTemplateSelection = {
  /** 選んだテンプレートの`rowKey`。 */
  rowKey: string | null;
  /** 選んだテンプレートの、一覧の中の位置。`rowKey`のテンプレートが一覧からなくなったときに使う。 */
  index: number;
};

/**
 * 編集するテンプレートを返す。テンプレートが1つもなければnullを返す。
 * 選んだテンプレートが一覧からなくなった場合は、同じ位置のテンプレート、なければ最後のテンプレートを選ぶ。
 * テンプレートを削除したあとはすぐ下のテンプレートへ移り、新しいテンプレートを保存してidが変わったあとも同じテンプレートを選んだままにするためである。
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
 * 同じ曜日は複数のテンプレートで選べるため、ほかのテンプレートは変えない。その曜日には並びの先頭のテンプレートが当たる。
 */
export function toggleDayTemplateWeekday(
  drafts: readonly DayTemplateDraft[],
  rowKey: string,
  weekday: ShiftSetupWeekday,
): DayTemplateDraft[] {
  return drafts.map((draft) => {
    if (draft.rowKey !== rowKey) return draft;
    const weekdays = draft.weekdays.includes(weekday)
      ? draft.weekdays.filter((day) => day !== weekday)
      : [...draft.weekdays, weekday];
    return { ...draft, weekdays };
  });
}

/** 曜日をすべて外す。祝日の選択は変えない。曜日も祝日も選ばないテンプレートは、シフト表で日付を選んで当てる。 */
export function clearDayTemplateWeekdays(drafts: readonly DayTemplateDraft[], rowKey: string): DayTemplateDraft[] {
  return drafts.map((draft) =>
    draft.rowKey === rowKey && draft.weekdays.length > 0 ? { ...draft, weekdays: [] } : draft,
  );
}

/**
 * 祝日に使うかどうかを切り替える。
 * 祝日は複数のテンプレートで選べるため、ほかのテンプレートは変えない。祝日には並びの先頭のテンプレートが当たる。
 */
export function toggleDayTemplateHoliday(drafts: readonly DayTemplateDraft[], rowKey: string): DayTemplateDraft[] {
  return drafts.map((draft) =>
    draft.rowKey === rowKey ? { ...draft, appliesToHolidays: !draft.appliesToHolidays } : draft,
  );
}

/** 時間指定のテンプレートの人数の区間を置き換える。時間指定でないテンプレートは変えない。 */
export function changeDayTemplateSegments(
  drafts: readonly DayTemplateDraft[],
  rowKey: string,
  segments: readonly StaffingSegment[],
): DayTemplateDraft[] {
  return updateDraft(drafts, rowKey, (draft) =>
    draft.requirements.kind === "time"
      ? { ...draft, requirements: { kind: "time", segments: normalizeStaffingSegments(segments) } }
      : draft,
  );
}

function setCount(record: Readonly<Record<string, number>>, positionId: string, count: number) {
  const next = { ...record };
  if (count > 0) next[positionId] = count;
  else delete next[positionId];
  return next;
}

/**
 * パターン選択と日付選択のテンプレートの、1マスの人数を変える。
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
  if (requirements.kind === "time") {
    return { kind: "time", segments: requirements.segments.map((segment) => ({ ...segment })) };
  }
  if (requirements.kind === "dateOnly") return { kind: "dateOnly", counts: { ...requirements.counts } };
  return {
    kind: "shiftType",
    counts: Object.fromEntries(
      Object.entries(requirements.counts).map(([optionId, counts]) => [optionId, { ...counts }]),
    ),
  };
}

/** 別のテンプレートの必要人数を写して、いまの必要人数を置き換える。名前と使う日は変えない。 */
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

function remapCounts(
  record: Readonly<Record<string, number>>,
  resolve: (positionId: string) => string | null,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [positionId, count] of Object.entries(record)) {
    const resolved = resolve(positionId);
    if (resolved !== null) next[resolved] = count;
  }
  return next;
}

/**
 * テンプレートの下書きが指すポジションのIDを、`resolve`の返す値へ置き換える。nullを返したポジションの人数は外す。
 * ポジションを削除したときと、新しく足したポジションの仮のIDを保存後のIDへ直すときに使う。
 * 人数がなくなった勤務パターンの行は持たない。
 */
export function remapDayTemplateDraftPositions(
  drafts: readonly DayTemplateDraft[],
  resolve: (positionId: string) => string | null,
): DayTemplateDraft[] {
  return drafts.map((draft) => {
    const { requirements } = draft;
    if (requirements.kind === "time") {
      // IDが変わると並びも変わるため、正規化し直す。
      const segments = normalizeStaffingSegments(
        requirements.segments.flatMap((segment) => {
          const positionId = resolve(segment.positionId);
          return positionId === null ? [] : [{ ...segment, positionId }];
        }),
      );
      return { ...draft, requirements: { kind: "time", segments } };
    }
    if (requirements.kind === "dateOnly") {
      return { ...draft, requirements: { kind: "dateOnly", counts: remapCounts(requirements.counts, resolve) } };
    }
    const counts: Record<string, Record<string, number>> = {};
    for (const [optionId, record] of Object.entries(requirements.counts)) {
      const row = remapCounts(record, resolve);
      if (Object.keys(row).length > 0) counts[optionId] = row;
    }
    return { ...draft, requirements: { kind: "shiftType", counts } };
  });
}

/** 必要人数を1つも入れていないかを返す。 */
function isDayTemplateRequirementsEmpty(requirements: DayTemplateRequirementsDraft): boolean {
  if (requirements.kind === "time") return requirements.segments.length === 0;
  return Object.keys(requirements.counts).length === 0;
}

/**
 * 作ったまま、まだ何も入れていない新しいテンプレートかを返す。
 * 名前と使う日が作ったときのままで、必要人数が空のテンプレートを指す。
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
 * 保存していない変更として扱うテンプレートの変更があるかを返す。
 * 作ったまま何も入れていない新しいテンプレートは変更に数えない。「テンプレートを追加」を押しただけで、保存と離脱の確認を求めないためである。
 */
export function hasPendingDayTemplateChanges(
  drafts: readonly DayTemplateDraft[],
  savedInputs: readonly DayTemplateInput[],
  context: InputContext,
): boolean {
  const entered = drafts.filter((draft) => !isUntouchedNewDayTemplate(draft));
  return !isSameDayTemplateInputs(toDayTemplateInputs(entered, context), savedInputs);
}

/** 希望シフトの集め方を変えたあと、まだ必要人数を入れ直していないテンプレートかを返す。 */
export function needsDayTemplateReentry(draft: DayTemplateDraft): boolean {
  return draft.requiresReentry && isDayTemplateRequirementsEmpty(draft.requirements);
}

/**
 * テンプレートごとの入力の誤りを返す。誤りのないテンプレートは結果に含めない。
 * テンプレートをまたぐ誤り（名前の重複）は、あとから出てくるテンプレートの誤りとして返す。
 */
export function findDayTemplateDraftIssues(
  drafts: readonly DayTemplateDraft[],
  context: InputContext,
): Record<string, DayTemplateIssue> {
  const inputs = toDayTemplateInputs(drafts, context);
  const issues: Record<string, DayTemplateIssue> = {};
  const names = new Set<string>();

  drafts.forEach((draft, index) => {
    const input = inputs[index];
    const name = draft.name.trim();
    const crossTemplateIssue: DayTemplateIssue | null = names.has(name) ? "NAME_DUPLICATED" : null;
    const issue = findDayTemplateIssue({ templates: [input], pattern: context.pattern }) ?? crossTemplateIssue;
    if (issue) issues[draft.rowKey] = issue;

    names.add(name);
  });
  return issues;
}

/** テンプレートの一覧全体を検証する。テンプレートごとの検証では見つからない件数の上限も含む。 */
export function findDayTemplateInputsIssue(
  inputs: readonly DayTemplateInput[],
  pattern: ShiftSetupSubmissionPattern,
): DayTemplateIssue | null {
  return findDayTemplateIssue({ templates: inputs, pattern });
}

/** テンプレートの見出しに出す名前。名前が空のテンプレートも一覧で選べるようにする。 */
export function getDayTemplateLabel(draft: Pick<DayTemplateDraft, "name">): string {
  return draft.name.trim() || UNNAMED_TEMPLATE_LABEL;
}

/**
 * テンプレートを使う日を「月〜金」「土・日・祝日」の形で返す。
 * 3日以上続く曜日は「〜」でつなぐ。曜日も祝日も選んでいないテンプレートは「個別」と返す。
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
  return parts.length > 0 ? parts.join("・") : "個別";
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

/** 人数を入れられる範囲（分）。時間指定でない集め方ではnullを返す。 */
export function getStaffingSegmentRange(pattern: ShiftSetupSubmissionPattern): StaffingSegmentRange | null {
  if (pattern.kind !== "time") return null;
  return { startMinutes: timeToMinutes(pattern.startTime), endMinutes: timeToMinutes(pattern.endTime) };
}
