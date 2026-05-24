import { Box, Flex, Text } from "@chakra-ui/react";
import { LuX } from "react-icons/lu";
import { IconButton } from "@/src/components/ui/Button";
import { Select, type SelectItemType } from "@/src/components/ui/Select";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { formatTime, getDateColor } from "../utils/timeOptions";

export type DayEntry = {
  date: string;
  isWorking: boolean;
  startTime: string;
  endTime: string;
  optionId?: string;
  optionIds?: string[];
};

type Props = {
  entry: DayEntry;
  timeOptions: SelectItemType[];
  onToggleWorking: () => void;
  onTimeChange: (field: "startTime" | "endTime", value: string) => void;
  onClear: () => void;
  isReadOnly?: boolean;
  isShopClosed?: boolean;
  error?: string;
};

export const DayCard = ({
  entry,
  timeOptions,
  onToggleWorking,
  onTimeChange,
  onClear,
  isReadOnly = false,
  isShopClosed = false,
  error,
}: Props) => {
  const dateColor = getDateColor(entry.date);
  const dateLabel = formatDateWithWeekday(entry.date);

  if (isReadOnly) {
    return (
      <Flex
        w="full"
        h="48px"
        px={4}
        align="center"
        justify="space-between"
        bg={isShopClosed ? "gray.100" : "white"}
        borderRadius="lg"
        borderWidth={1}
        borderColor="border.default"
      >
        <Text fontSize="sm" fontWeight="medium" color={dateColor}>
          {dateLabel}
        </Text>
        {isShopClosed ? (
          <Box bg="gray.100" px={2.5} py={0.5} borderRadius="full">
            <Text fontSize="xs" fontWeight="bold" color="gray.500">
              定休日
            </Text>
          </Box>
        ) : entry.isWorking ? (
          <Text fontSize="sm" fontWeight="medium" color="teal.600">
            {formatTime(entry.startTime)} 〜 {formatTime(entry.endTime)}
          </Text>
        ) : (
          <Text fontSize="xs" fontWeight="medium" color="fg.muted">
            休み
          </Text>
        )}
      </Flex>
    );
  }

  if (isShopClosed) {
    return (
      <Flex
        w="full"
        h="48px"
        px={4}
        align="center"
        justify="space-between"
        bg="gray.100"
        borderRadius="lg"
        borderWidth={1}
        borderColor="border.default"
      >
        <Text fontSize="sm" fontWeight="medium" color={dateColor}>
          {dateLabel}
        </Text>
        <Box bg="gray.100" px={2.5} py={0.5} borderRadius="full">
          <Text fontSize="xs" fontWeight="bold" color="gray.500">
            定休日
          </Text>
        </Box>
      </Flex>
    );
  }

  if (!entry.isWorking) {
    return (
      <Flex
        w="full"
        h="48px"
        px={4}
        align="center"
        justify="space-between"
        bg="white"
        borderRadius="lg"
        borderWidth={1}
        borderColor="border.default"
        cursor="pointer"
        onClick={onToggleWorking}
        _hover={{ bg: "gray.50" }}
      >
        <Text fontSize="sm" fontWeight="medium" color={dateColor}>
          {dateLabel}
        </Text>
        <Box bg="gray.100" px={2.5} py={0.5} borderRadius="full">
          <Text fontSize="xs" fontWeight="medium" color="fg.muted">
            休み
          </Text>
        </Box>
      </Flex>
    );
  }

  return (
    <Box w="full">
      <Flex
        w="full"
        h="48px"
        px={2}
        pl={4}
        align="center"
        gap={2}
        bg={error ? "#fff5f5" : "#f0fdfa"}
        borderRadius="lg"
        borderWidth={1}
        borderColor={error ? "red.500" : "teal.600"}
      >
        <Text fontSize="sm" fontWeight="medium" color={dateColor} flexShrink={0}>
          {dateLabel}
        </Text>
        <Box flex={1} />
        <Select
          items={timeOptions}
          value={entry.startTime}
          onChange={(v) => onTimeChange("startTime", v)}
          placeholder=""
          size="xs"
          w="80px"
        />
        <Text fontSize="xs" color="fg.muted">
          〜
        </Text>
        <Select
          items={timeOptions}
          value={entry.endTime}
          onChange={(v) => onTimeChange("endTime", v)}
          placeholder=""
          size="xs"
          w="80px"
        />
        <IconButton
          aria-label="休みに戻す"
          size="xs"
          variant="outline"
          borderRadius="full"
          onClick={onClear}
          colorPalette="gray"
          bg="white"
        >
          <LuX />
        </IconButton>
      </Flex>
      {error && (
        <Text fontSize="xs" color="red.500" mt={1} pl={1}>
          {error}
        </Text>
      )}
    </Box>
  );
};
