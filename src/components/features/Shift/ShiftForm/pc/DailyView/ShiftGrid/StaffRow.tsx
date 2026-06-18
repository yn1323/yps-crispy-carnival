import { Box, Flex, Text } from "@chakra-ui/react";
import { type MutableRefObject, memo } from "react";
import type { DragMode, LinkedResizeTarget, ShiftData, StaffType, TimeRange } from "@/src/domains/shift/types";
import { Avatar, IssueDot, issueToneEmphasis, resolveIssueTone, StaffWarningIcon } from "../../../components";
import { DragPreview } from "./DragPreview";
import { GridLines } from "./GridLines";
import { NonEditableTimeOverlay } from "./NonEditableTimeOverlay";
import { ShiftBar } from "./ShiftBar";

type DragPreviewState = {
  mode: DragMode;
  startMinutes: number;
  currentMinutes: number;
  positionColor: string | null;
} | null;

type StaffRowProps = {
  staff: StaffType;
  shift: ShiftData | undefined;
  timeRange: TimeRange;
  staffColWidth: number;
  isCurrentStaff: boolean;
  isReadOnly: boolean;
  onRowMouseDown: (e: React.MouseEvent<HTMLDivElement>, staffId: string) => void;
  onRowMouseMoveForCursor: (e: React.MouseEvent<HTMLDivElement>, staffId: string) => void;
  onShiftClick: (shiftId: string, positionId: string | null, e: React.MouseEvent) => void;
  onStaffNameClick: (staffId: string) => void;
  dragPreview: DragPreviewState;
  isDragging: boolean;
  cursorStyle: string;
  resizeCurrentMinutes?: number;
  linkedTarget: LinkedResizeTarget | null;
  paintClickAnchorRef: MutableRefObject<DOMRect | null>;
  onMouseUpOnRow: (staffId: string) => void;
  dataTour?: string;
  hasError?: boolean;
  warningMessages?: string[];
};

const noopHover = () => {};

export const StaffRow = memo(function StaffRow({
  staff,
  shift,
  timeRange,
  staffColWidth,
  isCurrentStaff,
  isReadOnly,
  onRowMouseDown,
  onRowMouseMoveForCursor,
  onShiftClick,
  onStaffNameClick,
  dragPreview,
  isDragging,
  cursorStyle,
  resizeCurrentMinutes,
  linkedTarget,
  paintClickAnchorRef,
  onMouseUpOnRow,
  dataTour,
  hasError = false,
  warningMessages = [],
}: StaffRowProps) {
  const tone = resolveIssueTone(hasError, false);
  const emphasis = issueToneEmphasis(tone);
  const getStatus = () => {
    if (!staff.isSubmitted) return "not_submitted" as const;
    const hasRequest = shift ? shift.requestedTime !== null || (shift.requestedTimes?.length ?? 0) > 0 : false;
    if (hasRequest) return "has_request" as const;
    return "no_request" as const;
  };

  const status = getStatus();

  const bg = isCurrentStaff ? "blue.50" : "white";

  return (
    <Flex
      borderBottomWidth="1px"
      borderColor="gray.100"
      _hover={{ bg: isCurrentStaff ? "blue.50" : "gray.50" }}
      data-tour={dataTour}
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
        {tone && <IssueDot tone={tone} />}
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
          <Text textStyle="sm" fontWeight={500} color={status === "not_submitted" ? "gray.500" : "gray.800"} truncate>
            {staff.name}
          </Text>
          <Flex align="center" gap={1} ml="auto" flexShrink={0}>
            {!isReadOnly && status === "no_request" && (
              <Text color="gray.400" textStyle="2xs" fontWeight={600}>
                休み希望
              </Text>
            )}
            {!isReadOnly && status === "not_submitted" && (
              <Text textStyle="2xs" fontWeight={600} style={{ color: "#b45309" }}>
                未提出
              </Text>
            )}
            <StaffWarningIcon messages={warningMessages} />
          </Flex>
        </Flex>
      </Flex>
      <Box
        position="relative"
        height="40px"
        flex={1}
        minW={0}
        bg={emphasis?.bg ?? "transparent"}
        boxShadow={emphasis ? `inset 0 0 0 2px var(--chakra-colors-${emphasis.borderColorToken})` : undefined}
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
        <NonEditableTimeOverlay timeRange={timeRange} />
        <GridLines timeRange={timeRange} />

        {shift && (
          <ShiftBar
            key={shift.id}
            shift={shift}
            timeRange={timeRange}
            onHover={noopHover}
            onClick={onShiftClick}
            isDragging={isDragging}
            isReadOnly={isReadOnly}
            currentMinutes={resizeCurrentMinutes}
            linkedTarget={linkedTarget}
          />
        )}

        {dragPreview && (
          <DragPreview
            mode={dragPreview.mode}
            startMinutes={dragPreview.startMinutes}
            currentMinutes={dragPreview.currentMinutes}
            timeRange={timeRange}
            positionColor={dragPreview.positionColor}
          />
        )}
      </Box>
    </Flex>
  );
});
