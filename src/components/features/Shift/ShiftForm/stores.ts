import { atom, type Getter } from "jotai";
import type { AssignmentIssue } from "@/convex/shiftBoard/validation";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { getAssignmentWarningSettingText } from "@/src/components/shared/ShiftAssignmentWarning";
import { issueCountByDate } from "@/src/domains/shift/assignmentIssues";
import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import { toggleDateOnlyAssignment } from "@/src/domains/shift/dateOnlyAssignments";
import { mergeAdjacentPositions, resolveDefaultPosition } from "@/src/domains/shift/operations";
import { indexShiftsByStaffId } from "@/src/domains/shift/shiftLookup";
import { type ShiftTypeOptionLike, toggleShiftTypeAssignment } from "@/src/domains/shift/shiftTypeAssignments";
import { compareDefaultStaffOrder, sortDailyStaffs, sortStaffs } from "@/src/domains/shift/sortStaffs";
import type {
  PositionType,
  RequiredStaffingData,
  ShiftData,
  SortMode,
  StaffType,
  TimeRange,
  ViewMode,
} from "@/src/domains/shift/types";
import { DEFAULT_TIME_PATTERN } from "@/src/domains/shop/submissionPattern";

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
  requiredStaffing?: RequiredStaffingData[];
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

export const updateShiftDraftsAtom = atom(null, (get, set, update: (current: ShiftData[]) => ShiftData[]) => {
  set(shiftDraftsAtom, update(get(shiftDraftsAtom)));
});

export const toggleDateOnlyAssignmentAtom = atom(
  null,
  (get, set, { staff, date }: { staff: StaffType; date: string }) => {
    const config = get(shiftConfigAtom);
    if (config.isReadOnly || !config.dates.includes(date) || config.holidays.includes(date)) return;

    const position = resolveDefaultPosition(config.positions);
    set(
      shiftDraftsAtom,
      toggleDateOnlyAssignment({
        shifts: get(shiftDraftsAtom),
        staff,
        date,
        timeRange: config.timeRange,
        position,
      }),
    );
  },
);

export const toggleShiftTypeAssignmentAtom = atom(
  null,
  (get, set, { staff, date, option }: { staff: StaffType; date: string; option: ShiftTypeOptionLike }) => {
    const config = get(shiftConfigAtom);
    if (config.isReadOnly || !config.dates.includes(date) || config.holidays.includes(date)) return;

    const position = resolveDefaultPosition(config.positions);

    set(
      shiftDraftsAtom,
      toggleShiftTypeAssignment({
        shifts: get(shiftDraftsAtom),
        staff,
        date,
        option,
        position,
      }),
    );
  },
);

export const upsertShiftDraftAtom = atom(null, (get, set, updatedShift: ShiftData) => {
  if (get(shiftConfigAtom).isReadOnly) return;

  const current = get(shiftDraftsAtom);
  const exists = current.some((shift) => shift.id === updatedShift.id);
  set(
    shiftDraftsAtom,
    exists ? current.map((shift) => (shift.id === updatedShift.id ? updatedShift : shift)) : [...current, updatedShift],
  );
});

export const clearShiftDraftPositionsAtom = atom(
  null,
  (get, set, { staffId, date }: { staffId: string; date: string }) => {
    if (get(shiftConfigAtom).isReadOnly) return;

    set(
      shiftDraftsAtom,
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
    set(
      shiftDraftsAtom,
      current.map((shift) => (shift.id === shiftId ? updatedShift : shift)),
    );
    return updatedShift;
  },
);

// ==========================================
// PC 日別ビューの動的 hourWidth（コンテナ幅に応じて可変）
// ==========================================
export const hourWidthAtom = atom<number>(120);

// ==========================================
// ポジション選択（ドラッグロジック内部で使用）
// ==========================================
export const selectedPositionIdAtom = atom<string | null>(null);

// ==========================================
// 派生atom
// ==========================================
export const selectedPositionAtom = atom((get) => {
  const config = get(shiftConfigAtom);
  const id = get(selectedPositionIdAtom);
  return id ? (config.positions.find((p) => p.id === id) ?? null) : null;
});

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

// DateRailのオレンジバッジ用: 日付ごとの確認事項件数
export const warningCountByDateAtom = atom((get) => issueCountByDate(get(validationWarningsAtom)));

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
