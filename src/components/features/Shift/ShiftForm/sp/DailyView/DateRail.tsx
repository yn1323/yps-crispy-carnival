import { Box, Flex } from "@chakra-ui/react";
import dayjs from "dayjs";
import type { RefObject } from "react";
import { getWeekdayLabel } from "@/src/domains/shift/date";
import { DateIssueBadge, dateIssueBorderColor } from "../../components";

type Props = {
  dates: string[];
  selectedDate: string;
  holidays: string[];
  issueCounts: ReadonlyMap<string, number>;
  warningCounts: ReadonlyMap<string, number>;
  dateStripRef: RefObject<HTMLDivElement | null>;
  onSelect: (date: string) => void;
};

export const DateRail = ({
  dates,
  selectedDate,
  holidays,
  issueCounts,
  warningCounts,
  dateStripRef,
  onSelect,
}: Props) => {
  const selected = selectedDate ? dayjs(selectedDate) : null;
  const isShopClosedDate = holidays.includes(selectedDate);

  return (
    <>
      <Box
        px={3}
        pt={3}
        pb={2}
        bg="white"
        borderBottomWidth="1px"
        borderColor="gray.100"
        flexShrink={0}
        data-tour="date-rail"
      >
        <Flex ref={dateStripRef} gap={2} overflow="auto" pt={2} pb={1}>
          {dates.map((iso) => {
            const date = dayjs(iso);
            const active = iso === selectedDate;
            const isClosed = holidays.includes(iso);
            const issueCount = issueCounts.get(iso) ?? 0;
            const warningCount = warningCounts.get(iso) ?? 0;
            return (
              <Box
                key={iso}
                data-date-chip={iso}
                onClick={() => onSelect(iso)}
                position="relative"
                flexShrink={0}
                w="52px"
                py="8px"
                textAlign="center"
                borderRadius="md"
                borderWidth="1px"
                borderColor={dateIssueBorderColor({
                  active,
                  issueCount,
                  warningCount,
                  activeColor: "teal.400",
                  fallbackColor: "gray.200",
                })}
                bg={active ? "teal.50" : isClosed ? "gray.50" : "white"}
                cursor="pointer"
              >
                <DateIssueBadge issueCount={issueCount} warningCount={warningCount} />
                <Box
                  textStyle="md"
                  fontWeight={700}
                  color={active ? "teal.700" : "gray.800"}
                  lineHeight="1.1"
                  fontVariantNumeric="tabular-nums"
                >
                  {date.date()}
                </Box>
                <Box textStyle="2xs" mt="2px" fontWeight={active ? 700 : 500} style={{ color: getDayColor(iso) }}>
                  {getWeekdayLabel(iso)}
                </Box>
                {isClosed && (
                  <Box textStyle="2xs" mt="1px" fontWeight={700} color="gray.500">
                    休
                  </Box>
                )}
              </Box>
            );
          })}
        </Flex>
      </Box>
      {selected && (
        <Box px={4} py={3} bg="white" borderBottomWidth="1px" borderColor="gray.200" flexShrink={0}>
          <Flex align="baseline" gap={2}>
            <Box textStyle="xl" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums">
              {selected.month() + 1}月{selected.date()}日
            </Box>
            <Box textStyle="sm" fontWeight={600} style={{ color: getDayColor(selectedDate) }}>
              ({getWeekdayLabel(selectedDate)})
            </Box>
            {isShopClosedDate && (
              <Box px={2} py={0.5} borderRadius="full" bg="gray.100" color="gray.600" textStyle="2xs" fontWeight={700}>
                定休日
              </Box>
            )}
          </Flex>
        </Box>
      )}
    </>
  );
};

const getDayColor = (date: string): string => {
  const day = dayjs(date).day();
  if (day === 0) return "#ef4444";
  if (day === 6) return "#3b82f6";
  return "#3f3f46";
};
