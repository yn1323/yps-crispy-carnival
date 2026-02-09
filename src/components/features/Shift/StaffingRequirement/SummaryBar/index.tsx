import { Flex, Icon, Text } from "@chakra-ui/react";
import { LuCalendarCheck, LuChartBar, LuClock } from "react-icons/lu";

type SummaryBarProps = {
  weeklyTotalPersonHours: number;
  peakInfo: { day: string; hour: string; count: number } | null;
  configuredDaysCount: number;
};

export const SummaryBar = ({ weeklyTotalPersonHours, peakInfo, configuredDaysCount }: SummaryBarProps) => {
  return (
    <Flex bg="gray.50" borderRadius="lg" p={3} gap={{ base: 3, md: 6 }} wrap="wrap" align="center" mb={4}>
      <Flex align="center" gap={2}>
        <Icon as={LuChartBar} color="teal.500" boxSize={4} />
        <Text fontSize="sm" color="gray.600">
          週合計:
        </Text>
        <Text fontSize="sm" fontWeight="bold">
          {weeklyTotalPersonHours}人時
        </Text>
      </Flex>

      {peakInfo && (
        <Flex align="center" gap={2}>
          <Icon as={LuClock} color="orange.500" boxSize={4} />
          <Text fontSize="sm" color="gray.600">
            ピーク:
          </Text>
          <Text fontSize="sm" fontWeight="bold">
            {peakInfo.day} {peakInfo.hour}({peakInfo.count}人)
          </Text>
        </Flex>
      )}

      <Flex align="center" gap={2}>
        <Icon as={LuCalendarCheck} color="blue.500" boxSize={4} />
        <Text fontSize="sm" fontWeight="bold">
          {configuredDaysCount}/7日設定済
        </Text>
      </Flex>
    </Flex>
  );
};
