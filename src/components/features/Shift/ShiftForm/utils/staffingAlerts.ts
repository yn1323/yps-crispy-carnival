import type { PeakBand, ShiftData } from "../types";
import { timeToMinutes } from "./timeConversion";

export type PeakBandStatus = {
  startTime: string;
  endTime: string;
  requiredCount: number;
  actualCount: number;
  shortfall: number;
  isSatisfied: boolean;
};

export type DayStaffingStatus = {
  peakBandStatuses: PeakBandStatus[];
  minimumStaffStatus: {
    requiredCount: number;
    actualMinCount: number;
    isSatisfied: boolean;
  } | null;
  isFullySatisfied: boolean;
};

// 特定時刻に稼働しているスタッフ数を計算
const countStaffAtMinute = (shifts: ShiftData[], date: string, minute: number): number => {
  let count = 0;
  for (const shift of shifts) {
    if (shift.date !== date) continue;
    for (const pos of shift.positions) {
      const posStart = timeToMinutes(pos.start);
      const posEnd = timeToMinutes(pos.end);
      if (minute >= posStart && minute < posEnd) {
        count++;
        break; // 1スタッフにつき1カウント（複数ポジション持ちでも）
      }
    }
  }
  return count;
};

// ピーク帯内の最小稼働人数を計算（30分刻みでサンプリング）
const getMinStaffInBand = (shifts: ShiftData[], date: string, startTime: string, endTime: string): number => {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);

  if (startMin >= endMin) return 0;

  let minCount = Number.POSITIVE_INFINITY;
  // 30分刻みでチェック
  for (let m = startMin; m < endMin; m += 30) {
    const count = countStaffAtMinute(shifts, date, m);
    minCount = Math.min(minCount, count);
  }

  return minCount === Number.POSITIVE_INFINITY ? 0 : minCount;
};

// 選択日のピーク帯ごとの充足度を計算
export const calculateDayStaffingStatus = (params: {
  shifts: ShiftData[];
  date: string;
  peakBands?: PeakBand[];
  minimumStaff?: number;
}): DayStaffingStatus => {
  const { shifts, date, peakBands, minimumStaff } = params;

  // ピーク帯ステータス
  const peakBandStatuses: PeakBandStatus[] = (peakBands ?? []).map((band) => {
    const actualCount = getMinStaffInBand(shifts, date, band.startTime, band.endTime);
    const shortfall = Math.max(0, band.requiredCount - actualCount);
    return {
      startTime: band.startTime,
      endTime: band.endTime,
      requiredCount: band.requiredCount,
      actualCount,
      shortfall,
      isSatisfied: shortfall === 0,
    };
  });

  // 最低人員ステータス（全営業時間帯で最低人員を満たしているか）
  let minimumStaffStatus: DayStaffingStatus["minimumStaffStatus"] = null;
  if (minimumStaff !== undefined && minimumStaff > 0) {
    // シフトが割り当てられている時間帯のみチェック
    const allShiftsForDate = shifts.filter((s) => s.date === date && s.positions.length > 0);
    if (allShiftsForDate.length > 0) {
      // ポジションが存在する全時間帯で最低人員をチェック
      const allPositions = allShiftsForDate.flatMap((s) => s.positions);
      const minTime = Math.min(...allPositions.map((p) => timeToMinutes(p.start)));
      const maxTime = Math.max(...allPositions.map((p) => timeToMinutes(p.end)));

      let actualMinCount = Number.POSITIVE_INFINITY;
      for (let m = minTime; m < maxTime; m += 30) {
        const count = countStaffAtMinute(shifts, date, m);
        actualMinCount = Math.min(actualMinCount, count);
      }
      actualMinCount = actualMinCount === Number.POSITIVE_INFINITY ? 0 : actualMinCount;

      minimumStaffStatus = {
        requiredCount: minimumStaff,
        actualMinCount,
        isSatisfied: actualMinCount >= minimumStaff,
      };
    }
  }

  const isFullySatisfied =
    peakBandStatuses.every((s) => s.isSatisfied) && (minimumStaffStatus === null || minimumStaffStatus.isSatisfied);

  return { peakBandStatuses, minimumStaffStatus, isFullySatisfied };
};

// 日単位の充足判定（バッジ用）
export const getDayStatus = (status: DayStaffingStatus): "none" | "warning" | "ok" => {
  if (status.peakBandStatuses.length === 0 && status.minimumStaffStatus === null) return "none";
  return status.isFullySatisfied ? "ok" : "warning";
};
