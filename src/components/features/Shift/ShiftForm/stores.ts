import { atom, type Getter, type Setter } from "jotai";
import type { AssignmentIssue } from "@/convex/shiftBoard/validation";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { getAssignmentWarningSettingText } from "@/src/components/shared/ShiftAssignmentWarning";
import { issueCountByDate } from "@/src/domains/shift/assignmentIssues";
import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import { applyBreakRange, type MinuteRange, withInitialBreak } from "@/src/domains/shift/breaks";
import { toggleDateOnlyAssignment } from "@/src/domains/shift/dateOnlyAssignments";
import { mergeAdjacentPositions, resolveDefaultPosition } from "@/src/domains/shift/operations";
import { collectNewcomerStaffIdsByPositionId } from "@/src/domains/shift/positionSkills";
import { isCanonicalWorkPosition } from "@/src/domains/shift/positions";
import {
  assignPositionToRange,
  closeGapsWithBreaks,
  type RangeAssignment,
  resolveRangeAssignment,
  restoreWorkInRange,
} from "@/src/domains/shift/rangeAssignment";
import { indexShiftsByStaffId } from "@/src/domains/shift/shiftLookup";
import { type ShiftTypeOptionLike, toggleShiftTypeAssignment } from "@/src/domains/shift/shiftTypeAssignments";
import { compareDefaultStaffOrder, sortDailyStaffs, sortStaffs } from "@/src/domains/shift/sortStaffs";
import type { NewcomerOnlyPeriod } from "@/src/domains/shift/staffing";
import { minutesToTime } from "@/src/domains/shift/time";
import type { PositionType, ShiftData, SortMode, StaffType, TimeRange, ViewMode } from "@/src/domains/shift/types";
import { sumStaffWorkTotals } from "@/src/domains/shift/workTotals";
import { DEFAULT_TIME_PATTERN } from "@/src/domains/shop/submissionPattern";
import { readLastPositionId, storeLastPositionId } from "./lastPositionStorage";
import { readRangeAssignHintDismissed, storeRangeAssignHintDismissed } from "./rangeAssignHintStorage";
import { resolveNameSkillPosition } from "./skillPresentation";
import { buildDayStaffingView, type DayStaffingView } from "./staffingPresentation";
import type { ShiftFormStaffing } from "./types";

export type { ShiftFormStaffing } from "./types";

// ==========================================
// 外部設定（propsから初期化、子コンポーネントは読み取り専用）
// ==========================================
export const shiftConfigAtom = atom<{
  shopId: string;
  staffs: StaffType[];
  positions: PositionType[];
  dates: string[];
  timeRange: TimeRange;
  holidays: string[];
  isReadOnly: boolean;
  currentStaffId?: string;
  allShifts?: ShiftData[];
  staffing?: ShiftFormStaffing;
  submissionPattern: ShiftSubmissionPattern;
  displayMode?: "request" | "confirmed";
}>({
  shopId: "",
  staffs: [],
  positions: [],
  dates: [],
  timeRange: { start: 9, end: 22, unit: 30 },
  holidays: [],
  isReadOnly: false,
  submissionPattern: DEFAULT_TIME_PATTERN,
  displayMode: "request",
});

// ==========================================
// コア状態
// ==========================================
export const viewModeAtom = atom<ViewMode>("daily");
export const selectedDateAtom = atom<string>("");
export const sortModeAtom = atom<SortMode>("default");
export const lockedDailyStaffOrderAtom = atom<{ date: string; staffIds: string[] } | null>(null);

// ==========================================
// シフトデータ
// ==========================================
const shiftDraftsAtom = atom<ShiftData[]>([]);

export const shiftsAtom = atom((get) => get(shiftDraftsAtom));

export const replaceShiftDraftsAtom = atom(null, (_get, set, shifts: ShiftData[]) => {
  set(shiftDraftsAtom, shifts);
});

const hasWork = (shift: ShiftData | undefined): boolean => shift?.positions.some(isCanonicalWorkPosition) ?? false;

