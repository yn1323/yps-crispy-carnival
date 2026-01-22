import { Button, Flex } from "@chakra-ui/react";
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
    <Flex gap={1} overflowX="auto" pb={1}>
      {dates.map((date) => {
        const isSelected = selectedDate === date;
        return (
          <Button
            key={date}
            size="sm"
            variant={isSelected ? "solid" : "outline"}
            colorPalette={isSelected ? "teal" : "gray"}
            onClick={() => onSelect(date)}
            flexShrink={0}
            transition="all 0.15s"
          >
            {formatDate(date)}
          </Button>
        );
      })}
    </Flex>
  );
};
