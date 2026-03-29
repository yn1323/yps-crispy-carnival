import { Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { LuTriangleAlert } from "react-icons/lu";
import { BREAK_POSITION } from "../../constants";
import type { ShiftData, StaffType, TimeRange } from "../../types";
import { MiniShiftBar } from "./MiniShiftBar";

type StaffCardProps = {
  staff: StaffType;
  shift: ShiftData | undefined;
  timeRange: TimeRange;
  onCardTap: () => void;
  isHighlighted?: boolean;
};

export const StaffCard = ({ staff, shift, timeRange, onCardTap, isHighlighted = false }: StaffCardProps) => {
  const isUnsubmitted = !staff.isSubmitted;
  const hasPositions = shift && shift.positions.length > 0;
  const hasRequest = shift?.requestedTime !== null && shift?.requestedTime !== undefined;

  // 希望時間テキスト
  const requestLabel = (() => {
    if (isUnsubmitted) return "未提出";
    if (!hasRequest) return "希望なし";
    return `希望 ${shift?.requestedTime?.start}-${shift?.requestedTime?.end}`;
  })();

  // 休憩を除いたポジションセグメント
  const visibleSegments = shift?.positions.filter((p) => p.positionName !== BREAK_POSITION.name) ?? [];

  // ハイライト優先、次に未提出
  const cardBg = isHighlighted ? "blue.50" : isUnsubmitted ? "red.50" : "white";
  const cardBorderColor = isHighlighted ? "blue.400" : isUnsubmitted ? "red.200" : "gray.200";

  return (
    <Box
      borderWidth="1px"
      borderColor={cardBorderColor}
      borderRadius="md"
      bg={cardBg}
      borderLeft={isHighlighted ? "3px solid" : undefined}
      borderLeftColor={isHighlighted ? "blue.400" : undefined}
      p={3}
      cursor="pointer"
      onClick={onCardTap}
      _active={{ bg: isHighlighted ? "blue.100" : isUnsubmitted ? "red.100" : "gray.50" }}
      transition="background 0.15s ease"
    >
      {/* 上段: スタッフ名 + 希望時間 */}
      <Flex justify="space-between" align="center" mb={2}>
        <Flex align="center" gap={1}>
          {isUnsubmitted && <Icon as={LuTriangleAlert} color="red.500" boxSize={4} />}
          <Text fontSize="sm" fontWeight="bold" color={isUnsubmitted ? "red.700" : "gray.800"}>
            {staff.name}
          </Text>
        </Flex>
        <Text fontSize="xs" color={isUnsubmitted ? "red.500" : "gray.500"}>
          {requestLabel}
        </Text>
      </Flex>

      {/* 下段: ミニバー + ポジションテキスト or メッセージ */}
      {hasPositions ? (
        <VStack gap={1} align="stretch">
          <MiniShiftBar positions={shift?.positions ?? []} timeRange={timeRange} />
          {/* 時間テキスト */}
          <Flex gap={3} flexWrap="wrap">
            {visibleSegments.map((seg) => (
              <Text key={seg.id} fontSize="2xs" color="gray.600">
                {seg.start}-{seg.end}
              </Text>
            ))}
          </Flex>
        </VStack>
      ) : (
        <Box h="20px" display="flex" alignItems="center" justifyContent="center">
          <Text fontSize="xs" color="gray.400">
            {isUnsubmitted ? "シフト希望なし" : hasRequest ? "シフト未設定" : "希望なし"}
          </Text>
        </Box>
      )}
    </Box>
  );
};
