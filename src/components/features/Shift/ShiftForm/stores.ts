import { atom, type Getter, type Setter } from "jotai";
import type { AssignmentIssue } from "@/convex/shiftBoard/validation";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { getAssignmentWarningSettingText } from "@/src/components/shared/ShiftAssignmentWarning";
import { issueCountByDate } from "@/src/domains/shift/assignmentIssues";
import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import { withInitialBreak } from "@/src/domains/shift/breaks";
import { toggleDateOnlyAssignment } from "@/src/domains/shift/dateOnlyAssignments";
import { mergeAdjacentPositions, resolveDefaultPosition } from "@/src/domains/shift/operations";
import { isCanonicalWorkPosition } from "@/src/domains/shift/positions";
import { indexShiftsByStaffId } from "@/src/domains/shift/shiftLookup";
import { type ShiftTypeOptionLike, toggleShiftTypeAssignment } from "@/src/domains/shift/shiftTypeAssignments";
import { compareDefaultStaffOrder, sortDailyStaffs, sortStaffs } from "@/src/domains/shift/sortStaffs";
import type { NewcomerOnlyPeriod } from "@/src/domains/shift/staffing";
import type { PositionType, ShiftData, SortMode, StaffType, TimeRange, ViewMode } from "@/src/domains/shift/types";
import { sumStaffWorkTotals } from "@/src/domains/shift/workTotals";
import { DEFAULT_TIME_PATTERN } from "@/src/domains/shop/submissionPattern";
import {
  buildDayStaffingMarks,
  buildDayStaffingView,
  collectNewcomerStaffIds,
  type DayStaffingView,
} from "./staffingPresentation";
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
  (get, set, { shiftId, positionId }: { shiftId: string; positionId: string }): ShiftData | null => {
    if (get(shiftConfigAtom).isReadOnly) return null;

    const current = get(shiftDraftsAtom);
    const target = current.find((shift) => shift.id === shiftId);
    if (!target) return null;

    const updatedShift = {
      ...target,
      positions: mergeAdjacentPositions(target.positions.filter((position) => position.id !== positionId)),
    };
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

/** 勤務区間のポジションを変える。 */
export const changeShiftPositionAtom = atom(
  null,
  (get, set, { shiftId, segmentId, positionId }: { shiftId: string; segmentId: string; positionId: string }) => {
    const config = get(shiftConfigAtom);
    if (config.isReadOnly) return;
    const position = config.positions.find((item) => item.id === positionId);
    if (!position) return;
    set(
      shiftDraftsAtom,
      get(shiftDraftsAtom).map((shift) =>
        shift.id === shiftId
          ? {
              ...shift,
              positions: mergeAdjacentPositions(
                shift.positions.map((segment) =>
                  segment.id === segmentId
                    ? { ...segment, positionId: position.id, positionName: position.name, color: position.color }
                    : segment,
                ),
              ),
            }
          : shift,
      ),
    );
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
export const selectedPositionIdAtom = atom<string | null>(null);
// 休憩を選んでいる間は、勤務を押すと休憩の編集を開く。
export const breakToolActiveAtom = atom<boolean>(false);
// 休憩を編集中の日。nullのときは休憩の編集を閉じている。
export const breakEditorTargetAtom = atom<{ staffId: string; date: string } | null>(null);

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

// 新しい勤務に使うポジション。選んでいなければ既定のポジション。
const workPositionAtom = atom(
  (get) => get(selectedPositionAtom) ?? resolveDefaultPosition(get(shiftConfigAtom).positions),
);

export const isBreakToolActiveAtom = atom((get) => get(isToolPaletteActiveAtom) && get(breakToolActiveAtom));

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
  const newcomerStaffIds = collectNewcomerStaffIds(config.staffs);
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
        newcomerStaffIds,
      }),
    );
  }
  return views;
});

// 日付の一覧に出す、不足のある日と多い時間のある日の印。
export const dayStaffingMarksByDateAtom = atom((get) => buildDayStaffingMarks(get(dayStaffingViewByDateAtom)));

// その日の必要人数を変えられるか。閲覧専用と確定済みでは、型の名前だけを出す。
export const canEditDayStaffingAtom = atom((get) => {
  const config = get(shiftConfigAtom);
  return !config.isReadOnly && config.staffing !== undefined && !config.staffing.isLocked;
});

// 開いている、その日の型のDialog。bulkは「ほかの日もまとめて変える」、customは「この日だけ人数を変える」。
export const dayStaffingDialogAtom = atom<{ kind: "bulk" | "custom"; date: string } | null>(null);

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

// 新人だけの時間帯（確認事項）。スタッフ1人に結び付かないため、スタッフ別の確認事項とは別に持つ。
export const newcomerOnlyPeriodsAtom = atom<NewcomerOnlyPeriod[]>([]);

// DateRailのオレンジバッジ用: 日付ごとの確認事項件数。
// 新人だけの時間帯は、帯の「新」の印で場所を確かめられる、くわしく表示のときだけ件数へ足す。
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
