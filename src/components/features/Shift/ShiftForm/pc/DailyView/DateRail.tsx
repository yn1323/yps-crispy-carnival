import { Box, Flex, Stack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { getWeekdayLabel } from "../../utils/dateUtils";

type Props = {
  dates: string[];
  selectedDate: string;
  onSelect: (date: string) => void;
  holidays?: string[];
};

const dayColor = (dateStr: string, holidays: string[]): string => {
  const day = dayjs(dateStr).day();
  if (day === 0 || holidays.includes(dateStr)) return "#ef4444";
  if (day === 6) return "#3b82f6";
  return "#3f3f46";
};

export const DateRail = ({ dates, selectedDate, onSelect, holidays = [] }: Props) => (
  <Box
    w="80px"
    h="100%"
    borderRightWidth="1px"
    borderColor="gray.200"
    bg="white"
    py={2}
    flexShrink={0}
    overflow="auto"
    role="tablist"
    aria-label="日付選択"
    data-tour="date-rail"
  >
    <Stack gap={1} px={2}>
      {dates.map((iso) => {
        const d = dayjs(iso);
        const active = iso === selectedDate;
        return (
          <Box
            key={iso}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(iso)}
            cursor="pointer"
            py="6px"
            px="8px"
            borderRadius="md"
            borderWidth="1px"
            borderColor={active ? "teal.300" : "transparent"}
            bg={active ? "teal.50" : "transparent"}
            transition="all 120ms"
            _hover={{ bg: active ? "teal.50" : "gray.50" }}
          >
            <Flex align="baseline" justify="center" gap="3px">
              <Box fontSize="14px" fontWeight={700} color="gray.800" style={{ fontVariantNumeric: "tabular-nums" }}>
                {d.date()}
              </Box>
              <Box fontSize="12px" fontWeight={600} style={{ color: dayColor(iso, holidays) }}>
                ({getWeekdayLabel(iso)})
              </Box>
            </Flex>
          </Box>
        );
      })}
    </Stack>
  </Box>
);