// 編集の前後を比べ、勤務の有無が変わった日にだけ決まりを当てる。
// - 勤務がなくなった日は、休憩と「仮」の印も消す。
// - 勤務が新しくできた日は、くわしく表示のときだけ、店舗の休憩の決まりから休憩の初期値を入れる
//   （日付選択は勤務の長さがないため入れない）。
const applyShiftEditRules = (get: Getter, previous: ShiftData[], next: ShiftData[]): ShiftData[] => {
  if (previous === next) return next;
  const config = get(shiftConfigAtom);
  const previousById = new Map(previous.map((shift) => [shift.id, shift]));
  return next.map((shift) => {
    const before = previousById.get(shift.id);
    if (before === shift) return shift;
    if (!hasWork(shift)) {
      if (shift.breaks === undefined && shift.isProvisional === undefined) return shift;
      const { breaks: _breaks, isProvisional: _isProvisional, ...rest } = shift;
      return rest;
    }
    // シンプル表示は休憩を見せないため、見えない休憩を足さない。くわしく表示のときだけ初期値を入れる。
    if (!hasWork(before) && config.submissionPattern.kind !== "dateOnly" && get(detailModeAtom)) {
      return withInitialBreak(shift, config.staffing?.breakRule);
    }
    return shift;
  });
};

const commitShiftDrafts = (get: Getter, set: Setter, next: ShiftData[]) => {
  const previous = get(shiftDraftsAtom);
  set(shiftDraftsAtom, applyShiftEditRules(get, previous, next));
};

export const updateShiftDraftsAtom = atom(null, (get, set, update: (current: ShiftData[]) => ShiftData[]) => {
  commitShiftDrafts(get, set, update(get(shiftDraftsAtom)));
});

export const toggleDateOnlyAssignmentAtom = atom(
  null,
  (get, set, { staff, date }: { staff: StaffType; date: string }) => {
    const config = get(shiftConfigAtom);
    if (config.isReadOnly || !config.dates.includes(date) || config.holidays.includes(date)) return;

    if (openBreakEditorIfBreakTool(get, set, staff.id, date)) return;
    commitShiftDrafts(
      get,
      set,
      toggleDateOnlyAssignment({
        shifts: get(shiftDraftsAtom),
        staff,
        date,
        timeRange: config.timeRange,
        position: get(workPositionAtom),
        switchPosition: get(isPositionSelectableAtom),
      }),
    );
  },
);

export const toggleShiftTypeAssignmentAtom = atom(
  null,
  (get, set, { staff, date, option }: { staff: StaffType; date: string; option: ShiftTypeOptionLike }) => {
    const config = get(shiftConfigAtom);
    if (config.isReadOnly || !config.dates.includes(date) || config.holidays.includes(date)) return;

    if (openBreakEditorIfBreakTool(get, set, staff.id, date)) return;
    commitShiftDrafts(
      get,
      set,
      toggleShiftTypeAssignment({
        shifts: get(shiftDraftsAtom),
        staff,
        date,
        option,
        position: get(workPositionAtom),
        switchPosition: get(isPositionSelectableAtom),
      }),
    );
  },
);

export const upsertShiftDraftAtom = atom(null, (get, set, updatedShift: ShiftData) => {
  if (get(shiftConfigAtom).isReadOnly) return;

  const current = get(shiftDraftsAtom);
  const exists = current.some((shift) => shift.id === updatedShift.id);
  commitShiftDrafts(
    get,
    set,
    exists ? current.map((shift) => (shift.id === updatedShift.id ? updatedShift : shift)) : [...current, updatedShift],
  );
});

export const clearShiftDraftPositionsAtom = atom(
  null,
  (get, set, { staffId, date }: { staffId: string; date: string }) => {
    if (get(shiftConfigAtom).isReadOnly) return;

    commitShiftDrafts(
      get,
      set,
      get(shiftDraftsAtom).map((shift) =>
        shift.staffId === staffId && shift.date === date ? { ...shift, positions: [] } : shift,
      ),
    );
  },
);

export const deleteShiftPositionAtom = atom(
  null,
  (get, set, { shiftId, positionIds }: { shiftId: string; positionIds: string[] }): ShiftData | null => {
    if (get(shiftConfigAtom).isReadOnly) return null;

    const current = get(shiftDraftsAtom);
    const target = current.find((shift) => shift.id === shiftId);
    if (!target) return null;

    const remaining = {
      ...target,
      positions: mergeAdjacentPositions(target.positions.filter((position) => !positionIds.includes(position.id))),
    };
    // 時刻を持つ勤務では、間の区間を消してできた空きを、バーの見た目に合わせて休憩として持つ。
    const updatedShift =
      get(shiftConfigAtom).submissionPattern.kind === "time"
        ? closeGapsWithBreaks(remaining, `${shiftId}-gap-${Date.now()}`)
        : remaining;
    commitShiftDrafts(
      get,
      set,
      current.map((shift) => (shift.id === shiftId ? updatedShift : shift)),
    );
    return get(shiftDraftsAtom).find((shift) => shift.id === shiftId) ?? updatedShift;
  },
);

