import { Badge, Box, Flex, Text, VStack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import type { ShiftData, StaffType } from "../../types";

type ShiftDetailSheetProps = {
  staff: StaffType;
  shift: ShiftData | undefined;
  selectedDate: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
};

export const ShiftDetailSheet = ({ staff, shift, selectedDate, isOpen, onOpenChange }: ShiftDetailSheetProps) => {
  const dateLabel = dayjs(selectedDate).format("M/D(ddd)");

  const requestLabel = shift?.requestedTime
    ? `希望: ${shift.requestedTime.start} - ${shift.requestedTime.end}`
    : "希望: なし";

  const visibleSegments = shift?.positions.filter((p) => p.positionName !== "休憩") ?? [];

  return (
    <BottomSheet title={`${staff.name}のシフト  ${dateLabel}`} isOpen={isOpen} onOpenChange={onOpenChange}>
      <VStack gap={4} align="stretch">
        <Flex align="center" gap={2}>
          <Text fontSize="sm" color="gray.600">
            {requestLabel}
          </Text>
          {!staff.isSubmitted && (
            <Badge colorPalette="orange" size="sm">
              未提出
            </Badge>
          )}
        </Flex>

        {visibleSegments.length > 0 && (
          <Box>
            <Text fontSize="xs" fontWeight="bold" color="gray.600" mb={2}>
              割当ポジション
            </Text>
            <VStack gap={2} align="stretch">
              {visibleSegments.map((seg) => (
                <Flex key={seg.id} align="center" gap={2}>
                  <Box w="12px" h="12px" borderRadius="sm" bg={seg.color} flexShrink={0} />
                  <Text fontSize="sm" flexShrink={0}>
                    {seg.positionName}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    {seg.start} - {seg.end}
                  </Text>
                </Flex>
              ))}
            </VStack>
          </Box>
        )}

        {visibleSegments.length === 0 && (
          <Text fontSize="sm" color="gray.400" textAlign="center" py={4}>
            ポジション未割当
          </Text>
        )}
      </VStack>
    </BottomSheet>
  );
};
