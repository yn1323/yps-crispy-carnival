import { Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useRef, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { useBottomSheet } from "@/src/components/ui/BottomSheet";
import { selectedDateAtom, shiftConfigAtom, shiftsAtom, sortedStaffsAtom } from "../../stores";
import type { ShiftData } from "../../types";
import { DateNavigator } from "./DateNavigator";
import { ShiftDetailSheet } from "./ShiftDetailSheet";
import { ShiftEditSheet } from "./ShiftEditSheet";
import { StaffAddSheet } from "./StaffAddSheet";
import { StaffCard } from "./StaffCard";

const SWIPE_THRESHOLD = 50;
const SHEET_TRANSITION_DELAY = 150;

export const SPDailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setShifts = useSetAtom(shiftsAtom);
  const sortedStaffs = useAtomValue(sortedStaffsAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);

  const { positions, dates, timeRange, isReadOnly, currentStaffId } = config;

  const editSheet = useBottomSheet();
  const detailSheet = useBottomSheet();
  const addSheet = useBottomSheet();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [openedFromAddSheet, setOpenedFromAddSheet] = useState(false);
  const touchStartX = useRef(0);

  // 当日分のシフトを抽出
  const dateShifts = useMemo(() => shifts.filter((s) => s.date === selectedDate), [shifts, selectedDate]);

  // 出勤者のみ（当日のシフトにポジションがあるスタッフ）
  const workingStaffs = useMemo(() => {
    const workingStaffIds = new Set(dateShifts.filter((s) => s.positions.length > 0).map((s) => s.staffId));
    return sortedStaffs.filter((s) => workingStaffIds.has(s.id));
  }, [sortedStaffs, dateShifts]);

  // 未出勤スタッフ（追加シート用）
  const nonWorkingStaffs = useMemo(() => {
    const workingStaffIds = new Set(workingStaffs.map((s) => s.id));
    return sortedStaffs.filter((s) => !workingStaffIds.has(s.id));
  }, [sortedStaffs, workingStaffs]);

  // 選択中スタッフとそのシフト
  const selectedStaff = useMemo(
    () => sortedStaffs.find((s) => s.id === selectedStaffId),
    [sortedStaffs, selectedStaffId],
  );
  const selectedShift = useMemo(
    () => dateShifts.find((s) => s.staffId === selectedStaffId),
    [dateShifts, selectedStaffId],
  );

  // カードタップ → read-only時は詳細シート、編集時は編集シート
  const handleCardTap = useCallback(
    (staffId: string) => {
      setSelectedStaffId(staffId);
      setOpenedFromAddSheet(false);
      if (isReadOnly) {
        detailSheet.open();
      } else {
        editSheet.open();
      }
    },
    [isReadOnly, detailSheet, editSheet],
  );

  // 追加シートからスタッフ選択 → 編集BottomSheet へ遷移
  const handleStaffSelect = useCallback(
    (staffId: string) => {
      addSheet.onOpenChange({ open: false });
      setSelectedStaffId(staffId);
      setOpenedFromAddSheet(true);
      setTimeout(() => editSheet.open(), SHEET_TRANSITION_DELAY);
    },
    [addSheet, editSheet],
  );

  const handleBackToAddSheet = useCallback(() => {
    editSheet.close();
    setOpenedFromAddSheet(false);
    setTimeout(() => addSheet.open(), SHEET_TRANSITION_DELAY);
  }, [editSheet, addSheet]);

  // シフト更新（BottomSheetから）
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

  // シフト全削除（BottomSheetから）
  const handleShiftDelete = useCallback(
    (staffId: string) => {
      const target = shifts.find((s) => s.staffId === staffId && s.date === selectedDate);
      if (target) {
        setShifts(shifts.map((s) => (s.id === target.id ? { ...s, positions: [] } : s)));
      }
    },
    [shifts, selectedDate, setShifts],
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
        setSelectedDate(dates[currentIndex - 1]);
      } else if (deltaX < 0 && currentIndex < dates.length - 1) {
        setSelectedDate(dates[currentIndex + 1]);
      }
    },
    [dates, selectedDate, setSelectedDate],
  );

  return (
    <Box onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <VStack gap={3} align="stretch" px={3} pb={4}>
        {/* 日付ナビ（スクロール時も固定） */}
        <Box position="sticky" top={0} zIndex={10} bg="white" mx={-3} px={3} py={1}>
          <DateNavigator dates={dates} selectedDate={selectedDate} onDateChange={setSelectedDate} />
        </Box>

        {/* 出勤者カードリスト */}
        {workingStaffs.map((staff) => {
          const staffShift = dateShifts.find((s) => s.staffId === staff.id);
          return (
            <StaffCard
              key={staff.id}
              staff={staff}
              shift={staffShift}
              timeRange={timeRange}
              onCardTap={() => handleCardTap(staff.id)}
              isHighlighted={staff.id === currentStaffId}
            />
          );
        })}

        {/* スタッフ追加ボタン（閲覧モードでは非表示） */}
        {!isReadOnly && nonWorkingStaffs.length > 0 && (
          <Flex
            align="center"
            justify="center"
            gap={2}
            py={3}
            borderWidth="1px"
            borderStyle="dashed"
            borderColor="gray.300"
            borderRadius="md"
            cursor="pointer"
            _active={{ bg: "gray.50" }}
            onClick={addSheet.open}
          >
            <Icon as={LuPlus} color="gray.500" boxSize={4} />
            <Text fontSize="sm" color="gray.500">
              スタッフを追加
            </Text>
          </Flex>
        )}
      </VStack>

      {/* 閲覧モード: 詳細BottomSheet */}
      {isReadOnly && selectedStaff && (
        <ShiftDetailSheet
          staff={selectedStaff}
          shift={selectedShift}
          selectedDate={selectedDate}
          isOpen={detailSheet.isOpen}
          onOpenChange={detailSheet.onOpenChange}
        />
      )}

      {/* 編集モード: スタッフ追加 + 編集BottomSheet */}
      {!isReadOnly && (
        <>
          <StaffAddSheet
            staffs={nonWorkingStaffs}
            shifts={dateShifts}
            selectedDate={selectedDate}
            isOpen={addSheet.isOpen}
            onOpenChange={addSheet.onOpenChange}
            onSelectStaff={handleStaffSelect}
          />
          {selectedStaff && (
            <ShiftEditSheet
              staff={selectedStaff}
              shift={selectedShift}
              positions={positions}
              timeRange={timeRange}
              selectedDate={selectedDate}
              isOpen={editSheet.isOpen}
              onOpenChange={editSheet.onOpenChange}
              onBack={openedFromAddSheet ? handleBackToAddSheet : undefined}
              onShiftUpdate={handleShiftUpdate}
              onShiftDelete={handleShiftDelete}
            />
          )}
        </>
      )}
    </Box>
  );
};
