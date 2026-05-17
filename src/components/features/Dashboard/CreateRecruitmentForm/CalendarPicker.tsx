import { DatePicker, type DateValue, SimpleGrid, Stack, Text, useBreakpointValue } from "@chakra-ui/react";
import dayjs from "dayjs";

export type CalendarPickerSelectionMode = "range" | "multiple" | "single";

export type CalendarPickerProps = {
  selectionMode: CalendarPickerSelectionMode;
  value: DateValue[];
  min?: DateValue;
  max?: DateValue;
  defaultFocusedValue?: DateValue;
  desktopMonths?: 1 | 2;
  highlightSelectableDates?: boolean;
  onValueChange: (value: DateValue[]) => void;
};

const CalendarHeader = () => (
  <DatePicker.ViewControl display={{ base: "flex", md: "none" }} mb={3}>
    <DatePicker.PrevTrigger display={{ base: "inline-flex", md: "none" }} _disabled={{ display: "none" }} />
    <DatePicker.RangeText flex={1} textAlign="center" fontSize="sm" fontWeight="semibold" />
    <DatePicker.NextTrigger display={{ base: "inline-flex", md: "none" }} _disabled={{ display: "none" }} />
  </DatePicker.ViewControl>
);

const CalendarMonthTitle = ({ offset }: { offset: number }) => (
  <DatePicker.Context>
    {(datePicker) => {
      const visibleRange = offset ? datePicker.getOffset({ months: offset }).visibleRange : datePicker.visibleRange;
      return (
        <Text display={{ base: "none", md: "block" }} textAlign="center" fontSize="sm" fontWeight="semibold">
          {dayjs(visibleRange.start.toString()).format("YYYY年M月")}
        </Text>
      );
    }}
  </DatePicker.Context>
);

const dayTriggerSelector = "& [data-part=table-cell-trigger]";
const activeDaySelector = `${dayTriggerSelector}:not(:disabled):not([data-disabled]):not([data-outside-range])`;
const sundayColumnSelector = "& table tr > :first-child";
const saturdayColumnSelector = "& table tr > :last-child";
const dayTriggerPartSelector = "[data-part=table-cell-trigger]";
const calendarTableSelector = "& table";
const calendarCellSelector = "& th, & td";
const selectedDaySelector = `${dayTriggerSelector}[data-selected]`;

export const CalendarPicker = ({
  selectionMode,
  value,
  min,
  max,
  defaultFocusedValue,
  desktopMonths = 1,
  highlightSelectableDates = false,
  onValueChange,
}: CalendarPickerProps) => {
  const monthCount = useBreakpointValue({ base: 1, md: desktopMonths }) ?? 1;

  return (
    <DatePicker.Root
      inline
      selectionMode={selectionMode}
      value={value}
      min={min}
      max={max}
      defaultFocusedValue={defaultFocusedValue}
      locale="ja-JP"
      timeZone="Asia/Tokyo"
      startOfWeek={0}
      numOfMonths={monthCount}
      closeOnSelect={false}
      hideOutsideDays
      onValueChange={(details) => onValueChange(details.value)}
      size="sm"
      colorPalette="teal"
      p={{ base: 3, md: 4 }}
      borderWidth={1}
      borderColor="border.default"
      borderRadius="md"
      bg="white"
      w="full"
      css={{
        [calendarTableSelector]: {
          w: "full",
          tableLayout: "fixed",
        },
        [calendarCellSelector]: {
          w: "calc(100% / 7)",
          textAlign: "center",
        },
        [dayTriggerSelector]: {
          mx: "auto",
        },
        [sundayColumnSelector]: {
          color: "red.600",
        },
        [`${sundayColumnSelector} ${dayTriggerPartSelector}`]: {
          color: "red.600",
        },
        [saturdayColumnSelector]: {
          color: "blue.600",
        },
        [`${saturdayColumnSelector} ${dayTriggerPartSelector}`]: {
          color: "blue.600",
        },
        [selectedDaySelector]: {
          color: "white",
        },
        [`${sundayColumnSelector} ${selectedDaySelector}`]: {
          color: "white",
        },
        [`${saturdayColumnSelector} ${selectedDaySelector}`]: {
          color: "white",
        },
        ...(highlightSelectableDates
          ? {
              [`${activeDaySelector}:not([data-selected])`]: {
                bg: "teal.100",
              },
              [`${activeDaySelector}:not([data-selected]):hover`]: {
                bg: "teal.200",
              },
              [`${activeDaySelector}[data-selected]`]: {
                bg: "gray.200",
                color: "gray.900",
              },
              [`${activeDaySelector}[data-selected]:hover`]: {
                bg: "gray.300",
                color: "gray.900",
              },
              [`${dayTriggerSelector}[data-disabled], ${dayTriggerSelector}[data-outside-range]`]: {
                bg: "transparent",
              },
              [`${dayTriggerSelector}[data-disabled]:hover, ${dayTriggerSelector}[data-outside-range]:hover`]: {
                bg: "transparent",
              },
            }
          : {}),
      }}
    >
      <DatePicker.View view="day">
        <CalendarHeader />
        <SimpleGrid columns={{ base: 1, md: monthCount }} gap={{ base: 3, md: 5 }}>
          {Array.from({ length: monthCount }).map((_, index) => (
            <Stack key={index} gap={3}>
              <CalendarMonthTitle offset={index} />
              <DatePicker.DayTable offset={index} w="full" />
            </Stack>
          ))}
        </SimpleGrid>
      </DatePicker.View>
    </DatePicker.Root>
  );
};
