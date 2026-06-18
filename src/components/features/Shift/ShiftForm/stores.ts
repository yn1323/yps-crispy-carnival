import { atom } from "jotai";
import type { AssignmentIssue } from "@/convex/shiftBoard/validation";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { issueCountByDate } from "@/src/domains/shift/assignmentIssues";
import { getAssignmentWarningSettingText } from "@/src/domains/shift/assignmentWarningSummary";
import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import { indexShiftsByStaffId } from "@/src/domains/shift/shiftLookup";
import { sortStaffs } from "@/src/domains/shift/sortStaffs";
import type {
  PositionType,
  RequiredStaffingData,
  ShiftData,
  SortMode,
  StaffType,
  TimeRange,
  ViewMode,
} from "@/src/domains/shift/types";

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
  submissionPattern?: ShiftSubmissionPattern;
  displayMode?: "request" | "confirmed";
}>({
  shopId: "",
  staffs: [],
  positions: [],
  dates: [],
  timeRange: { start: 9, end: 22, unit: 30 },
  holidays: [],
  isReadOnly: false,
  displayMode: "request",
});

// ==========================================
// コア状態
// ==========================================
export const viewModeAtom = atom<ViewMode>("daily");
export const selectedDateAtom = atom<string>("");
export const sortModeAtom = atom<SortMode>("default");

// ==========================================
// シフトデータ
// ==========================================
export const shiftsAtom = atom<ShiftData[]>([]);

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
