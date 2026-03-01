import dayjs from "dayjs";
import { POSITION_COLORS } from "@/convex/constants";
import type { PositionType, ShiftData, StaffType, TimeRange } from "../ShiftForm/types";

// ==========================================
// Convex レスポンス型（useQuery の戻り値に対応）
// ==========================================

type ConvexStaff = {
  _id: string;
  displayName: string;
  status: string;
};

type ConvexShiftRequest = {
  _id: string;
  staffId: string;
  entries: {
    date: string;
    isAvailable: boolean;
    startTime?: string;
    endTime?: string;
  }[];
};

type ConvexPosition = {
  _id: string;
  name: string;
  color?: string;
  order: number;
};

type ConvexShiftAssignment = {
  assignments: {
    staffId: string;
    date: string;
    positions: {
      positionId: string;
      positionName: string;
      color: string;
      start: string;
      end: string;
    }[];
  }[];
} | null;

// ==========================================
// 変換関数
// ==========================================

/** 開始日〜終了日の日付配列を生成（YYYY-MM-DD） */
export const generateDateRange = (startDate: string, endDate: string): string[] => {
  const dates: string[] = [];
  let current = dayjs(startDate);
  const end = dayjs(endDate);
  while (current.isBefore(end) || current.isSame(end, "day")) {
    dates.push(current.format("YYYY-MM-DD"));
    current = current.add(1, "day");
  }
  return dates;
};

/** 店舗の営業時間 → TimeRange に変換 */
export const parseTimeRange = (shop: { openTime: string; closeTime: string; timeUnit: number }): TimeRange => ({
  start: Number.parseInt(shop.openTime.split(":")[0], 10),
  end: Number.parseInt(shop.closeTime.split(":")[0], 10),
  unit: shop.timeUnit,
});

/** スタッフ一覧 → StaffType[] に変換（提出済み判定付き） */
export const transformStaffs = (params: {
  staffList: ConvexStaff[];
  shiftRequests: ConvexShiftRequest[];
}): StaffType[] => {
  const submittedStaffIds = new Set(params.shiftRequests.map((r) => r.staffId));
  return params.staffList
    .filter((s) => s.status !== "resigned")
    .map((s) => ({
      id: s._id,
      name: s.displayName,
      isSubmitted: submittedStaffIds.has(s._id),
    }));
};

/** ポジション定義 → PositionType[] に変換（color fallback 付き） */
export const transformPositions = (positions: ConvexPosition[]): PositionType[] =>
  positions.map((p, index) => ({
    id: p._id,
    name: p.name,
    color: p.color ?? POSITION_COLORS[index % POSITION_COLORS.length],
  }));

/** シフト申請 → ShiftData[] に変換（isAvailable=true のエントリのみ展開） */
export const transformShiftRequests = (params: {
  shiftRequests: ConvexShiftRequest[];
  staffList: ConvexStaff[];
  positions: PositionType[];
}): ShiftData[] => {
  const staffMap = new Map(params.staffList.map((s) => [s._id, s.displayName]));
  const shifts: ShiftData[] = [];

  for (const req of params.shiftRequests) {
    const staffName = staffMap.get(req.staffId) ?? "";
    for (const entry of req.entries) {
      if (!entry.isAvailable) continue;
      shifts.push({
        id: `${req.staffId}_${entry.date}`,
        staffId: req.staffId,
        staffName,
        date: entry.date,
        requestedTime: entry.startTime && entry.endTime ? { start: entry.startTime, end: entry.endTime } : null,
        positions: [],
      });
    }
  }

  return shifts;
};

/** 保存済み shiftAssignment のポジションを ShiftData にマージ */
export const mergeAssignments = (params: {
  baseShifts: ShiftData[];
  assignments: ConvexShiftAssignment;
  staffList: ConvexStaff[];
}): ShiftData[] => {
  if (!params.assignments) return params.baseShifts;

  const staffMap = new Map(params.staffList.map((s) => [s._id, s.displayName]));
  const result = params.baseShifts.map((s) => ({ ...s, positions: [...s.positions] }));
  const shiftMap = new Map(result.map((s) => [`${s.staffId}_${s.date}`, s]));

  for (const a of params.assignments.assignments) {
    const key = `${a.staffId}_${a.date}`;
    const existing = shiftMap.get(key);

    if (existing) {
      // 保存済みポジションで上書き
      existing.positions = a.positions.map((p, i) => ({
        id: `${key}_pos_${i}`,
        positionId: p.positionId,
        positionName: p.positionName,
        color: p.color,
        start: p.start,
        end: p.end,
      }));
    } else if (a.positions.length > 0) {
      // 管理者が追加したシフト（元の申請にないもの）
      const newShift: ShiftData = {
        id: key,
        staffId: a.staffId,
        staffName: staffMap.get(a.staffId) ?? "",
        date: a.date,
        requestedTime: null,
        positions: a.positions.map((p, i) => ({
          id: `${key}_pos_${i}`,
          positionId: p.positionId,
          positionName: p.positionName,
          color: p.color,
          start: p.start,
          end: p.end,
        })),
      };
      result.push(newShift);
    }
  }

  return result;
};
