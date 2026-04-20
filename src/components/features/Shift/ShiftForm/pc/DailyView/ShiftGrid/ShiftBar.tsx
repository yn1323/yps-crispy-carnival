import { Box, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { BREAK_POSITION } from "../../../constants";
import { hourWidthAtom } from "../../../stores";
import type { LinkedResizeTarget, PositionSegment, ShiftData, TimeRange } from "../../../types";
import { computeVisualBreaks } from "../../../utils/shiftOperations";
import { minutesToPixel, timeToMinutes } from "../../../utils/timeConversion";

type ShiftBarProps = {
  shift: ShiftData;
  timeRange: TimeRange;
  onHover: (shiftId: string | null) => void;
  onClick: (shiftId: string, positionId: string | null, e: React.MouseEvent) => void;
  isDragging?: boolean;
  isReadOnly?: boolean;
  currentMinutes?: number;
  linkedTarget?: LinkedResizeTarget | null;
};

const BAR_BG = "#0d9488"; // teal.600
const BAR_SHADOW = "0 1px 2px rgba(13,148,136,0.3)";
const STRIPE_STYLE = {
  backgroundImage: "repeating-linear-gradient(45deg, #9CA3AF, #9CA3AF 4px, transparent 4px, transparent 8px)",
};

const isBreakSegment = (pos: PositionSegment) =>
  pos.positionName === BREAK_POSITION.name || pos.positionId === BREAK_POSITION.id;

export const ShiftBar = ({
  shift,
  timeRange,
  onHover,
  onClick,
  isDragging = false,
  isReadOnly = false,
  currentMinutes,
  linkedTarget,
}: ShiftBarProps) => {
  const hourWidth = useAtomValue(hourWidthAtom);
  const hasRequestedTime = shift.requestedTime !== null;

  if (!hasRequestedTime && shift.positions.length === 0) return null;

  let barLeft = 0;
  let barWidth = 0;
  if (shift.requestedTime) {
    const startMinutes = timeToMinutes(shift.requestedTime.start);
    const endMinutes = timeToMinutes(shift.requestedTime.end);
    barLeft = minutesToPixel(startMinutes, timeRange, hourWidth);
    barWidth = minutesToPixel(endMinutes, timeRange, hourWidth) - barLeft;
  } else {
    const startMinutes = timeRange.start * 60;
    const endMinutes = timeRange.end * 60;
    barLeft = minutesToPixel(startMinutes, timeRange, hourWidth);
    barWidth = minutesToPixel(endMinutes, timeRange, hourWidth) - barLeft;
  }

  const handleMouseEnter = () => onHover(shift.id);
  const handleMouseLeave = () => onHover(null);

  const sortedAllPositions = [...shift.positions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const workPositions = sortedAllPositions.filter((p) => !isBreakSegment(p));
  const breakGaps = computeVisualBreaks(workPositions);
  const hasWork = workPositions.length > 0;

  return (
    <Box
      position="absolute"
      left={`${barLeft}px`}
      width={`${barWidth}px`}
      height="100%"
      top={0}
      pointerEvents={isDragging ? "none" : "auto"}
    >
      {/* 希望シフトバー（灰色の点線、「希望: HH:MM-HH:MM」ラベルを左寄せで表示） */}
      {!isReadOnly && hasRequestedTime && shift.requestedTime && (
        <Box
          position="absolute"
          left={0}
          right={0}
          height="28px"
          bg="gray.50"
          border="1.5px dashed"
          borderColor="gray.400"
          borderRadius="md"
          top="50%"
          transform="translateY(-50%)"
          pointerEvents="none"
          display="flex"
          alignItems="center"
          px="10px"
          zIndex={1}
        >
          <Text
            fontSize="10px"
            fontWeight={600}
            color="gray.500"
            whiteSpace="nowrap"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            希望: {shift.requestedTime.start}-{shift.requestedTime.end}
          </Text>
        </Box>
      )}

      {/* 勤務ポジション（teal） */}
      {workPositions.map((pos, index) => {
        const isResizingPrev = linkedTarget?.prevPosition?.positionId === pos.id && currentMinutes !== undefined;
        const isResizingNext = linkedTarget?.nextPosition?.positionId === pos.id && currentMinutes !== undefined;
        const isResizing = isResizingPrev || isResizingNext;

        let posStartMinutes = timeToMinutes(pos.start);
        let posEndMinutes = timeToMinutes(pos.end);

        if (isResizingPrev && currentMinutes !== undefined) posEndMinutes = currentMinutes;
        if (isResizingNext && currentMinutes !== undefined) posStartMinutes = currentMinutes;

        if (isResizing && posEndMinutes - posStartMinutes < timeRange.unit) return null;

        const posLeftPx = minutesToPixel(posStartMinutes, timeRange, hourWidth);
        const posRightPx = minutesToPixel(posEndMinutes, timeRange, hourWidth);
        const relativeLeft = posLeftPx - barLeft;
        const relativeWidth = posRightPx - posLeftPx;

        const isAdjacentToPrev = index > 0 && workPositions[index - 1].end === pos.start;
        const isAdjacentToNext = index < workPositions.length - 1 && pos.end === workPositions[index + 1].start;

        const getBorderRadiusProps = () => {
          if (!isAdjacentToPrev && !isAdjacentToNext) return { borderRadius: "md" };
          if (!isAdjacentToPrev) {
            return {
              borderTopLeftRadius: "md",
              borderBottomLeftRadius: "md",
              borderTopRightRadius: "0",
              borderBottomRightRadius: "0",
            };
          }
          if (!isAdjacentToNext) {
            return {
              borderTopLeftRadius: "0",
              borderBottomLeftRadius: "0",
              borderTopRightRadius: "md",
              borderBottomRightRadius: "md",
            };
          }
          return { borderRadius: "0" };
        };

        return (
          <Box
            key={pos.id}
            position="absolute"
            left={`${relativeLeft}px`}
            width={`${relativeWidth}px`}
            height="22px"
            bg={BAR_BG}
            boxShadow={BAR_SHADOW}
            {...getBorderRadiusProps()}
            top="50%"
            transform="translateY(-50%)"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => onClick(shift.id, pos.id, e)}
            cursor="inherit"
            transition={isResizing ? "width 0.05s ease-out, left 0.05s ease-out" : "all 0.15s"}
            _hover={{ filter: "brightness(1.05)" }}
            zIndex={2}
          />
        );
      })}

      {/* 休憩ストライプ（勤務ポジション間のギャップ、または break 位置セグメント） */}
      {hasWork &&
        !linkedTarget &&
        breakGaps.map((gap) => {
          const gapStartPx = minutesToPixel(timeToMinutes(gap.start), timeRange, hourWidth);
          const gapEndPx = minutesToPixel(timeToMinutes(gap.end), timeRange, hourWidth);
          const relativeLeft = gapStartPx - barLeft;
          const relativeWidth = gapEndPx - gapStartPx;

          return (
            <Box
              key={`break-${gap.start}-${gap.end}`}
              position="absolute"
              left={`${relativeLeft}px`}
              width={`${relativeWidth}px`}
              height="22px"
              borderRadius="0"
              top="50%"
              transform="translateY(-50%)"
              opacity={0.6}
              pointerEvents="none"
              zIndex={3}
              style={STRIPE_STYLE}
            />
          );
        })}

      {/* 勤務時刻ラベル（バーの左側に白文字、リサイズ中は非表示） */}
      {hasWork &&
        !linkedTarget &&
        (() => {
          const earliestStart = workPositions[0].start;
          const latestEnd = workPositions[workPositions.length - 1].end;
          const leftPx = minutesToPixel(timeToMinutes(earliestStart), timeRange, hourWidth) - barLeft;
          const rightPx = minutesToPixel(timeToMinutes(latestEnd), timeRange, hourWidth) - barLeft;
          return (
            <Box
              position="absolute"
              left={`${leftPx}px`}
              width={`${rightPx - leftPx}px`}
              top="50%"
              transform="translateY(-50%)"
              height="22px"
              display="flex"
              alignItems="center"
              justifyContent="flex-start"
              px="8px"
              pointerEvents="none"
              zIndex={4}
            >
              <Text
                fontSize="11px"
                fontWeight={600}
                color="white"
                style={{ fontVariantNumeric: "tabular-nums" }}
                whiteSpace="nowrap"
              >
                {earliestStart}–{latestEnd}
              </Text>
            </Box>
          );
        })()}
    </Box>
  );
};
