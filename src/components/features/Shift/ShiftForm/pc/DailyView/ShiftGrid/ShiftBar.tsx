import { Box, Text } from "@chakra-ui/react";
import type { LinkedResizeTarget, ShiftData, TimeRange } from "../../../types";
import { computeVisualBreaks } from "../../../utils/shiftOperations";
import { minutesToPixel, timeToMinutes } from "../../../utils/timeConversion";

type ShiftBarProps = {
  shift: ShiftData;
  timeRange: TimeRange;
  onHover: (shiftId: string | null) => void;
  onClick: (shiftId: string, positionId: string | null, e: React.MouseEvent) => void;
  isDragging?: boolean;
  // リサイズ中のリアルタイム更新用
  currentMinutes?: number;
  // 連結リサイズ対応
  linkedTarget?: LinkedResizeTarget | null;
};

export const ShiftBar = ({
  shift,
  timeRange,
  onHover,
  onClick,
  isDragging = false,
  currentMinutes,
  linkedTarget,
}: ShiftBarProps) => {
  const hasRequestedTime = shift.requestedTime !== null;

  // ポジションがなくて希望時間もない場合は何も表示しない
  if (!hasRequestedTime && shift.positions.length === 0) return null;

  // 希望時間がある場合のバー位置計算（固定幅ベース）
  let barLeft = 0;
  let barWidth = 0;
  if (shift.requestedTime) {
    const startMinutes = timeToMinutes(shift.requestedTime.start);
    const endMinutes = timeToMinutes(shift.requestedTime.end);
    barLeft = minutesToPixel(startMinutes, timeRange);
    const barRight = minutesToPixel(endMinutes, timeRange);
    barWidth = barRight - barLeft;
  } else {
    // 希望時間がない場合は時間軸全体
    const startMinutes = timeRange.start * 60;
    const endMinutes = timeRange.end * 60;
    barLeft = minutesToPixel(startMinutes, timeRange);
    const barRight = minutesToPixel(endMinutes, timeRange);
    barWidth = barRight - barLeft;
  }

  const handleMouseEnter = () => {
    onHover(shift.id);
  };

  const handleMouseLeave = () => {
    onHover(null);
  };

  return (
    <Box
      position="absolute"
      left={`${barLeft}px`}
      width={`${barWidth}px`}
      height="100%"
      top={0}
      pointerEvents={isDragging ? "none" : "auto"}
    >
      {/* 希望シフトバー（グレー点線、太い） - 編集不可、希望時間がある場合のみ表示 */}
      {hasRequestedTime && (
        <Box
          position="absolute"
          left={0}
          right={0}
          height="28px"
          bg="transparent"
          border="2px dashed"
          borderColor="gray.400"
          borderRadius="md"
          top="50%"
          transform="translateY(-50%)"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => onClick(shift.id, null, e)}
          cursor="pointer"
          transition="all 0.15s"
          _hover={{ borderColor: "gray.500" }}
          zIndex={1}
        />
      )}

      {/* ポジション色バー（細い、希望シフトの上に重なる） */}
      {(() => {
        // ポジションを時間順にソート
        const sortedPositions = [...shift.positions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

        return sortedPositions.map((pos, index) => {
          // リサイズ中の対象ポジションは動的に位置を計算（連結リサイズ対応）
          const isResizingPrev = linkedTarget?.prevPosition?.positionId === pos.id && currentMinutes !== undefined;
          const isResizingNext = linkedTarget?.nextPosition?.positionId === pos.id && currentMinutes !== undefined;
          const isResizing = isResizingPrev || isResizingNext;

          let posStartMinutes = timeToMinutes(pos.start);
          let posEndMinutes = timeToMinutes(pos.end);

          // prevPosition（前のバー）のendを更新
          if (isResizingPrev && currentMinutes !== undefined) {
            posEndMinutes = currentMinutes;
          }
          // nextPosition（後のバー）のstartを更新
          if (isResizingNext && currentMinutes !== undefined) {
            posStartMinutes = currentMinutes;
          }

          // UNIT未満になったバーは非表示（上書きプレビュー）
          if (isResizing && posEndMinutes - posStartMinutes < timeRange.unit) {
            return null;
          }

          // 固定幅ベースでピクセル位置を計算
          const posLeftPx = minutesToPixel(posStartMinutes, timeRange);
          const posRightPx = minutesToPixel(posEndMinutes, timeRange);
          // バー全体に対する相対位置を計算
          const relativeLeft = posLeftPx - barLeft;
          const relativeWidth = posRightPx - posLeftPx;

          // 隣接判定: 前後のバーと連続しているか
          const isAdjacentToPrev = index > 0 && sortedPositions[index - 1].end === pos.start;
          const isAdjacentToNext = index < sortedPositions.length - 1 && pos.end === sortedPositions[index + 1].start;

          // Chakra UI用の角丸プロパティを返す関数
          const getBorderRadiusProps = () => {
            if (!isAdjacentToPrev && !isAdjacentToNext) {
              return { borderRadius: "md" }; // 孤立: 両端丸
            }
            if (!isAdjacentToPrev) {
              // 左端: 左のみ丸
              return {
                borderTopLeftRadius: "md",
                borderBottomLeftRadius: "md",
                borderTopRightRadius: "0",
                borderBottomRightRadius: "0",
              };
            }
            if (!isAdjacentToNext) {
              // 右端: 右のみ丸
              return {
                borderTopLeftRadius: "0",
                borderBottomLeftRadius: "0",
                borderTopRightRadius: "md",
                borderBottomRightRadius: "md",
              };
            }
            return { borderRadius: "0" }; // 中間: 角なし
          };

          return (
            <Box
              key={pos.id}
              position="absolute"
              left={`${relativeLeft}px`}
              width={`${relativeWidth}px`}
              height="20px"
              bg={pos.color}
              {...getBorderRadiusProps()}
              top="50%"
              transform="translateY(-50%)"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onClick={(e) => onClick(shift.id, pos.id, e)}
              cursor="inherit"
              transition={isResizing ? "width 0.05s ease-out, left 0.05s ease-out" : "all 0.15s"}
              opacity={0.9}
              _hover={{ opacity: 1 }}
              zIndex={2}
            />
          );
        });
      })()}

      {/* ビジュアル休憩バー（ポジション間のギャップをストライプ表示） */}
      {shift.positions.length >= 2 &&
        !linkedTarget &&
        computeVisualBreaks(shift.positions).map((gap) => {
          const gapStartPx = minutesToPixel(timeToMinutes(gap.start), timeRange);
          const gapEndPx = minutesToPixel(timeToMinutes(gap.end), timeRange);
          const relativeLeft = gapStartPx - barLeft;
          const relativeWidth = gapEndPx - gapStartPx;

          return (
            <Box
              key={`break-${gap.start}-${gap.end}`}
              position="absolute"
              left={`${relativeLeft}px`}
              width={`${relativeWidth}px`}
              height="20px"
              backgroundImage="repeating-linear-gradient(45deg, #9CA3AF, #9CA3AF 4px, transparent 4px, transparent 8px)"
              borderRadius="0"
              top="50%"
              transform="translateY(-50%)"
              opacity={0.5}
              pointerEvents="none"
              zIndex={2}
            />
          );
        })}

      {/* 時刻ラベル（ポジションがある場合のみ表示、リサイズ中は非表示） */}
      {shift.positions.length > 0 &&
        !linkedTarget &&
        (() => {
          // ポジション群の最小開始時刻・最大終了時刻を計算
          const positionTimes = shift.positions.map((pos) => ({
            start: pos.start,
            end: pos.end,
          }));
          const earliestStart = positionTimes.reduce(
            (min, t) => (t.start < min ? t.start : min),
            positionTimes[0].start,
          );
          const latestEnd = positionTimes.reduce((max, t) => (t.end > max ? t.end : max), positionTimes[0].end);
          // ポジション全体の位置を計算（固定幅ベース）
          const posStartPx = minutesToPixel(timeToMinutes(earliestStart), timeRange);
          const posEndPx = minutesToPixel(timeToMinutes(latestEnd), timeRange);
          const relativeStartLeft = posStartPx - barLeft;
          const relativeEndLeft = posEndPx - barLeft;

          return (
            <>
              <Text
                position="absolute"
                left={`${relativeStartLeft + 4}px`}
                top="50%"
                transform="translateY(-50%)"
                fontSize="xs"
                color="gray.600"
                fontWeight="medium"
                zIndex={3}
                pointerEvents="none"
                textShadow="0 0 2px white, 0 0 2px white"
              >
                {earliestStart}
              </Text>
              <Text
                position="absolute"
                left={`${relativeEndLeft - 4}px`}
                top="50%"
                transform="translate(-100%, -50%)"
                fontSize="xs"
                color="gray.600"
                fontWeight="medium"
                zIndex={3}
                pointerEvents="none"
                textShadow="0 0 2px white, 0 0 2px white"
              >
                {latestEnd}
              </Text>
            </>
          );
        })()}
    </Box>
  );
};
