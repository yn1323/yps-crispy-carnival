import { Box, Flex, Text } from "@chakra-ui/react";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { getDateColor } from "../timeOptions";
import type { DayEntry } from "../types";

type Props = {
  entry: DayEntry;
  onToggleWorking?: () => void;
  isShopClosed: boolean;
  isReadOnly?: boolean;
};

export function DateOnlySubmissionDayCard({ entry, onToggleWorking, isShopClosed, isReadOnly = false }: Props) {
  const dateLabel = formatDateWithWeekday(entry.date);
  const dateColor = getDateColor(entry.date);

  return (
    <Flex
      w="full"
      minH="48px"
      px={4}
      align="center"
      justify="space-between"
      bg={isShopClosed ? "gray.100" : entry.isWorking ? "teal.50" : "white"}
      borderRadius="lg"
      borderWidth={1}
      borderColor={entry.isWorking && !isShopClosed ? "teal.600" : "border.default"}
      cursor={isShopClosed || isReadOnly ? "default" : "pointer"}
      onClick={isShopClosed || isReadOnly ? undefined : onToggleWorking}
      _hover={isShopClosed || isReadOnly ? undefined : { bg: entry.isWorking ? "teal.50" : "gray.50" }}
    >
      <Text fontSize="sm" fontWeight="medium" color={dateColor}>
        {dateLabel}
      </Text>
      <Box
        bg={isShopClosed ? "gray.100" : entry.isWorking ? "teal.100" : "gray.100"}
        px={2.5}
        py={0.5}
        borderRadius="full"
      >
        <Text
          fontSize="xs"
          fontWeight="semibold"
          color={isShopClosed ? "gray.500" : entry.isWorking ? "teal.700" : "fg.muted"}
        >
          {isShopClosed ? "定休日" : entry.isWorking ? "出勤希望" : "休み"}
        </Text>
      </Box>
    </Flex>
  );
}
