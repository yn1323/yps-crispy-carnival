import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { mergeAdjacentPositions } from "@/src/domains/shift/operations";
import type { ShiftData } from "@/src/domains/shift/types";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import {
  issueCountByDateAtom,
  selectDateWithDailyStaffOrderAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsAtom,
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
  const setShifts = useSetAtom(shiftsAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);

  const { dates, isReadOnly, holidays } = config;
  const isShopClosedDate = holidays.includes(selectedDate);
  useLockedDailyStaffOrder(selectedDate);

  const [popoverShift, setPopoverShift] = useState<ShiftData | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);

  const handleShiftClick = useCallback(
    (shiftId: string, _positionId: string | null, e: React.MouseEvent) => {
      const shift = shiftsForSelectedDate.find((s) => s.id === shiftId);
      if (shift) {
        setPopoverShift(shift);
        setPopoverAnchor(e.currentTarget.getBoundingClientRect());
      }
    },
    [shiftsForSelectedDate],
  );

  const handlePopoverClose = useCallback(() => {
    setPopoverShift(null);
    setPopoverAnchor(null);
  }, []);

  const handleDeletePosition = useCallback(
    (positionId: string) => {
      if (!popoverShift) return;
      const filteredPositions = popoverShift.positions.filter((p) => p.id !== positionId);
      const updatedShift = { ...popoverShift, positions: mergeAdjacentPositions(filteredPositions) };
      setShifts((current) => current.map((s) => (s.id === popoverShift.id ? updatedShift : s)));
      if (updatedShift.positions.length === 0) {
        handlePopoverClose();
        return;
      }
      setPopoverShift(updatedShift);
    },
    [popoverShift, setShifts, handlePopoverClose],
  );

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
      />
      <Flex direction="column" minW={0} minH={0} overflow="hidden">
        <DayTitle date={selectedDate} holidays={holidays} />
        {isShopClosedDate ? (
          <Flex flex={1} minH={0} bg="gray.50" align="center" justify="center" direction="column" gap={2} px={6}>
            <Text fontSize="md" fontWeight="bold" color="gray.700">
              定休日
            </Text>
            <Text fontSize="sm" color="fg.muted" textAlign="center">
              この日はお店のお休みとして設定されているため、シフトは登録できません。
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
        isReadOnly={isReadOnly}
      />
    </Grid>
  );
};
