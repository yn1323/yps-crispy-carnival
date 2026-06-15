import { Box, Flex, Stack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { getWeekdayLabel } from "@/src/domains/shift/date";
import { DateIssueBadge, dateIssueBorderColor } from "../../components";

type Props = {
  dates: string[];
  selectedDate: string;
  onSelect: (date: string) => void;
  holidays?: string[];
  issueCounts?: ReadonlyMap<string, number>;
  warningCounts?: ReadonlyMap<string, number>;
};

const dayColor = (dateStr: string): string => {
  const day = dayjs(dateStr).day();
  if (day === 0) return "#ef4444";
  if (day === 6) return "#3b82f6";
  return "#3f3f46";
};

export const DateRail = ({ dates, selectedDate, onSelect, holidays = [], issueCounts, warningCounts }: Props) => (
  <Box
    minH={0}
    borderRightWidth="1px"
    borderColor="gray.200"
    bg="white"
    py={2}
    overflow="auto"
    alignSelf="stretch"
    role="tablist"
    aria-label="日付選択"
    data-tour="date-rail"
  >
    <Stack gap={1} px={2}>
      {dates.map((iso) => {
        const d = dayjs(iso);
        const active = iso === selectedDate;
        const isClosed = holidays.includes(iso);
        const issueCount = issueCounts?.get(iso) ?? 0;
        const warningCount = warningCounts?.get(iso) ?? 0;
        const badgeBorderColor = dateIssueBorderColor({
          active,
          issueCount,
          warningCount,
          activeColor: "teal.300",
          fallbackColor: "transparent",
        });
        return (
          <Box
            key={iso}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(iso)}
            cursor="pointer"
            position="relative"
            py="6px"
            px="8px"
            borderRadius="md"
            borderWidth="1px"
            borderColor={badgeBorderColor}
            bg={active ? "teal.50" : isClosed ? "gray.50" : "transparent"}
            transition="all 120ms"
            _hover={{ bg: active ? "teal.50" : "gray.50" }}
          >
            <DateIssueBadge issueCount={issueCount} warningCount={warningCount} />
            <Flex align="baseline" justify="center" gap="3px">
              <Box textStyle="sm" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums">
                {d.date()}
              </Box>
              <Box textStyle="caption" fontWeight={600} style={{ color: dayColor(iso) }}>
                ({getWeekdayLabel(iso)})
              </Box>
            </Flex>
            {isClosed && (
              <Box mt="2px" textStyle="2xs" fontWeight={700} color="gray.500" textAlign="center">
                定休日
              </Box>
            )}
          </Box>
        );
      })}
    </Stack>
  </Box>
);
