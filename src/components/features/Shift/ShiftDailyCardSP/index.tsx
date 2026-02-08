import { Box, VStack } from "@chakra-ui/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useBottomSheet } from "@/src/components/ui/BottomSheet";
import { DateNavigator } from "./DateNavigator";
import { FulfillmentBar } from "./FulfillmentBar";
import { ShiftEditSheet } from "./ShiftEditSheet";
import { StaffCard } from "./StaffCard";
import type { ShiftDailyCardSPProps } from "./types";

const SWIPE_THRESHOLD = 50;

export const ShiftDailyCardSP = ({
  staffs,
  positions,
  shifts,
  onShiftsChange,
  dates,
  timeRange,
  selectedDate,
  onDateChange,
  requiredStaffing,
}: ShiftDailyCardSPProps) => {
  const { isOpen, open, onOpenChange } = useBottomSheet();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const touchStartX = useRef(0);

  // 当日分のシフトを抽出
  const dateShifts = useMemo(() => shifts.filter((s) => s.date === selectedDate), [shifts, selectedDate]);

  // 選択中スタッフとそのシフト
  const selectedStaff = useMemo(() => staffs.find((s) => s.id === selectedStaffId), [staffs, selectedStaffId]);
  const selectedShift = useMemo(
    () => dateShifts.find((s) => s.staffId === selectedStaffId),
    [dateShifts, selectedStaffId],
  );

  // カードタップ → BottomSheet 開く
  const handleCardTap = useCallback(
    (staffId: string) => {
      setSelectedStaffId(staffId);
      open();
    },
    [open],
  );

  // シフト更新（BottomSheetから）
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

  // シフト全削除（BottomSheetから）
  const handleShiftDelete = useCallback(
    (staffId: string) => {
      const target = shifts.find((s) => s.staffId === staffId && s.date === selectedDate);
      if (target) {
        onShiftsChange(shifts.map((s) => (s.id === target.id ? { ...s, positions: [] } : s)));
      }
    },
    [shifts, selectedDate, onShiftsChange],
  );

  // スワイプ処理
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;

      const currentIndex = dates.indexOf(selectedDate);
      if (deltaX > 0 && currentIndex > 0) {
        onDateChange(dates[currentIndex - 1]);
      } else if (deltaX < 0 && currentIndex < dates.length - 1) {
        onDateChange(dates[currentIndex + 1]);
      }
    },
    [dates, selectedDate, onDateChange],
  );

  return (
    <Box onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <VStack gap={3} align="stretch" px={3} pb={4}>
        {/* 日付ナビ */}
        <DateNavigator dates={dates} selectedDate={selectedDate} onDateChange={onDateChange} />

        {/* 充足度サマリー */}
        <FulfillmentBar shifts={shifts} selectedDate={selectedDate} requiredStaffing={requiredStaffing} />

        {/* スタッフカードリスト */}
        {staffs.map((staff) => {
          const staffShift = dateShifts.find((s) => s.staffId === staff.id);
          return (
            <StaffCard
              key={staff.id}
              staff={staff}
              shift={staffShift}
              timeRange={timeRange}
              onCardTap={() => handleCardTap(staff.id)}
            />
          );
        })}
      </VStack>

      {/* 編集BottomSheet */}
      {selectedStaff && (
        <ShiftEditSheet
          staff={selectedStaff}
          shift={selectedShift}
          positions={positions}
          timeRange={timeRange}
          selectedDate={selectedDate}
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          onShiftUpdate={handleShiftUpdate}
          onShiftDelete={handleShiftDelete}
        />
      )}
    </Box>
  );
};
