import { Box, Flex, Text, VStack } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { Dialog } from "@/src/components/ui/Dialog";
import { getEffectiveBreaks } from "@/src/domains/shift/breaks";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { isLegacyCompatibleWorkPosition } from "@/src/domains/shift/positions";
import { formatShiftClockTime, formatShiftClockTimeRange } from "@/src/domains/shift/time";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { PositionMark } from "../../detailParts";
import { detailModeAtom, usesPositionColorsAtom } from "../../stores";

type ShiftDetailSheetProps = {
  staff: StaffType;
  shift: ShiftData | undefined;
  selectedDate: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
};

export const ShiftDetailSheet = ({ staff, shift, selectedDate, isOpen, onOpenChange }: ShiftDetailSheetProps) => {
  const dateLabel = formatDateWithWeekday(selectedDate);

  const detailMode = useAtomValue(detailModeAtom);
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);

  const visibleSegments = shift?.positions.filter(isLegacyCompatibleWorkPosition) ?? [];
  // 休憩は、くわしく表示のときだけ出す。
  const breakLabels =
    detailMode && shift
      ? getEffectiveBreaks({ positions: visibleSegments, breaks: shift.breaks }, { clipToWork: true }).map((range) =>
          formatShiftClockTimeRange(range.start, range.end),
        )
      : [];

  return (
    <Dialog
      title={`${staff.name}のシフト  ${dateLabel}`}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={() => onOpenChange({ open: false })}
      closeLabel="閉じる"
    >
      <VStack gap={4} align="stretch">
        {visibleSegments.length > 0 && (
          <Box>
            <Text fontSize="xs" fontWeight="bold" color="gray.600" mb={2}>
              シフト時間
            </Text>
            <VStack gap={2} align="stretch">
              {visibleSegments.map((seg) =>
                usesPositionColors ? (
                  <Flex key={seg.id} align="center" gap={3} fontSize="sm" color="gray.700">
                    <Text fontVariantNumeric="tabular-nums">
                      {formatShiftClockTime(seg.start)} - {formatShiftClockTime(seg.end)}
                    </Text>
                    <PositionMark segment={seg} />
                  </Flex>
                ) : (
                  <Text key={seg.id} fontSize="sm" color="gray.700">
                    {formatShiftClockTime(seg.start)} - {formatShiftClockTime(seg.end)}
                  </Text>
                ),
              )}
            </VStack>
          </Box>
        )}

        {breakLabels.length > 0 && (
          <Box>
            <Text fontSize="xs" fontWeight="bold" color="gray.600" mb={2}>
              休憩
            </Text>
            <Text fontSize="sm" color="gray.700" fontVariantNumeric="tabular-nums">
              {breakLabels.join(" / ")}
            </Text>
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
