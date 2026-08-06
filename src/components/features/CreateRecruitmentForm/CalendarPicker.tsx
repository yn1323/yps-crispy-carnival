import { Box, DatePicker, type DateValue, Grid, Stack, Text, useBreakpointValue } from "@chakra-ui/react";
import dayjs from "dayjs";
import { Fragment } from "react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";

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

const CalendarMonthTitle = ({ offset }: { offset: number }) => (
  <DatePicker.Context>
    {(datePicker) => {
      const visibleRange = offset ? datePicker.getOffset({ months: offset }).visibleRange : datePicker.visibleRange;
      return (
        <Text data-calendar-month-title minW={0} textAlign="center" fontSize="sm" fontWeight="semibold" truncate>
          {dayjs(visibleRange.start.toString()).format("YYYY年M月")}
        </Text>
      );
    }}
  </DatePicker.Context>
);

const navigationTriggerStyles = {
  _hover: { bg: "bg.muted", cursor: "pointer" },
  _disabled: { visibility: "hidden" },
} as const;

const MobileCalendarHeader = () => (
  <DatePicker.ViewControl
    data-calendar-navigation="mobile"
    display="grid"
    gridTemplateColumns="var(--datepicker-nav-trigger-size) minmax(0, 1fr) var(--datepicker-nav-trigger-size)"
    mb={3}
  >
    <DatePicker.PrevTrigger aria-label="前の期間を表示" {...navigationTriggerStyles}>
      <LuChevronLeft aria-hidden data-calendar-caret="left" />
    </DatePicker.PrevTrigger>
    <CalendarMonthTitle offset={0} />
    <DatePicker.NextTrigger aria-label="次の期間を表示" {...navigationTriggerStyles}>
      <LuChevronRight aria-hidden data-calendar-caret="right" />
    </DatePicker.NextTrigger>
  </DatePicker.ViewControl>
);

const DesktopCalendarMonthHeader = ({
  offset,
  showPrevious,
  showNext,
}: {
  offset: number;
  showPrevious: boolean;
  showNext: boolean;
}) => (
  <DatePicker.ViewControl
    data-calendar-navigation="desktop"
    display="grid"
    gridTemplateColumns="var(--datepicker-nav-trigger-size) minmax(0, 1fr) var(--datepicker-nav-trigger-size)"
  >
    {showPrevious ? (
      <DatePicker.PrevTrigger aria-label="前の期間を表示" {...navigationTriggerStyles}>
        <LuChevronLeft aria-hidden data-calendar-caret="left" />
      </DatePicker.PrevTrigger>
    ) : (
      <Box aria-hidden="true" boxSize="var(--datepicker-nav-trigger-size)" />
    )}
    <CalendarMonthTitle offset={offset} />
    {showNext ? (
      <DatePicker.NextTrigger aria-label="次の期間を表示" {...navigationTriggerStyles}>
        <LuChevronRight aria-hidden data-calendar-caret="right" />
      </DatePicker.NextTrigger>
    ) : (
      <Box aria-hidden="true" boxSize="var(--datepicker-nav-trigger-size)" />
    )}
  </DatePicker.ViewControl>
);

const dayTriggerSelector = "& [data-part=table-cell-trigger]";
const activeDaySelector = `${dayTriggerSelector}:not(:disabled):not([data-disabled]):not([data-outside-range])`;
const sundayColumnSelector = "& table tr > :first-child";
const saturdayColumnSelector = "& table tr > :last-child";
const dayTriggerPartSelector = "[data-part=table-cell-trigger]";
const selectedDayPartSelector = `${dayTriggerPartSelector}[data-selected]`;
const calendarTableSelector = "& table";
const calendarCellSelector = "& th, & td";
const selectedDaySelector = `& ${selectedDayPartSelector}`;

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
  const isDesktop = useBreakpointValue({ base: false, md: true }, { fallback: "base" }) ?? false;
  const monthCount = isDesktop ? desktopMonths : 1;
  const showMonthDivider = monthCount > 1;

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
      fixedWeeks
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
        [activeDaySelector]: {
          cursor: "pointer",
        },
        [sundayColumnSelector]: {
          color: "red.400",
        },
        [`${sundayColumnSelector} ${dayTriggerPartSelector}`]: {
          color: "red.600",
        },
        [saturdayColumnSelector]: {
          color: "blue.400",
        },
        [`${saturdayColumnSelector} ${dayTriggerPartSelector}`]: {
          color: "blue.600",
        },
        [selectedDaySelector]: {
          color: "white",
        },
        [`${sundayColumnSelector} ${selectedDayPartSelector}`]: {
          color: "white",
        },
        [`${saturdayColumnSelector} ${selectedDayPartSelector}`]: {
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
                cursor: "default",
              },
              [`${dayTriggerSelector}[data-disabled]:hover, ${dayTriggerSelector}[data-outside-range]:hover`]: {
                bg: "transparent",
              },
            }
          : {}),
      }}
    >
      <DatePicker.View view="day">
        {!isDesktop && <MobileCalendarHeader />}
        <Grid
          templateColumns={{
            base: "1fr",
            md: showMonthDivider ? "minmax(0, 1fr) auto minmax(0, 1fr)" : "minmax(0, 1fr)",
          }}
          gap={{ base: 3, md: 5 }}
        >
          {Array.from({ length: monthCount }).map((_, index) => (
            <Fragment key={index}>
              {index > 0 && showMonthDivider && (
                <Box
                  key={`divider-${index}`}
                  aria-hidden="true"
                  alignSelf="stretch"
                  borderLeftWidth={1}
                  borderColor="border.default"
                  my={6}
                />
              )}
              <Stack gap={3} minW={0}>
                {isDesktop && (
                  <DesktopCalendarMonthHeader
                    offset={index}
                    showPrevious={index === 0}
                    showNext={index === monthCount - 1}
                  />
                )}
                <DatePicker.DayTable offset={index} w="full" />
              </Stack>
            </Fragment>
          ))}
        </Grid>
      </DatePicker.View>
    </DatePicker.Root>
  );
};
