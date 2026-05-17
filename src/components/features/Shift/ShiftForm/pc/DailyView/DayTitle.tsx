import { Box, Flex } from "@chakra-ui/react";
import dayjs from "dayjs";
import { getWeekdayLabel } from "@/src/domains/shift/date";

type Props = {
  date: string;
  holidays?: string[];
};

const dayColor = (dateStr: string, holidays: string[]): string => {
  const day = dayjs(dateStr).day();
  if (day === 0 || holidays.includes(dateStr)) return "#ef4444";
  if (day === 6) return "#3b82f6";
  return "#3f3f46";
};

export const DayTitle = ({ date, holidays = [] }: Props) => {
  if (!date) return null;
  const d = dayjs(date);
  const isClosed = holidays.includes(date);
  return (
    <Box px={5} py={3} bg="white" borderBottomWidth="1px" borderColor="gray.200" flexShrink={0}>
      <Flex align="baseline" gap={2}>
        <Box textStyle="2xl" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums">
          {d.month() + 1}月{d.date()}日
        </Box>
        <Box textStyle="sm" fontWeight={600} style={{ color: dayColor(date, holidays) }}>
          ({getWeekdayLabel(date)})
        </Box>
        {isClosed && (
          <Box px={2} py={0.5} borderRadius="full" bg="gray.100" color="gray.600" textStyle="2xs" fontWeight={700}>
            定休日
          </Box>
        )}
      </Flex>
    </Box>
  );
};
