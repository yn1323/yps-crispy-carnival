import { Box, IconButton, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuX } from "react-icons/lu";
import type { ShiftData, TimeRange } from "./types";

type ShiftBarProps = {
  shift: ShiftData;
  timeRange: TimeRange;
  onHover: (shiftId: string | null) => void;
  onClick: (shiftId: string, e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, shiftId: string) => void;
  onDelete: (shiftId: string) => void;
  isDragging?: boolean;
};

// 時刻をパーセント位置に変換
const getPositionPercent = (time: string, timeRange: TimeRange) => {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = (hours - timeRange.start) * 60 + minutes;
  const totalRangeMinutes = (timeRange.end - timeRange.start) * 60;
  return (totalMinutes / totalRangeMinutes) * 100;
};

export const ShiftBar = ({
  shift,
  timeRange,
  onHover,
  onClick,
  onContextMenu,
  onDelete,
  isDragging = false,
}: ShiftBarProps) => {
  const [isHovered, setIsHovered] = useState(false);

  if (!shift.workingTime) return null;

  const barLeft = getPositionPercent(shift.workingTime.start, timeRange);
  const barRight = getPositionPercent(shift.workingTime.end, timeRange);
  const barWidth = barRight - barLeft;

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHover(shift.id);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHover(null);
  };

  return (
    <Box
      position="absolute"
      left={`${barLeft}%`}
      width={`${barWidth}%`}
      height="100%"
      top={0}
      pointerEvents={isDragging ? "none" : "auto"}
    >
      {/* 労働時間バー（グレー、細い） */}
      <Box
        position="absolute"
        left={0}
        right={0}
        height="16px"
        bg="gray.300"
        borderRadius="md"
        top="50%"
        transform="translateY(-50%)"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => onClick(shift.id, e)}
        onContextMenu={(e) => onContextMenu(e, shift.id)}
        cursor="pointer"
        transition="all 0.15s"
        _hover={{ bg: "gray.400" }}
        zIndex={1}
      />

      {/* ポジション色バー（太い、縦にはみ出し） */}
      {shift.positions.map((pos) => {
        const posLeft = getPositionPercent(pos.start, timeRange);
        const posRight = getPositionPercent(pos.end, timeRange);
        // バー全体に対する相対位置を計算
        const relativeLeft = ((posLeft - barLeft) / barWidth) * 100;
        const relativeWidth = ((posRight - posLeft) / barWidth) * 100;

        return (
          <Box
            key={pos.id}
            position="absolute"
            left={`${relativeLeft}%`}
            width={`${relativeWidth}%`}
            height="28px"
            bg={pos.color}
            borderRadius="md"
            top="50%"
            transform="translateY(-50%)"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => onClick(shift.id, e)}
            onContextMenu={(e) => onContextMenu(e, shift.id)}
            cursor="inherit"
            transition="all 0.15s"
            opacity={0.9}
            _hover={{ opacity: 1 }}
            zIndex={2}
          />
        );
      })}

      {/* 時刻ラベル */}
      <Text
        position="absolute"
        left="4px"
        top="50%"
        transform="translateY(-50%)"
        fontSize="xs"
        color="gray.700"
        fontWeight="medium"
        zIndex={3}
        pointerEvents="none"
        textShadow="0 0 2px white, 0 0 2px white"
      >
        {shift.workingTime.start}
      </Text>
      <Text
        position="absolute"
        right="4px"
        top="50%"
        transform="translateY(-50%)"
        fontSize="xs"
        color="gray.700"
        fontWeight="medium"
        zIndex={3}
        pointerEvents="none"
        textShadow="0 0 2px white, 0 0 2px white"
      >
        {shift.workingTime.end}
      </Text>

      {/* ホバー時のXボタン */}
      {isHovered && (
        <IconButton
          position="absolute"
          right="-10px"
          top="-10px"
          size="xs"
          colorPalette="red"
          borderRadius="full"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(shift.id);
          }}
          onMouseEnter={handleMouseEnter}
          aria-label="シフトを削除"
          zIndex={10}
        >
          <LuX />
        </IconButton>
      )}
    </Box>
  );
};
