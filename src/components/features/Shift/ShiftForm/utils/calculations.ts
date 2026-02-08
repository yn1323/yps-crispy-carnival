import type { DailyShift, ShiftData, StaffRowData, StaffType } from "../types";
import { getMonthKey } from "./dateUtils";
import { timeToMinutes } from "./timeConversion";

// 1日の勤務時間（分）を計算
// ポジションセグメントの実際の勤務時間を合計（休憩時間は除外）
export const calculateDailyMinutes = (shift: ShiftData): number => {
  if (!shift.positions || shift.positions.length === 0) {
    return 0;
  }

  // 休憩セグメントを除外して時間を合計
  return shift.positions
    .filter((segment) => segment.positionName !== "休憩")
    .reduce((total, segment) => {
      const start = timeToMinutes(segment.start);
      const end = timeToMinutes(segment.end);
      return total + (end - start);
    }, 0);
};

// 分を "H:MM" 形式に変換
const minutesToTimeString = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${String(mins).padStart(2, "0")}`;
};

// シフトデータから1日の開始・終了時刻を取得
// ポジションセグメントの最早開始〜最遅終了を返す
export const getDailyShiftTime = (shift: ShiftData): DailyShift | null => {
  if (!shift.positions || shift.positions.length === 0) {
    return null;
  }

  const starts = shift.positions.map((p) => timeToMinutes(p.start));
  const ends = shift.positions.map((p) => timeToMinutes(p.end));

  const minStart = Math.min(...starts);
  const maxEnd = Math.max(...ends);

  return {
    start: minutesToTimeString(minStart),
    end: minutesToTimeString(maxEnd),
  };
};

// 月別合計時間を計算
export const calculateMonthlyTotals = (shifts: ShiftData[], staffId: string, months: string[]): Map<string, number> => {
  const totals = new Map<string, number>();

  // 初期化
  for (const month of months) {
    totals.set(month, 0);
  }

  // 該当スタッフのシフトを集計
  const staffShifts = shifts.filter((s) => s.staffId === staffId);

  for (const shift of staffShifts) {
    const monthKey = getMonthKey(shift.date);
    const minutes = calculateDailyMinutes(shift);
    const current = totals.get(monthKey) ?? 0;
    totals.set(monthKey, current + minutes);
  }

  return totals;
};

// スタッフ行表示用データを準備
export const prepareStaffRowData = (
  staffs: StaffType[],
  shifts: ShiftData[],
  allShifts: ShiftData[],
  dates: string[],
  months: string[],
): StaffRowData[] => {
  return staffs.map((staff) => {
    // 日付ごとのシフトデータを作成（表示期間内のみ）
    const dailyShifts = new Map<string, DailyShift | null>();
    let totalMinutes = 0;

    for (const date of dates) {
      const shift = shifts.find((s) => s.staffId === staff.id && s.date === date);
      if (shift) {
        const dailyShift = getDailyShiftTime(shift);
        dailyShifts.set(date, dailyShift);
        totalMinutes += calculateDailyMinutes(shift);
      } else {
        dailyShifts.set(date, null);
      }
    }

    // 月別合計（allShiftsを使用して期間外も含む）
    const monthlyTotals = calculateMonthlyTotals(allShifts, staff.id, months);

    return {
      staffId: staff.id,
      staffName: staff.name,
      isSubmitted: staff.isSubmitted,
      dailyShifts,
      monthlyTotals,
      totalMinutes,
      alerts: [], // Phase 5 で実装
    };
  });
};
