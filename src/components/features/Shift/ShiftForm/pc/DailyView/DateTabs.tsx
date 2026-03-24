import { Flex, Tabs, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import type { DayStatus } from "../../types";

type DateTabsProps = {
  dates: string[];
  selectedDate: string;
  onSelect: (date: string) => void;
  holidays?: string[];
  dateStatuses?: Map<string, DayStatus>;
};

// 日付をフォーマット (M/D(曜日))
const formatDate = (dateStr: string) => {
  return dayjs(dateStr).format("M/D(ddd)");
};

// 曜日に応じた色を返す
const getDayColor = (dateStr: string, holidays: string[]): string | undefined => {
  const day = dayjs(dateStr).day();
  if (day === 0 || holidays.includes(dateStr)) return "red.500"; // 日曜・祝日
  if (day === 6) return "blue.500"; // 土曜
  return undefined; // 平日はデフォルト
};

// バッジ表示
const StatusBadge = ({ status }: { status: DayStatus }) => {
  if (status === "none") return null;
  return (
    <Text fontSize="xs" lineHeight={1}>
      {status === "warning" ? "⚠️" : "✅"}
    </Text>
  );
};

export const DateTabs = ({ dates, selectedDate, onSelect, holidays = [], dateStatuses }: DateTabsProps) => {
  return (
    <Tabs.Root
      value={selectedDate}
      onValueChange={(e) => onSelect(e.value)}
      variant="line"
      colorPalette="teal"
      size="sm"
    >
      <Tabs.List
        width="100%"
        overflowX="auto"
        bg="white"
        borderBottom="1px solid"
        borderColor="gray.200"
        css={{
          "&::-webkit-scrollbar": { display: "none" },
          scrollbarWidth: "none",
        }}
      >
        {dates.map((date) => {
          const dayColor = getDayColor(date, holidays);
          const status = dateStatuses?.get(date) ?? "none";

          return (
            <Tabs.Trigger
              key={date}
              value={date}
              flexShrink={0}
              color={dayColor}
              _selected={{ fontWeight: "bold", bg: "teal.50" }}
            >
              <Flex align="center" gap={1}>
                {formatDate(date)}
                <StatusBadge status={status} />
              </Flex>
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>
    </Tabs.Root>
  );
};
