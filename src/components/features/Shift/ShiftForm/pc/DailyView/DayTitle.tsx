import { Box, Flex } from "@chakra-ui/react";
import dayjs from "dayjs";
import { getWeekdayLabel } from "../../utils/dateUtils";

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
  return (
    <Box px={5} py={3} bg="white" borderBottomWidth="1px" borderColor="gray.200" flexShrink={0}>
      <Flex align="baseline" gap={2}>
        <Box fontSize="22px" fontWeight={700} color="gray.800" style={{ fontVariantNumeric: "tabular-nums" }}>
          {d.month() + 1}月{d.date()}日
        </Box>
        <Box fontSize="13px" fontWeight={600} style={{ color: dayColor(date, holidays) }}>
          ({getWeekdayLabel(date)})
        </Box>
      </Flex>
    </Box>
  );
};
