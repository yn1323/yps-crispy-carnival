import { Box, Text, VStack } from "@chakra-ui/react";
import { Dialog } from "@/src/components/ui/Dialog";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { BREAK_POSITION } from "../../constants";

type ShiftDetailSheetProps = {
  staff: StaffType;
  shift: ShiftData | undefined;
  selectedDate: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
};

export const ShiftDetailSheet = ({ staff, shift, selectedDate, isOpen, onOpenChange }: ShiftDetailSheetProps) => {
  const dateLabel = formatDateWithWeekday(selectedDate);

  const visibleSegments = shift?.positions.filter((p) => p.positionName !== BREAK_POSITION.name) ?? [];

  return (
    <Dialog title={`${staff.name}のシフト  ${dateLabel}`} isOpen={isOpen} onOpenChange={onOpenChange} hideFooter>
      <VStack gap={4} align="stretch">
        {visibleSegments.length > 0 && (
          <Box>
            <Text fontSize="xs" fontWeight="bold" color="gray.600" mb={2}>
              シフト時間
            </Text>
            <VStack gap={2} align="stretch">
              {visibleSegments.map((seg) => (
                <Text key={seg.id} fontSize="sm" color="gray.700">
                  {seg.start} - {seg.end}
                </Text>
              ))}
            </VStack>
          </Box>
        )}

        {visibleSegments.length === 0 && (
          <Text fontSize="sm" color="gray.400" textAlign="center" py={4}>
            シフト未設定
          </Text>
        )}
      </VStack>
    </Dialog>
  );
};
