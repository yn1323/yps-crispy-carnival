import { Box, Flex, Text } from "@chakra-ui/react";
import type { IssueTone } from "../../components";
import type { DateInfo, WeekItem } from "./types";

type Props = {
  weeks: WeekItem[];
  selectedIndex: number;
  issueCounts: ReadonlyMap<string, number>;
  warningCounts: ReadonlyMap<string, number>;
  onSelect: (index: number) => void;
};

export const WeekRail = ({ weeks, selectedIndex, issueCounts, warningCounts, onSelect }: Props) => (
  <Box w="128px" flexShrink={0} bg="white" borderRightWidth="1px" borderColor="gray.200" overflowY="auto">
    <Box px={3} py={2} borderBottomWidth="1px" borderColor="gray.200" bg="gray.50">
      <Text textStyle="2xs" fontWeight={700} color="gray.600">
        週
      </Text>
    </Box>
    {weeks.map((week, index) => {
      const selected = selectedIndex === index;
      const issueCount = sumWeekCount(week.dates, issueCounts);
      const warningCount = sumWeekCount(week.dates, warningCounts);
      const badge =
        issueCount > 0
          ? { count: issueCount, tone: "error" as const }
          : warningCount > 0
            ? { count: warningCount, tone: "warning" as const }
            : null;
      return (
        <Box
          as="button"
          key={week.key}
          aria-label={`${week.label}を表示`}
          aria-pressed={selected}
          onClick={() => onSelect(index)}
          w="100%"
          px={3}
          py={3}
          textAlign="left"
          borderBottomWidth="1px"
          borderColor="gray.100"
          bg={selected ? "gray.100" : "white"}
          color={selected ? "teal.800" : "gray.700"}
          cursor="pointer"
          transitionProperty="colors"
          transitionDuration="faster"
          _hover={{ bg: selected ? "gray.200" : "gray.50" }}
          _active={{ bg: selected ? "gray.200" : "gray.100", transitionDuration: "0ms" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
        >
          <Flex align="center" gap={2}>
            <Box flex={1} minW={0}>
              <Text textStyle="sm" fontWeight={700} fontVariantNumeric="tabular-nums" truncate>
                {week.label}
              </Text>
              <Text textStyle="2xs" color={selected ? "teal.700" : "gray.500"} fontWeight={500} mt={1}>
                {week.subLabel}
              </Text>
            </Box>
            {badge && <WeekCountBadge count={badge.count} tone={badge.tone} />}
          </Flex>
        </Box>
      );
    })}
  </Box>
);

const sumWeekCount = (dates: DateInfo[], counts: ReadonlyMap<string, number>): number =>
  dates.reduce((total, date) => total + (counts.get(date.iso) ?? 0), 0);

const WeekCountBadge = ({ count, tone }: { count: number; tone: IssueTone }) => {
  const bg = tone === "error" ? "red.500" : "orange.400";
  const noun = tone === "error" ? "エラー" : "確認事項";
  return (
    <Flex
      aria-label={`${noun}${count}件`}
      flexShrink={0}
      minW="20px"
      h="20px"
      px="6px"
      align="center"
      justify="center"
      borderRadius="full"
      bg={bg}
      color="white"
      fontSize="11px"
      fontWeight={800}
      lineHeight={1}
      fontVariantNumeric="tabular-nums"
    >
      {count}
    </Flex>
  );
};