/** その日の休憩を置き換える。勤務のない日には入れない。 */
export const setShiftBreaksAtom = atom(
  null,
  (get, set, { staffId, date, breaks }: { staffId: string; date: string; breaks: ShiftData["breaks"] }) => {
    if (get(shiftConfigAtom).isReadOnly) return;
    set(
      shiftDraftsAtom,
      get(shiftDraftsAtom).map((shift) => {
        if (shift.staffId !== staffId || shift.date !== date || !hasWork(shift)) return shift;
        const { breaks: _breaks, ...rest } = shift;
        return breaks && breaks.length > 0 ? { ...rest, breaks } : rest;
      }),
    );
  },
);

/**
 * 勤務の選んだ範囲（分）へ、ポジションまたは休憩を入れる。`removeBreak`は、休憩だけを選んだ範囲を勤務へ戻す。
 * 勤務の間の空きも休憩として扱い、勤務へ戻すときは直前の勤務と同じポジションで埋める。
 * 何も変わらない場合は`unchanged`を返す。
 */
export const assignShiftRangeAtom = atom(
  null,
  (
    get,
    set,
    {
      shiftId,
      range,
      assignment,
      segmentId,
    }: {
      shiftId: string;
      range: MinuteRange;
      assignment: RangeAssignment | { kind: "removeBreak" };
      segmentId: string;
    },
  ): "changed" | "unchanged" => {
    const config = get(shiftConfigAtom);
    if (config.isReadOnly) return "unchanged";
    const drafts = get(shiftDraftsAtom);
    const shift = drafts.find((item) => item.id === shiftId);
    if (!shift) return "unchanged";

    let next: Pick<ShiftData, "positions" | "breaks"> | null;
    if (assignment.kind === "removeBreak") {
      next =
        resolveRangeAssignment(shift, range)?.kind === "break" ? restoreWorkInRange({ shift, range, segmentId }) : null;
    } else if (assignment.kind === "break") {
      next = applyBreakRange(shift, { start: minutesToTime(range.start), end: minutesToTime(range.end) });
    } else {
      const position = config.positions.find((item) => item.id === assignment.positionId) ?? null;
      // メニューで選んだポジションを覚え、次に新しく入れる勤務にも使う。メニューで休憩を選んだときは覚えない。
      if (position) set(rememberWorkPositionAtom, position.id);
      next = position ? assignPositionToRange({ shift, range, position, segmentId }) : null;
    }
    if (!next) return "unchanged";

    const { breaks: _breaks, ...rest } = shift;
    // 前からあった勤務の間の空きも、この勤務を変えた時点で、休憩として持つ形にそろえる。
    const updated: ShiftData = closeGapsWithBreaks(
      {
        ...rest,
        positions: next.positions,
        ...(next.breaks && next.breaks.length > 0 ? { breaks: next.breaks } : {}),
      },
      `${segmentId}-gap`,
    );
    set(
      shiftDraftsAtom,
      drafts.map((item) => (item.id === shiftId ? updated : item)),
    );
    set(dismissRangeAssignHintAtom);
    return "changed";
  },
);

/** 未提出者の仮の勤務など、画面の外で組み立てた編集結果を取り込む。 */
export const applyShiftDraftsAtom = atom(null, (get, set, update: (current: ShiftData[]) => ShiftData[]) => {
  if (get(shiftConfigAtom).isReadOnly) return;
  set(shiftDraftsAtom, update(get(shiftDraftsAtom)));
});

// ==========================================
// PC 日別ビューの動的 hourWidth（コンテナ幅に応じて可変）
// ==========================================
export const hourWidthAtom = atom<number>(120);

// ==========================================
// 「くわしく」表示
// ==========================================
// シンプル（false）は従来の画面と同じ。くわしく（true）でポジションの色分け、人数、合計、印を出す。
export const detailModeAtom = atom<boolean>(false);
// 利用者に切り替えを出してよいか。閲覧専用の画面では出さない。
export const detailToggleEnabledAtom = atom<boolean>(false);

// ==========================================
// 入れるものの選択（ポジションまたは休憩）
// ==========================================
// 時間指定のPCの日別表示には選ぶ場所がなく、勤務のバーのメニューで最後に選んだポジションが入る。
export const selectedPositionIdAtom = atom<string | null>(null);
// 休憩を選んでいる間は、勤務を押すと休憩の編集を開く。
export const breakToolActiveAtom = atom<boolean>(false);
// 休憩を編集中の日。nullのときは休憩の編集を閉じている。
export const breakEditorTargetAtom = atom<{ staffId: string; date: string } | null>(null);

