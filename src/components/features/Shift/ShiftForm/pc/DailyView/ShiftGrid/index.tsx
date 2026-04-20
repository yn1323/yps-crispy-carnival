import { Box, Flex } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TIME_AXIS_PADDING_PX } from "../../../constants";
import { hourWidthAtom, selectedDateAtom, shiftConfigAtom, shiftsAtom, sortedStaffsAtom } from "../../../stores";
import type { ShiftData, StaffType } from "../../../types";
import { useDrag } from "../hooks/useDrag";
import { TimeHeader } from "../TimeHeader";
import { StaffRow } from "./StaffRow";

const STAFF_COL_WIDTH = 200;

type ShiftGridProps = {
  onShiftClick: (shiftId: string, positionId: string | null, e: React.MouseEvent) => void;
  onStaffNameClick: (staffId: string) => void;
  onPaintClickPopover: (shift: ShiftData, anchorRect: DOMRect) => void;
};

export const ShiftGrid = ({ onShiftClick, onStaffNameClick, onPaintClickPopover }: ShiftGridProps) => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const sortedStaffs = useAtomValue(sortedStaffsAtom);
  const setHourWidth = useSetAtom(hourWidthAtom);
  const { timeRange, isReadOnly, currentStaffId } = config;

  const { dragState, isDragging, handleMouseDown, handleMouseMove, handleMouseUp, getCursor } = useDrag();

  const rowContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragRowRectRef = useRef<DOMRect | null>(null);
  const paintClickAnchorRef = useRef<DOMRect | null>(null);
  const timelineMeasureRef = useRef<HTMLDivElement | null>(null);

  // タイムラインコンテナ幅に応じて hourWidth を動的計算
  useLayoutEffect(() => {
    const el = timelineMeasureRef.current;
    if (!el) return;
    const totalHours = timeRange.end - timeRange.start;
    if (totalHours <= 0) return;
    const update = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      const hw = Math.max(20, (width - TIME_AXIS_PADDING_PX * 2) / totalHours);
      setHourWidth(hw);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [timeRange.start, timeRange.end, setHourWidth]);

  const getShiftsForStaff = useCallback(
    (staffId: string) => shifts.filter((s) => s.staffId === staffId && s.date === selectedDate),
    [shifts, selectedDate],
  );

  const [cursorStyles, setCursorStyles] = useState<Record<string, string>>({});

  const handleRowMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, staffId: string) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const dragStarted = handleMouseDown(e, staffId, rect);
      if (dragStarted) {
        dragRowRectRef.current = rect;
      }
    },
    [handleMouseDown],
  );

  const handleRowMouseMoveForCursor = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, staffId: string) => {
      if (!isDragging) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const cursor = getCursor(staffId, x);
        setCursorStyles((prev) => ({ ...prev, [staffId]: cursor }));
      }
    },
    [getCursor, isDragging],
  );

  const handleMouseUpOnRow = useCallback(
    (_staffId: string) => {
      if (
        dragState.mode === "paint" &&
        dragState.targetShiftId &&
        Math.abs(dragState.currentMinutes - dragState.startMinutes) < timeRange.unit
      ) {
        const targetShift = shifts.find((s) => s.id === dragState.targetShiftId);
        if (targetShift) {
          const minutes = dragState.startMinutes;
          const hasExistingPosition = targetShift.positions.some((pos) => {
            const [sh, sm] = pos.start.split(":").map(Number);
            const [eh, em] = pos.end.split(":").map(Number);
            return minutes >= sh * 60 + sm && minutes < eh * 60 + em;
          });
          if (hasExistingPosition && paintClickAnchorRef.current) {
            onPaintClickPopover(targetShift, paintClickAnchorRef.current);
          }
        }
      }
    },
    [dragState, shifts, timeRange.unit, onPaintClickPopover],
  );

  useEffect(() => {
    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (isDragging && dragRowRectRef.current) {
        handleMouseMove(e as unknown as React.MouseEvent<HTMLDivElement>, dragRowRectRef.current);
      }
    };
    const handleDocumentMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
        dragRowRectRef.current = null;
      }
    };
    if (isDragging) {
      document.addEventListener("mousemove", handleDocumentMouseMove);
      document.addEventListener("mouseup", handleDocumentMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleDocumentMouseMove);
      document.removeEventListener("mouseup", handleDocumentMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <Flex direction="column" h="100%" minH={0} bg="gray.50">
      <Box flex={1} minH={0} overflowY="auto" overflowX="hidden">
        <Box w="100%">
          {/* Sticky header */}
          <Flex
            position="sticky"
            top={0}
            zIndex={10}
            bg="white"
            borderBottomWidth="1px"
            borderColor="gray.200"
            boxShadow="0 2px 4px rgba(0,0,0,0.04)"
          >
            <Box w={`${STAFF_COL_WIDTH}px`} flexShrink={0} bg="white" />
            <Box flex={1} minW={0} ref={timelineMeasureRef}>
              <TimeHeader timeRange={timeRange} />
            </Box>
          </Flex>
          {/* Rows */}
          {sortedStaffs.map((staff: StaffType) => {
            const staffShifts = getShiftsForStaff(staff.id);
            return (
              <StaffRow
                key={staff.id}
                staff={staff}
                staffShifts={staffShifts}
                timeRange={timeRange}
                staffColWidth={STAFF_COL_WIDTH}
                isCurrentStaff={staff.id === currentStaffId}
                isReadOnly={isReadOnly}
                onRowMouseDown={handleRowMouseDown}
                onRowMouseMoveForCursor={handleRowMouseMoveForCursor}
                onShiftClick={onShiftClick}
                onStaffNameClick={onStaffNameClick}
                dragState={dragState}
                isDragging={isDragging}
                cursorStyle={cursorStyles[staff.id] ?? "default"}
                rowRef={(el: HTMLDivElement | null) => {
                  rowContainerRefs.current[staff.id] = el;
                }}
                paintClickAnchorRef={paintClickAnchorRef}
                onMouseUpOnRow={handleMouseUpOnRow}
              />
            );
          })}
        </Box>
      </Box>
    </Flex>
  );
};
