import { Flex } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { useDateStatuses } from "../../hooks/useDateStatuses";
import { selectedDateAtom, shiftConfigAtom, shiftsAtom } from "../../stores";
import type { ShiftData } from "../../types";
import { mergeAdjacentPositions } from "../../utils/shiftOperations";
import { DateTabs } from "./DateTabs";
import { ShiftGrid } from "./ShiftGrid";
import { ShiftPopover } from "./ShiftPopover";

export const DailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setShifts = useSetAtom(shiftsAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);

  const { dates, isReadOnly, holidays } = config;
  const dateStatuses = useDateStatuses();

  // === ポップオーバー状態 ===
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

  // ポジション個別削除
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

  // paintクリック時のポップオーバー表示
  const handlePaintClickPopover = useCallback((shift: ShiftData, anchorRect: DOMRect) => {
    setPopoverShift(shift);
    setPopoverAnchor(anchorRect);
  }, []);

  return (
    <Flex direction="column" flex={1} minHeight={0}>
      {/* 日付タブ + シフト表 */}
      <Flex
        direction="column"
        flex={1}
        minHeight={0}
        border="1px solid"
        borderColor="gray.200"
        borderRadius="lg"
        overflow="hidden"
      >
        <DateTabs
          dates={dates}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          holidays={holidays}
          dateStatuses={dateStatuses}
        />
        <ShiftGrid
          onShiftClick={handleShiftClick}
          onStaffNameClick={() => {}}
          onPaintClickPopover={handlePaintClickPopover}
        />
      </Flex>

      {/* ポップオーバー */}
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