// ==========================================
// バーの範囲を選んで入れる操作の案内
// ==========================================
// この画面で案内を消したあとはtrue。nullの間は、端末に覚えた値を使う。
const rangeAssignHintDismissedOverrideAtom = atom<boolean | null>(null);
// 一度でもバーの範囲を選んでポジションか休憩を入れた端末では、案内を出さない。
export const isRangeAssignHintDismissedAtom = atom(
  (get) => get(rangeAssignHintDismissedOverrideAtom) ?? readRangeAssignHintDismissed(),
);
const dismissRangeAssignHintAtom = atom(null, (get, set) => {
  if (get(isRangeAssignHintDismissedAtom)) return;
  storeRangeAssignHintDismissed();
  set(rangeAssignHintDismissedOverrideAtom, true);
});

// ==========================================
// 派生atom
// ==========================================
// くわしく表示で、編集できる場合だけ、入れるものを選べる。
export const isToolPaletteActiveAtom = atom((get) => get(detailModeAtom) && !get(shiftConfigAtom).isReadOnly);

// ポジションを選び分けられるのは、ポジションが2つ以上ある店舗のくわしく表示だけ。
export const isPositionSelectableAtom = atom(
  (get) => get(isToolPaletteActiveAtom) && get(shiftConfigAtom).positions.length >= 2,
);

// ポジションの色で勤務を塗り分けるかどうか。閲覧専用でも、くわしく表示なら色分けする。
export const usesPositionColorsAtom = atom((get) => get(detailModeAtom) && get(shiftConfigAtom).positions.length >= 2);

export const selectedPositionAtom = atom((get) => {
  if (!get(isPositionSelectableAtom)) return null;
  const config = get(shiftConfigAtom);
  const id = get(selectedPositionIdAtom);
  return id ? (config.positions.find((p) => p.id === id) ?? null) : null;
});

/**
 * 選んだポジションを、次に新しく入れる勤務のポジションとして覚える。店舗ごとに端末にも覚える。
 * 時間指定のPCの日別表示で、日付の見出しのポジションを押したときと、勤務のバーのメニューでポジションを選んだときに使う。
 * 休憩を選んでいた場合は、休憩の選択を外す。
 */
export const rememberWorkPositionAtom = atom(null, (get, set, positionId: string) => {
  set(selectedPositionIdAtom, positionId);
  set(breakToolActiveAtom, false);
  storeLastPositionId(get(shiftConfigAtom).shopId, positionId);
});

/**
 * 時間指定のPCの日別表示で、次に入れるポジションを決める。この画面でまだ選んでいない場合だけ決める。
 * 端末に覚えたポジションがあればそれを使い、覚えていない場合と削除済みの場合は、ポジションの一覧の先頭を使う。
 * 既定のポジションは画面から分からないため、ここでは使わない。
 */
export const restoreRememberedWorkPositionAtom = atom(null, (get, set) => {
  if (get(selectedPositionIdAtom) !== null) return;
  const { shopId, positions } = get(shiftConfigAtom);
  const rememberedId = readLastPositionId(shopId);
  const position = positions.find((item) => item.id === rememberedId) ?? positions[0];
  if (position) set(selectedPositionIdAtom, position.id);
});

/**
 * 時間指定のPCの日別表示で、次に新しく入れる勤務のポジション。
 * メニューで最後に選んだポジションで、選んでいなければ一覧の先頭。ポジションを選び分けない表示では既定のポジション。
 */
export const nextWorkPositionAtom = atom((get) => {
  const { positions } = get(shiftConfigAtom);
  if (!get(isPositionSelectableAtom)) return resolveDefaultPosition(positions);
  return get(selectedPositionAtom) ?? positions[0];
});

// 新しい勤務に使うポジション。選んでいなければ既定のポジション。
const workPositionAtom = atom(
  (get) => get(selectedPositionAtom) ?? resolveDefaultPosition(get(shiftConfigAtom).positions),
);

export const isBreakToolActiveAtom = atom((get) => get(isToolPaletteActiveAtom) && get(breakToolActiveAtom));

