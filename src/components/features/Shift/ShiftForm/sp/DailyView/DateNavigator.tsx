import { Flex, IconButton, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useMemo } from "react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { isHoliday as checkHoliday } from "../../utils/dateUtils";

type DateNavigatorProps = {
  dates: string[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  holidays?: string[];
};

const getDayColor = (date: string, holidays: string[]): string => {
  if (checkHoliday(date, holidays)) return "red.500";
  const dow = dayjs(date).day();
  if (dow === 0) return "red.500";
  if (dow === 6) return "blue.500";
  return "gray.800";
};

export const DateNavigator = ({ dates, selectedDate, onDateChange, holidays = [] }: DateNavigatorProps) => {
  const currentIndex = useMemo(() => dates.indexOf(selectedDate), [dates, selectedDate]);
  const isFirst = currentIndex <= 0;
  const isLast = currentIndex >= dates.length - 1;

  const label = dayjs(selectedDate).format("M/D(ddd)");
  const color = getDayColor(selectedDate, holidays);

  const handlePrev = () => {
    if (!isFirst) onDateChange(dates[currentIndex - 1]);
  };

  const handleNext = () => {
    if (!isLast) onDateChange(dates[currentIndex + 1]);
  };

  return (
    <Flex align="center" justify="center" gap={2}>
      <IconButton aria-label="前日" size="sm" variant="ghost" onClick={handlePrev} disabled={isFirst}>
        <LuChevronLeft />
      </IconButton>
      <Text fontSize="lg" fontWeight="bold" color={color} minW="100px" textAlign="center">
        {label}
      </Text>
      <IconButton aria-label="翌日" size="sm" variant="ghost" onClick={handleNext} disabled={isLast}>
        <LuChevronRight />
      </IconButton>
    </Flex>
  );
};
