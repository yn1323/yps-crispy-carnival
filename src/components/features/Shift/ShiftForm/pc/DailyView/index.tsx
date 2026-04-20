import { Box, Flex } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { selectedDateAtom, shiftConfigAtom, shiftsAtom } from "../../stores";
import type { ShiftData } from "../../types";
import { mergeAdjacentPositions } from "../../utils/shiftOperations";
import { DateRail } from "./DateRail";
import { DayTitle } from "./DayTitle";
import { ShiftGrid } from "./ShiftGrid";
import { ShiftPopover } from "./ShiftPopover";

export const DailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setShifts = useSetAtom(shiftsAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);

  const { dates, isReadOnly, holidays } = config;

  const [popoverShift, setPopoverShift] = useState<ShiftData | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);

  const handleShiftClick = useCallback(
    (shiftId: string, _positionId: string | null, e: React.MouseEvent) => {
      const shift = shifts.find((s) => s.id === shiftId);
      if (shift) {
        setPopoverShift(shift);
        setPopoverAnchor(e.currentTarget.getBoundingClientRect());
      }
    },
    [shifts],
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
      const newShifts = shifts.map((s) => (s.id === popoverShift.id ? updatedShift : s));
      setShifts(newShifts);
      if (updatedShift.positions.length === 0) {
        handlePopoverClose();
        return;
      }
      setPopoverShift(updatedShift);
    },
    [popoverShift, shifts, setShifts, handlePopoverClose],
  );

  const handlePaintClickPopover = useCallback((shift: ShiftData, anchorRect: DOMRect) => {
    setPopoverShift(shift);
    setPopoverAnchor(anchorRect);
  }, []);

  return (
    <Flex flex={1} minH={0}>
      <DateRail dates={dates} selectedDate={selectedDate} onSelect={setSelectedDate} holidays={holidays} />
      <Flex direction="column" flex={1} minW={0} minH={0}>
        <DayTitle date={selectedDate} holidays={holidays} />
        <Box flex={1} minH={0}>
          <ShiftGrid
            onShiftClick={handleShiftClick}
            onStaffNameClick={() => {}}
            onPaintClickPopover={handlePaintClickPopover}
          />
        </Box>
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
    </Flex>
  );
};