// 名前の横の熟練度の印が根拠にするポジション。「入れるもの」がない表示と、休憩を選んでいる間はnull。
export const nameSkillPositionAtom = atom((get) => {
  const config = get(shiftConfigAtom);
  return resolveNameSkillPosition({
    positions: config.positions,
    selectedPositionId: get(selectedPositionIdAtom),
    isToolPaletteActive: get(isToolPaletteActiveAtom),
    isBreakToolActive: get(isBreakToolActiveAtom),
    isConfirmedDisplay: config.displayMode === "confirmed",
  });
});

// 勤務の区間に熟練度の印（見・リ）を添えるかどうか。くわしく表示の、担当者の画面だけに出す。
export const showsSegmentSkillMarksAtom = atom(
  (get) => get(detailModeAtom) && get(shiftConfigAtom).displayMode !== "confirmed",
);

// 休憩を選んでいる場合は、勤務のある日の休憩の編集を開き、通常の操作を止める。
const openBreakEditorIfBreakTool = (get: Getter, set: Setter, staffId: string, date: string): boolean => {
  if (!get(isBreakToolActiveAtom)) return false;
  const shift = get(shiftDraftsAtom).find((item) => item.staffId === staffId && item.date === date);
  if (hasWork(shift)) set(breakEditorTargetAtom, { staffId, date });
  return true;
};

/** 休憩を選んでいる場合に、その日の休憩の編集を開く。開いた場合（または通常の操作を止めた場合）はtrueを返す。 */
export const openBreakEditorForToolAtom = atom(
  null,
  (get, set, { staffId, date }: { staffId: string; date: string }): boolean =>
    openBreakEditorIfBreakTool(get, set, staffId, date),
);

// ==========================================
// 人数と過不足
// ==========================================
// 募集期間の全日の、人数と過不足。くわしく表示のときだけ値を持つ。定休日は含めない。
// スタッフ向けの確定シフト表示には、人数と過不足を出さない。
// 数えるのは、いま在籍しているシフト対象のスタッフの勤務だけである。
export const dayStaffingViewByDateAtom = atom((get) => {
  const views = new Map<string, DayStaffingView>();
  const config = get(shiftConfigAtom);
  if (!get(detailModeAtom) || config.displayMode === "confirmed") return views;

  const activeStaffIds = new Set(config.staffs.filter((staff) => !staff.isRemoved).map((staff) => staff.id));
  const shiftsByDate = new Map<string, ShiftData[]>();
  for (const shift of get(shiftsAtom)) {
    if (!activeStaffIds.has(shift.staffId)) continue;
    const dayShifts = shiftsByDate.get(shift.date);
    if (dayShifts) dayShifts.push(shift);
    else shiftsByDate.set(shift.date, [shift]);
  }
  const dayByDate = new Map((config.staffing?.days ?? []).map((day) => [day.date, day]));
  const newcomerStaffIdsByPositionId = collectNewcomerStaffIdsByPositionId(config.staffs);
  const closedDates = new Set(config.holidays);

  for (const date of config.dates) {
    if (closedDates.has(date)) continue;
    views.set(
      date,
      buildDayStaffingView({
        date,
        shifts: shiftsByDate.get(date) ?? [],
        positions: config.positions,
        submissionPattern: config.submissionPattern,
        timeRange: config.timeRange,
        day: dayByDate.get(date),
        newcomerStaffIdsByPositionId,
      }),
    );
  }
  return views;
});

// その日の必要人数を変えられるか。閲覧専用と確定済みでは、テンプレートの名前だけを出す。
export const canEditDayStaffingAtom = atom((get) => {
  const config = get(shiftConfigAtom);
  return !config.isReadOnly && config.staffing !== undefined && !config.staffing.isLocked;
});

// 人ごとの合計（募集期間の全日）。時刻を持つ勤務は休憩を引いた時間、日付選択は出勤日数。
export const staffWorkTotalsAtom = atom((get) =>
  sumStaffWorkTotals(get(shiftsAtom), get(shiftConfigAtom).submissionPattern.kind === "dateOnly" ? "days" : "minutes"),
);

export const shiftsForSelectedDateAtom = atom((get) => {
  const selectedDate = get(selectedDateAtom);
  return get(shiftsAtom).filter((shift) => shift.date === selectedDate);
});

export const shiftByStaffIdForSelectedDateAtom = atom((get) => indexShiftsByStaffId(get(shiftsForSelectedDateAtom)));

