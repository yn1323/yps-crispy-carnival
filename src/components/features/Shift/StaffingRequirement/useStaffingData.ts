import { useMemo, useState } from "react";
import { DAY_COUNT } from "./constants";
import type { PositionType, StaffingEntry } from "./types";
import { createStaffingKey, createStaffingMapFromFlat } from "./utils/staffingMapHelpers";

// Convex DBから取得されるフラット化された必要人員レコード
export type RequiredStaffingFlat = {
  _id: string;
  shopId: string;
  dayOfWeek: number;
  hour: number;
  position: string;
  requiredCount: number;
};

type UseStaffingDataParams = {
  initialStaffing: RequiredStaffingFlat[];
  selectedDay: number;
  hours: number[];
  positions: PositionType[];
};

export const useStaffingData = ({ initialStaffing, selectedDay, hours, positions }: UseStaffingDataParams) => {
  // 人員数マトリックス: { `${dayOfWeek}-${hour}-${position}`: count }
  const [staffingMap, setStaffingMap] = useState<Record<string, number>>(() =>
    createStaffingMapFromFlat(initialStaffing),
  );

  // 変更フラグ
  const [hasChanges, setHasChanges] = useState(false);

  // 設定済み曜日の算出（DayTabsの濃淡表示用）
  const configuredDays = useMemo(() => {
    const days: number[] = [];
    for (let day = 0; day < DAY_COUNT; day++) {
      const hasData = hours.some((hour) =>
        positions.some((position) => (staffingMap[createStaffingKey(day, hour, position.name)] ?? 0) > 0),
      );
      if (hasData) days.push(day);
    }
    return days;
  }, [staffingMap, hours, positions]);

  // 選択中の曜日の初期値（変更ハイライト用）
  const currentDayInitialStaffing = useMemo(() => {
    const result: StaffingEntry[] = [];
    for (const item of initialStaffing) {
      if (item.dayOfWeek === selectedDay) {
        result.push({ hour: item.hour, position: item.position, requiredCount: item.requiredCount });
      }
    }
    return result;
  }, [initialStaffing, selectedDay]);

  // 選択中の曜日のstaffing配列を生成
  const currentDayStaffing = useMemo(() => {
    const result: StaffingEntry[] = [];
    for (const hour of hours) {
      for (const position of positions) {
        result.push({
          hour,
          position: position.name,
          requiredCount: staffingMap[createStaffingKey(selectedDay, hour, position.name)] ?? 0,
        });
      }
    }
    return result;
  }, [staffingMap, selectedDay, hours, positions]);

  // StaffingTableからの変更を受け取る
  const handleStaffingChange = (newStaffing: StaffingEntry[]) => {
    setStaffingMap((prev) => {
      const newMap = { ...prev };
      for (const entry of newStaffing) {
        newMap[createStaffingKey(selectedDay, entry.hour, entry.position)] = entry.requiredCount;
      }
      return newMap;
    });
    setHasChanges(true);
  };

  // 指定曜日のstaffing配列を生成
  const buildStaffingArray = (dayOfWeek: number) => {
    const result: StaffingEntry[] = [];
    for (const hour of hours) {
      for (const position of positions) {
        result.push({
          hour,
          position: position.name,
          requiredCount: staffingMap[createStaffingKey(dayOfWeek, hour, position.name)] ?? 0,
        });
      }
    }
    return result;
  };

  // 現在の曜日のデータを初期値に復元
  const resetCurrentDay = () => {
    setStaffingMap((prev) => {
      const newMap = { ...prev };
      for (const hour of hours) {
        for (const position of positions) {
          newMap[createStaffingKey(selectedDay, hour, position.name)] = 0;
        }
      }
      for (const item of initialStaffing) {
        if (item.dayOfWeek === selectedDay) {
          newMap[createStaffingKey(item.dayOfWeek, item.hour, item.position)] = item.requiredCount;
        }
      }
      return newMap;
    });
    setHasChanges(false);
  };

  // コピー後のローカルstate更新
  const copyToTargetDays = (targetDays: number[]) => {
    setStaffingMap((prev) => {
      const newMap = { ...prev };
      for (const hour of hours) {
        for (const position of positions) {
          const sourceValue = prev[createStaffingKey(selectedDay, hour, position.name)] ?? 0;
          for (const targetDay of targetDays) {
            newMap[createStaffingKey(targetDay, hour, position.name)] = sourceValue;
          }
        }
      }
      return newMap;
    });
  };

  // AI再生成結果を適用
  const applyRegenerated = (result: StaffingEntry[]) => {
    setStaffingMap((prev) => {
      const newMap = { ...prev };
      for (const item of result) {
        newMap[createStaffingKey(selectedDay, item.hour, item.position)] = item.requiredCount;
      }
      return newMap;
    });
    setHasChanges(true);
  };

  return {
    staffingMap,
    hasChanges,
    setHasChanges,
    configuredDays,
    currentDayStaffing,
    currentDayInitialStaffing,
    handleStaffingChange,
    buildStaffingArray,
    resetCurrentDay,
    copyToTargetDays,
    applyRegenerated,
  };
};
