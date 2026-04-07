import { Box, Button, Circle, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";
import { formatDateWithWeekday } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import type { DayEntry } from "../DayCard";
import { formatTime, getDateColor } from "../utils/timeOptions";

type Props = {
  shopName: string;
  entries: DayEntry[];
  onEdit: () => void;
};

export const SubmitCompleteView = ({ shopName, entries, onEdit }: Props) => {
  return (
    <Flex direction="column" minH="100dvh" bg="gray.50">
      {/* Header */}
      <Box bg="teal.600" px={4} pt={3} pb={4}>
        <Text fontSize="xs" color="white" opacity={0.8}>
          {shopName}
        </Text>
        <Text fontSize="xl" fontWeight="bold" color="white">
          シフト希望を提出
        </Text>
      </Box>

      {/* Success Area */}
      <VStack bg="white" px={4} pt={8} pb={6} gap={2}>
        <Circle size="56px" bg="teal.600">
          <Icon color="white" boxSize={7}>
            <LuCheck />
          </Icon>
        </Circle>
        <Text fontSize="xl" fontWeight="bold">
          提出しました
        </Text>
        <Text fontSize="sm" color="fg.muted">
          シフトが確定したらメールでお知らせします
        </Text>
      </VStack>

      {/* Summary */}
      <Box px={4} pt={3}>
        <Box borderRadius="lg" borderWidth={1} borderColor="border.default" bg="white" overflow="hidden">
          {entries.map((entry, i) => (
            <Flex
              key={entry.date}
              h="40px"
              px={4}
              align="center"
              justify="space-between"
              borderBottomWidth={i < entries.length - 1 ? 1 : 0}
              borderColor="border.default"
            >
              <Text fontSize="sm" fontWeight="medium" color={getDateColor(entry.date)}>
                {formatDateWithWeekday(entry.date)}
              </Text>
              {entry.isWorking ? (
                <Text fontSize="sm" fontWeight="medium" color="teal.600">
                  {formatTime(entry.startTime)} 〜 {formatTime(entry.endTime)}
                </Text>
              ) : (
                <Text fontSize="sm" color="fg.subtle">
                  休み
                </Text>
              )}
            </Flex>
          ))}
        </Box>
      </Box>

      {/* Edit Button */}
      <Box px={4} pt={4} pb={6}>
        <Button w="full" h="48px" variant="outline" borderRadius="lg" fontWeight="semibold" bg="white" onClick={onEdit}>
          内容を修正する
        </Button>
      </Box>
    </Flex>
  );
};