const buildDailyStaffOrder = (get: Getter, date: string): string[] | null => {
  const config = get(shiftConfigAtom);
  if (!date || config.staffs.length === 0) return null;

  const shiftByStaffId = indexShiftsByStaffId(get(shiftsAtom).filter((shift) => shift.date === date));
  const mode = config.submissionPattern.kind === "dateOnly" ? "dateOnly" : config.submissionPattern.kind;
  return sortDailyStaffs({
    staffs: config.staffs,
    shiftByStaffId,
    mode,
  }).map((staff) => staff.id);
};

export const lockDailyStaffOrderAtom = atom(null, (get, set, date: string) => {
  const staffIds = buildDailyStaffOrder(get, date);
  if (!staffIds) {
    set(lockedDailyStaffOrderAtom, null);
    return;
  }

  set(lockedDailyStaffOrderAtom, { date, staffIds });
});

export const selectDateWithDailyStaffOrderAtom = atom(null, (get, set, date: string) => {
  const staffIds = buildDailyStaffOrder(get, date);
  set(selectedDateAtom, date);
  set(lockedDailyStaffOrderAtom, staffIds ? { date, staffIds } : null);
});

export const dailySortedStaffsAtom = atom((get) => {
  const staffs = get(shiftConfigAtom).staffs;
  const lockedOrder = get(lockedDailyStaffOrderAtom);
  if (!lockedOrder) return [...staffs].sort(compareDefaultStaffOrder);

  const staffById = new Map(staffs.map((staff) => [staff.id, staff]));
  const orderedStaffs = lockedOrder.staffIds.flatMap((staffId) => {
    const staff = staffById.get(staffId);
    return staff ? [staff] : [];
  });
  const orderedIds = new Set(lockedOrder.staffIds);
  const missingStaffs = staffs.filter((staff) => !orderedIds.has(staff.id)).sort(compareDefaultStaffOrder);
  return [...orderedStaffs, ...missingStaffs];
});

export const sortedStaffsAtom = atom((get) => {
  const config = get(shiftConfigAtom);
  const sortMode = get(sortModeAtom);
  if (sortMode === "default") return [...config.staffs];

  return sortStaffs({
    staffs: config.staffs,
    shiftByStaffId: get(shiftByStaffIdForSelectedDateAtom),
    sortMode,
  });
});

// ==========================================
// 確定前バリデーションエラー（propsから同期、エラー一覧・バッジ・ハイライトで共有）
// ==========================================
export const validationIssuesAtom = atom<AssignmentIssue[]>([]);

// DateRailのエラーバッジ用: 日付ごとのエラー件数
export const issueCountByDateAtom = atom((get) => issueCountByDate(get(validationIssuesAtom)));

// 選択中日付でエラーを持つスタッフID（行ハイライト用）
export const issueStaffIdSetForSelectedDateAtom = atom((get) => {
  const selectedDate = get(selectedDateAtom);
  return new Set(
    get(validationIssuesAtom)
      .filter((issue) => issue.date === selectedDate)
      .map((issue) => issue.staffId),
  );
});

// ==========================================
// 確定前ワーニング（確認事項。確定をブロックしない助言）
// ==========================================
export const validationWarningsAtom = atom<AssignmentWarning[]>([]);

// 見習いだけの時間帯（確認事項）。スタッフ1人に結び付かないため、スタッフ別の確認事項とは別に持つ。
export const newcomerOnlyPeriodsAtom = atom<NewcomerOnlyPeriod[]>([]);

// DateRailのオレンジバッジ用: 日付ごとの確認事項件数。
// 見習いだけの時間帯は、帯の「見」の印で場所を確かめられる、くわしく表示のときだけ件数へ足す。
export const warningCountByDateAtom = atom((get) => {
  const counts = issueCountByDate(get(validationWarningsAtom));
  if (!get(detailModeAtom)) return counts;
  for (const period of get(newcomerOnlyPeriodsAtom)) {
    counts.set(period.date, (counts.get(period.date) ?? 0) + 1);
  }
  return counts;
});

// 選択中日付で確認事項を持つスタッフごとの理由（スタッフ名セルのアイコンTooltip用）
export const warningMessagesByStaffIdForSelectedDateAtom = atom((get) => {
  const selectedDate = get(selectedDateAtom);
  const messagesByStaffId = new Map<string, string[]>();
  for (const warning of get(validationWarningsAtom)) {
    if (warning.date !== selectedDate) continue;
    const messages = messagesByStaffId.get(warning.staffId) ?? [];
    messages.push(getAssignmentWarningSettingText(warning.code));
    messagesByStaffId.set(warning.staffId, messages);
  }
  return messagesByStaffId;
});
