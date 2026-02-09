import { Flex, Text, VStack } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useBottomSheet } from "@/src/components/ui/BottomSheet";
import { Select } from "@/src/components/ui/Select";
import {
  selectedDateAtom,
  shiftConfigAtom,
  shiftsAtom,
  sortedStaffsAtom,
  sortModeAtom,
  viewModeAtom,
} from "../../stores";
import type { ShiftData, SortMode } from "../../types";
import { isHoliday } from "../../utils/dateUtils";
import { ShiftEditSheet } from "../DailyView/ShiftEditSheet";
import { StaffAddSheet } from "../DailyView/StaffAddSheet";
import { DateCard } from "./DateCard";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "default", label: "登録順" },
  { value: "request", label: "希望時間順" },
  { value: "startTime", label: "開始時間順" },
];

export const SPOverviewView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setShifts = useSetAtom(shiftsAtom);
  const sortedStaffs = useAtomValue(sortedStaffsAtom);
  const sortMode = useAtomValue(sortModeAtom);
  const setSortMode = useSetAtom(sortModeAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const { dates, holidays, positions, timeRange, isReadOnly } = config;

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
        sortedStaffs.some((s) => !workingIds.has(s.id)),
      );
    }
    return map;
  }, [dates, shifts, sortedStaffs]);

  // 追加対象日のシフト
  const addTargetDateShifts = useMemo(
    () => (addTargetDate ? shifts.filter((s) => s.date === addTargetDate) : []),
    [shifts, addTargetDate],
  );

  // 追加対象日の未出勤スタッフ
  const nonWorkingStaffsForAdd = useMemo(() => {
    if (!addTargetDate) return [];
    const workingIds = new Set(addTargetDateShifts.filter((s) => s.positions.length > 0).map((s) => s.staffId));
    return sortedStaffs.filter((s) => !workingIds.has(s.id));
  }, [sortedStaffs, addTargetDateShifts, addTargetDate]);

  // ShiftEditSheet用
  const selectedStaff = useMemo(
    () => sortedStaffs.find((s) => s.id === selectedStaffId),
    [sortedStaffs, selectedStaffId],
  );
  const selectedShift = useMemo(
    () => addTargetDateShifts.find((s) => s.staffId === selectedStaffId),
    [addTargetDateShifts, selectedStaffId],
  );

  // 日付カードタップ → 日別ビューに遷移
  const handleDateClick = useCallback(
    (date: string) => {
      setSelectedDate(date);
      setViewMode("daily");
    },
    [setSelectedDate, setViewMode],
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
    (updatedShift: ShiftData) => {
      const exists = shifts.some((s) => s.id === updatedShift.id);
      if (exists) {
        setShifts(shifts.map((s) => (s.id === updatedShift.id ? updatedShift : s)));
      } else {
        setShifts([...shifts, updatedShift]);
      }
    },
    [shifts, setShifts],
  );

  // シフト全削除
  const handleShiftDelete = useCallback(
    (staffId: string) => {
      if (!addTargetDate) return;
      const target = shifts.find((s) => s.staffId === staffId && s.date === addTargetDate);
      if (target) {
        setShifts(shifts.map((s) => (s.id === target.id ? { ...s, positions: [] } : s)));
      }
    },
    [shifts, addTargetDate, setShifts],
  );

  return (
    <VStack gap={3} align="stretch" px={3} pb={4}>
      {/* ソートメニュー */}
      <Flex justify="flex-end">
        <Select
          items={SORT_OPTIONS}
          value={sortMode ?? "default"}
          onChange={(v) => setSortMode(v as SortMode)}
          size="sm"
          w="140px"
        />
      </Flex>

      {/* 日付カードリスト */}
      {dateData.map(({ date, shifts: dateShifts, isHoliday: holiday }) => (
        <DateCard
          key={date}
          date={date}
          staffs={sortedStaffs}
          shifts={dateShifts}
          isHoliday={holiday}
          onTap={() => handleDateClick(date)}
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

      {/* スタッフ追加 + 編集BottomSheet */}
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
