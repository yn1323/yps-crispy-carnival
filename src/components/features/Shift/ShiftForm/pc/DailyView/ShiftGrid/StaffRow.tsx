import { Box, Flex, Text } from "@chakra-ui/react";
import type { MutableRefObject } from "react";
import { Avatar } from "../../../components";
import type { DragMode, LinkedResizeTarget, ShiftData, StaffType, TimeRange } from "../../../types";
import { DragPreview } from "./DragPreview";
import { GridLines } from "./GridLines";
import { ShiftBar } from "./ShiftBar";

type DragState = {
  mode: DragMode;
  staffId: string | null;
  startMinutes: number;
  currentMinutes: number;
  targetShiftId: string | null;
  positionColor: string | null;
  linkedTarget: LinkedResizeTarget | null;
};

type StaffRowProps = {
  staff: StaffType;
  staffShifts: ShiftData[];
  timeRange: TimeRange;
  staffColWidth: number;
  isCurrentStaff: boolean;
  isReadOnly: boolean;
  onRowMouseDown: (e: React.MouseEvent<HTMLDivElement>, staffId: string) => void;
  onRowMouseMoveForCursor: (e: React.MouseEvent<HTMLDivElement>, staffId: string) => void;
  onShiftClick: (shiftId: string, positionId: string | null, e: React.MouseEvent) => void;
  onStaffNameClick: (staffId: string) => void;
  dragState: DragState;
  isDragging: boolean;
  cursorStyle: string;
  rowRef: (el: HTMLDivElement | null) => void;
  paintClickAnchorRef: MutableRefObject<DOMRect | null>;
  onMouseUpOnRow: (staffId: string) => void;
};

export const StaffRow = ({
  staff,
  staffShifts,
  timeRange,
  staffColWidth,
  isCurrentStaff,
  isReadOnly,
  onRowMouseDown,
  onRowMouseMoveForCursor,
  onShiftClick,
  onStaffNameClick,
  dragState,
  isDragging,
  cursorStyle,
  rowRef,
  paintClickAnchorRef,
  onMouseUpOnRow,
}: StaffRowProps) => {
  const getStatus = () => {
    if (!staff.isSubmitted) return "not_submitted" as const;
    const hasRequest = staffShifts.some((s) => s.requestedTime !== null);
    if (hasRequest) return "has_request" as const;
    return "no_request" as const;
  };

  const status = getStatus();

  const bg = isCurrentStaff ? "blue.50" : "white";

  return (
    <Flex
      borderBottomWidth="1px"
      borderColor="gray.100"
      _last={{ borderBottomWidth: 0 }}
      _hover={{ bg: isCurrentStaff ? "blue.50" : "gray.50" }}
    >
      <Flex
        w={`${staffColWidth}px`}
        flexShrink={0}
        position="sticky"
        left={0}
        bg={bg}
        zIndex={5}
        borderRightWidth="1px"
        borderColor="gray.100"
        borderLeftWidth={isCurrentStaff ? "3px" : 0}
        borderLeftColor="blue.400"
        px={3}
        py={2}
        align="center"
        gap={2}
        whiteSpace="nowrap"
      >
        <Avatar staff={staff} size={24} />
        <Flex
          align="center"
          gap={2}
          minW={0}
          flex={1}
          cursor={isReadOnly ? "default" : "pointer"}
          _hover={isReadOnly ? undefined : { color: "teal.600" }}
          onClick={isReadOnly ? undefined : () => onStaffNameClick(staff.id)}
        >
          <Text fontSize="13px" fontWeight={500} color={status === "not_submitted" ? "gray.500" : "gray.800"} truncate>
            {staff.name}
          </Text>
          {!isReadOnly && status === "no_request" && (
            <Text color="gray.400" fontSize="10px" fontWeight={600} flexShrink={0}>
              休み希望
            </Text>
          )}
          {!isReadOnly && status === "not_submitted" && (
            <Text fontSize="10px" fontWeight={600} flexShrink={0} style={{ color: "#b45309" }}>
              未提出
            </Text>
          )}
        </Flex>
      </Flex>
      <Box
        ref={rowRef}
        position="relative"
        height="40px"
        flex={1}
        minW={0}
        bg="transparent"
        overflow="hidden"
        onMouseDown={
          isReadOnly
            ? undefined
            : (e) => {
                paintClickAnchorRef.current = (e.target as HTMLElement).getBoundingClientRect();
                onRowMouseDown(e, staff.id);
              }
        }
        onMouseMove={isReadOnly ? undefined : (e) => onRowMouseMoveForCursor(e, staff.id)}
        onMouseUp={isReadOnly ? undefined : () => onMouseUpOnRow(staff.id)}
        cursor={cursorStyle}
        userSelect="none"
      >
        <GridLines timeRange={timeRange} />

        {staffShifts.map((shift) => (
          <ShiftBar
            key={shift.id}
            shift={shift}
            timeRange={timeRange}
            onHover={() => {}}
            onClick={onShiftClick}
            isDragging={isDragging}
            isReadOnly={isReadOnly}
            currentMinutes={dragState.currentMinutes}
            linkedTarget={dragState.targetShiftId === shift.id ? dragState.linkedTarget : null}
          />
        ))}

        {isDragging &&
          dragState.staffId === staff.id &&
          dragState.mode !== "position-resize-start" &&
          dragState.mode !== "position-resize-end" && (
            <DragPreview
              mode={dragState.mode}
              startMinutes={dragState.startMinutes}
              currentMinutes={dragState.currentMinutes}
              timeRange={timeRange}
              positionColor={dragState.positionColor}
            />
          )}
      </Box>
    </Flex>
  );
};
