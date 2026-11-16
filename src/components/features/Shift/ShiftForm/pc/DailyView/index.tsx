import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import type { ShiftData } from "@/src/domains/shift/types";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import {
  breakEditorTargetAtom,
  changeShiftPositionAtom,
  dayStaffingMarksByDateAtom,
  deleteShiftPositionAtom,
  isBreakToolActiveAtom,
  issueCountByDateAtom,
  isToolPaletteActiveAtom,
  selectDateWithDailyStaffOrderAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsForSelectedDateAtom,
  warningCountByDateAtom,
} from "../../stores";
import { DateRail } from "./DateRail";
import { DayTitle } from "./DayTitle";
import { ShiftGrid } from "./ShiftGrid";
import { ShiftPopover } from "./ShiftPopover";

export const DailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shiftsForSelectedDate = useAtomValue(shiftsForSelectedDateAtom);
  const deleteShiftPosition = useSetAtom(deleteShiftPositionAtom);
  const changeShiftPosition = useSetAtom(changeShiftPositionAtom);
  const setBreakEditorTarget = useSetAtom(breakEditorTargetAtom);
  const isToolPaletteActive = useAtomValue(isToolPaletteActiveAtom);
  const isBreakToolActive = useAtomValue(isBreakToolActiveAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const staffingMarks = useAtomValue(dayStaffingMarksByDateAtom);

  const { dates, isReadOnly, holidays } = config;
  const isShopClosedDate = holidays.includes(selectedDate);
  useLockedDailyStaffOrder(selectedDate);

  const [popoverShift, setPopoverShift] = useState<ShiftData | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);

  const handleShiftClick = useCallback(
    (shiftId: string, _positionId: string | null, e: React.MouseEvent) => {
      // 休憩を選んでいる間は、押した時点で休憩の編集が開く。勤務の欄を重ねて開かない。
      if (isBreakToolActive) return;
      const shift = shiftsForSelectedDate.find((s) => s.id === shiftId);
      if (shift) {
        setPopoverShift(shift);
        setPopoverAnchor(e.currentTarget.getBoundingClientRect());
      }
    },
    [shiftsForSelectedDate, isBreakToolActive],
  );

  const handlePopoverClose = useCallback(() => {
    setPopoverShift(null);
    setPopoverAnchor(null);
  }, []);

  const handleDeletePosition = useCallback(
    (positionId: string) => {
      if (!popoverShift) return;
      const updatedShift = deleteShiftPosition({ shiftId: popoverShift.id, positionId });
      if (!updatedShift) return;
      if (updatedShift.positions.length === 0) {
        handlePopoverClose();
        return;
      }
      setPopoverShift(updatedShift);
    },
    [deleteShiftPosition, popoverShift, handlePopoverClose],
  );

  const handleChangePosition = useCallback(
    (segmentId: string, positionId: string) => {
      if (!popoverShift) return;
      changeShiftPosition({ shiftId: popoverShift.id, segmentId, positionId });
      // ポジションを変えると隣の勤務とまとまることがあるため、内容が変わったら閉じる。
      handlePopoverClose();
    },
    [changeShiftPosition, popoverShift, handlePopoverClose],
  );

  const handleEditBreaks = useCallback(() => {
    if (!popoverShift) return;
    setBreakEditorTarget({ staffId: popoverShift.staffId, date: popoverShift.date });
    handlePopoverClose();
  }, [popoverShift, setBreakEditorTarget, handlePopoverClose]);

  const handlePaintClickPopover = useCallback((shift: ShiftData, anchorRect: DOMRect) => {
    setPopoverShift(shift);
    setPopoverAnchor(anchorRect);
  }, []);

  return (
    <Grid flex={1} minH={0} overflow="hidden" templateColumns="80px minmax(0, 1fr)">
      <DateRail
        dates={dates}
        selectedDate={selectedDate}
        onSelect={selectDate}
        holidays={holidays}
        issueCounts={issueCounts}
        warningCounts={warningCounts}
        staffingMarks={staffingMarks}
      />
      <Flex direction="column" minW={0} minH={0} overflow="hidden">
        <DayTitle date={selectedDate} holidays={holidays} />
        {isShopClosedDate ? (
          <Flex flex={1} minH={0} bg="gray.50" align="center" justify="center" direction="column" gap={2} px={6}>
            <Text fontSize="md" fontWeight="bold" color="gray.700">
              定休日
            </Text>
            <Text fontSize="sm" color="fg.muted" textAlign="center">
              この日は店舗の定休日のため、シフトを登録できません。
            </Text>
          </Flex>
        ) : (
          <Box flex={1} minH={0} overflow="hidden">
            <ShiftGrid
              onShiftClick={handleShiftClick}
              onStaffNameClick={() => {}}
              onPaintClickPopover={handlePaintClickPopover}
            />
          </Box>
        )}
      </Flex>

      <ShiftPopover
        shift={popoverShift}
        anchorRect={popoverAnchor}
        isOpen={popoverShift !== null}
        isStaffSubmitted={
          popoverShift ? (config.staffs.find((s) => s.id === popoverShift.staffId)?.isSubmitted ?? false) : false
        }
        onClose={handlePopoverClose}
        onDeletePosition={handleDeletePosition}
        onChangePosition={handleChangePosition}
        onEditBreaks={isToolPaletteActive && popoverShift ? handleEditBreaks : undefined}
        isReadOnly={isReadOnly}
      />
    </Grid>
  );
};
