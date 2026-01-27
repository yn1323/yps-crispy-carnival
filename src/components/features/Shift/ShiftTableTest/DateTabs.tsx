import { Tabs } from "@chakra-ui/react";
import dayjs from "dayjs";

type DateTabsProps = {
  dates: string[];
  selectedDate: string;
  onSelect: (date: string) => void;
};

// 日付をフォーマット (M/D(曜日))
const formatDate = (dateStr: string) => {
  return dayjs(dateStr).format("M/D(ddd)");
};

export const DateTabs = ({ dates, selectedDate, onSelect }: DateTabsProps) => {
  return (
    <Tabs.Root
      value={selectedDate}
      onValueChange={(e) => onSelect(e.value)}
      variant="plain"
      colorPalette="teal"
      size="sm"
    >
      <Tabs.List
        width="100%"
        overflowX="auto"
        bg="gray.200"
        borderBottom="1px solid"
        borderColor="gray.200"
        css={{
          "&::-webkit-scrollbar": { display: "none" },
          scrollbarWidth: "none",
        }}
      >
        {dates.map((date) => (
          <Tabs.Trigger key={date} value={date} flexShrink={0}>
            {formatDate(date)}
          </Tabs.Trigger>
        ))}
        <Tabs.Indicator borderRadius="md" />
      </Tabs.List>
    </Tabs.Root>
  );
};
