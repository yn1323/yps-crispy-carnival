import { Flex, Text, VStack } from "@chakra-ui/react";
import { useCallback, useMemo, useState } from "react";
import { useBottomSheet } from "@/src/components/ui/BottomSheet";
import { Select } from "@/src/components/ui/Select";
import { ShiftEditSheet } from "../ShiftDailyCardSP/ShiftEditSheet";
import { StaffAddSheet } from "../ShiftDailyCardSP/StaffAddSheet";
import { isHoliday } from "../ShiftOverview/utils/dateUtils";
import type { SortMode } from "../ShiftTableTest/types";
import { DateCard } from "./DateCard";
import type { ShiftOverviewCardSPProps } from "./types";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "default", label: "登録順" },
  { value: "request", label: "希望時間順" },
  { value: "startTime", label: "開始時間順" },
];

export const ShiftOverviewCardSP = ({
  dates,
  staffs,
  shifts,
  holidays = [],
  onDateClick,
  sortMode,
  onSortModeChange,
  positions,
  timeRange,
  onShiftsChange,
  isReadOnly = false,
}: ShiftOverviewCardSPProps) => {
  const addSheet = useBottomSheet();
  const editSheet = useBottomSheet();
  const [addTargetDate, setAddTargetDate] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  const dateData = useMemo(
    () =>
      dates.map((date) => ({
        date,
        shifts: shifts.filter((s) => s.date === date),
        isHoliday: isHoliday(date, holidays),
      })),
    [dates, shifts, holidays],
  );

  // 日付ごとの未出勤スタッフ有無を事前計算
  const nonWorkingStaffsByDate = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const date of dates) {
      const workingIds = new Set(shifts.filter((s) => s.date === date && s.positions.length > 0).map((s) => s.staffId));
      map.set(
        date,
        staffs.some((s) => !workingIds.has(s.id)),
      );
    }
    return map;
  }, [dates, shifts, staffs]);

  // 追加対象日のシフト
  const addTargetDateShifts = useMemo(
    () => (addTargetDate ? shifts.filter((s) => s.date === addTargetDate) : []),
    [shifts, addTargetDate],
  );

  // 追加対象日の未出勤スタッフ（StaffAddSheet用）
  const nonWorkingStaffsForAdd = useMemo(() => {
    if (!addTargetDate) return [];
    const workingIds = new Set(addTargetDateShifts.filter((s) => s.positions.length > 0).map((s) => s.staffId));
    return staffs.filter((s) => !workingIds.has(s.id));
  }, [staffs, addTargetDateShifts, addTargetDate]);

  // ShiftEditSheet用
  const selectedStaff = useMemo(() => staffs.find((s) => s.id === selectedStaffId), [staffs, selectedStaffId]);
  const selectedShift = useMemo(
    () => addTargetDateShifts.find((s) => s.staffId === selectedStaffId),
    [addTargetDateShifts, selectedStaffId],
  );

  // DateCardの "+" ボタン
  const handleAddStaffClick = useCallback(
    (date: string) => {
      setAddTargetDate(date);
      addSheet.open();
    },
    [addSheet],
  );

  // StaffAddSheetからスタッフ選択 → ShiftEditSheetへ遷移
  const handleStaffSelect = useCallback(
    (staffId: string) => {
      addSheet.onOpenChange({ open: false });
      setSelectedStaffId(staffId);
      setTimeout(() => editSheet.open(), 150);
    },
    [addSheet, editSheet],
  );

  // シフト更新
  const handleShiftUpdate = useCallback(
    (updatedShift: (typeof shifts)[number]) => {
      const exists = shifts.some((s) => s.id === updatedShift.id);
      if (exists) {
        onShiftsChange(shifts.map((s) => (s.id === updatedShift.id ? updatedShift : s)));
      } else {
        onShiftsChange([...shifts, updatedShift]);
      }
    },
    [shifts, onShiftsChange],
  );

  // シフト全削除
  const handleShiftDelete = useCallback(
    (staffId: string) => {
      if (!addTargetDate) return;
      const target = shifts.find((s) => s.staffId === staffId && s.date === addTargetDate);
      if (target) {
        onShiftsChange(shifts.map((s) => (s.id === target.id ? { ...s, positions: [] } : s)));
      }
    },
    [shifts, addTargetDate, onShiftsChange],
  );

  return (
    <VStack gap={3} align="stretch" px={3} pb={4}>
      {/* ソートメニュー */}
      <Flex justify="flex-end">
        <Select
          items={SORT_OPTIONS}
          value={sortMode ?? "default"}
          onChange={(v) => onSortModeChange(v as SortMode)}
          size="sm"
          w="140px"
        />
      </Flex>

      {/* 日付カードリスト */}
      {dateData.map(({ date, shifts: dateShifts, isHoliday: holiday }) => (
        <DateCard
          key={date}
          date={date}
          staffs={staffs}
          shifts={dateShifts}
          isHoliday={holiday}
          onTap={() => onDateClick?.(date)}
          hasNonWorkingStaffs={nonWorkingStaffsByDate.get(date) ?? false}
          onAddStaffClick={() => handleAddStaffClick(date)}
          isReadOnly={isReadOnly}
        />
      ))}

      {dates.length === 0 && (
        <Text fontSize="sm" color="gray.400" textAlign="center" py={8}>
          表示する日付がありません
        </Text>
      )}

      {/* スタッフ追加 + 編集BottomSheet（閲覧モードでは非表示） */}
      {!isReadOnly && (
        <>
          {addTargetDate && (
            <StaffAddSheet
              staffs={nonWorkingStaffsForAdd}
              shifts={addTargetDateShifts}
              selectedDate={addTargetDate}
              isOpen={addSheet.isOpen}
              onOpenChange={addSheet.onOpenChange}
              onSelectStaff={handleStaffSelect}
            />
          )}
          {selectedStaff && addTargetDate && (
            <ShiftEditSheet
              staff={selectedStaff}
              shift={selectedShift}
              positions={positions}
              timeRange={timeRange}
              selectedDate={addTargetDate}
              isOpen={editSheet.isOpen}
              onOpenChange={editSheet.onOpenChange}
              onShiftUpdate={handleShiftUpdate}
              onShiftDelete={handleShiftDelete}
            />
          )}
        </>
      )}
    </VStack>
  );
};
