import { Box, Table, Text } from "@chakra-ui/react";
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
  timeAxisWidth: number;
  timeSlotsCount: number;
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
  paintClickAnchorRef: React.MutableRefObject<DOMRect | null>;
  onMouseUpOnRow: (staffId: string) => void;
};

export const StaffRow = ({
  staff,
  staffShifts,
  timeRange,
  timeAxisWidth,
  timeSlotsCount,
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
  // スタッフの提出状態を判定
  const getSubmissionStatus = () => {
    if (!staff.isSubmitted) return "not_submitted" as const;
    const hasRequest = staffShifts.some((s) => s.requestedTime !== null);
    if (hasRequest) return "has_request" as const;
    return "no_request" as const;
  };

  const status = getSubmissionStatus();

  return (
    <Table.Row
      _hover={{ bg: "gray.50" }}
      bg={isCurrentStaff ? "blue.50" : undefined}
      borderLeft={isCurrentStaff ? "3px solid" : undefined}
      borderLeftColor={isCurrentStaff ? "blue.400" : undefined}
    >
      <Table.Cell
        position="sticky"
        left={0}
        bg={isCurrentStaff ? "blue.50" : "white"}
        zIndex={5}
        borderRight="1px solid"
        borderColor="gray.100"
        whiteSpace="nowrap"
      >
        <Box
          cursor={isReadOnly ? "default" : "pointer"}
          _hover={isReadOnly ? undefined : { color: "teal.600" }}
          onClick={isReadOnly ? undefined : () => onStaffNameClick(staff.id)}
        >
          <Text fontWeight="medium">{staff.name}</Text>
          {status === "no_request" && (
            <Text color="gray.400" fontSize="xs">
              希望なし
            </Text>
          )}
          {status === "not_submitted" && (
            <Text color="orange.400" fontSize="xs">
              未提出
            </Text>
          )}
        </Box>
      </Table.Cell>
      <Table.Cell colSpan={timeSlotsCount} p={0} w={`${timeAxisWidth}px`}>
        <Box
          ref={rowRef}
          position="relative"
          height="50px"
          width={`${timeAxisWidth}px`}
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
          onMouseLeave={() => {
            // カーソルスタイルのリセットは親で処理
          }}
          cursor={cursorStyle}
          userSelect="none"
        >
          {/* グリッドライン（最背面） */}
          <GridLines timeRange={timeRange} />

          {/* シフトバー */}
          {staffShifts.map((shift) => (
            <ShiftBar
              key={shift.id}
              shift={shift}
              timeRange={timeRange}
              onHover={() => {}}
              onClick={onShiftClick}
              isDragging={isDragging}
              currentMinutes={dragState.currentMinutes}
              linkedTarget={dragState.targetShiftId === shift.id ? dragState.linkedTarget : null}
            />
          ))}

          {/* ドラッグプレビュー */}
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
      </Table.Cell>
    </Table.Row>
  );
};
