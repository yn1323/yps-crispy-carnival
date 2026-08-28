import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { IssueCountBadge } from "../../components";
import {
  selectDateWithDailyStaffOrderAtom,
  shiftConfigAtom,
  shiftsAtom,
  viewModeAtom,
  warningCountByDateAtom,
} from "../../stores";
import {
  buildDateOnlyOverviewViewModel,
  type DateOnlyOverviewDayRowViewModel,
  type DateOnlyOverviewWeekdayTone,
  type DateOnlyOverviewWeekViewModel,
} from "./script";

const weekdayColor: Record<DateOnlyOverviewWeekdayTone, string> = {
  weekday: "gray.700",
  saturday: "blue.500",
  sunday: "red.500",
  muted: "gray.400",
};

export const SPDateOnlyOverviewView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const { dates, holidays, staffs, isReadOnly } = config;
  const viewModel = useMemo(
    () =>
      buildDateOnlyOverviewViewModel({
        dates,
        holidays,
        staffs,
        shifts,
        warningCounts,
        isReadOnly,
      }),
    [dates, holidays, staffs, shifts, warningCounts, isReadOnly],
  );
  const [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>(() => {
    const firstKey = viewModel.weeks[0]?.key;
    return firstKey ? { [firstKey]: true } : {};
  });

  const handleDateTap = useCallback(
    (iso: string) => {
      if (isReadOnly) return;
      selectDate(iso);
      setViewMode("daily");
    },
    [isReadOnly, selectDate, setViewMode],
  );

  return (
    <Box flex={1} minH={0} overflow="auto" bg="gray.50" px={3} py={3}>
      <Stack gap={3}>
        {viewModel.weeks.map((week, index) => {
          const isOpen = openWeeks[week.key] ?? index === 0;
          return (
            <WeekCard
              key={week.key}
              week={week}
              isOpen={isOpen}
              onToggle={() => setOpenWeeks((current) => ({ ...current, [week.key]: !isOpen }))}
              onDateTap={handleDateTap}
            />
          );
        })}
      </Stack>
    </Box>
  );
};

const WeekCard = ({
  week,
  isOpen,
  onToggle,
  onDateTap,
}: {
  week: DateOnlyOverviewWeekViewModel;
  isOpen: boolean;
  onToggle: () => void;
  onDateTap: (iso: string) => void;
}) => (
  <Box bg="white" borderRadius="md" borderWidth="1px" borderColor="gray.200" overflow="hidden">
    <Flex
      as="button"
      w="100%"
      align="center"
      gap={3}
      px={3}
      py={3}
      textAlign="left"
      onClick={onToggle}
      borderBottomWidth={isOpen ? "1px" : "0"}
      borderColor="gray.100"
      cursor="pointer"
      bg="transparent"
      transitionProperty="colors"
      transitionDuration="faster"
      _active={{ bg: "gray.100", transitionDuration: "0ms" }}
    >
      <Flex
        w="28px"
        h="28px"
        flexShrink={0}
        borderRadius="md"
        align="center"
        justify="center"
        bg={isOpen ? "teal.500" : "gray.100"}
        color={isOpen ? "white" : "gray.500"}
      >
        {isOpen ? <LuChevronDown size={16} /> : <LuChevronRight size={16} />}
      </Flex>
      <Text textStyle="md" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums">
        {week.label}
      </Text>
    </Flex>

    {isOpen && (
      <Box>
        {week.rows.map((row) => (
          <DayRow key={row.key} row={row} onDateTap={() => onDateTap(row.iso)} />
        ))}
      </Box>
    )}
  </Box>
);

const DayRow = ({ row, onDateTap }: { row: DateOnlyOverviewDayRowViewModel; onDateTap: () => void }) => (
  <Flex
    as={row.canOpenDaily ? "button" : "div"}
    aria-label={row.actionAriaLabel}
    onClick={row.canOpenDaily ? onDateTap : undefined}
    w="100%"
    gap={3}
    px={3}
    py={3}
    textAlign="left"
    borderTopWidth={row.hasTopBorder ? "1px" : "0"}
    borderColor="gray.100"
    bg="white"
    cursor={row.canOpenDaily ? "pointer" : "default"}
    transitionProperty="colors"
    transitionDuration="faster"
    _active={row.canOpenDaily ? { bg: "gray.100", transitionDuration: "0ms" } : undefined}
    _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
  >
    <Box w="68px" flexShrink={0} position="relative">
      {row.warningCount > 0 && <IssueCountBadge count={row.warningCount} tone="warning" />}
      <Flex align="baseline" gap="4px" whiteSpace="nowrap">
        <Text
          textStyle="md"
          fontWeight={700}
          color={row.dateTone === "default" ? "gray.800" : "gray.400"}
          lineHeight="1.1"
          fontVariantNumeric="tabular-nums"
        >
          {row.dateLabel}
        </Text>
        <Text textStyle="2xs" fontWeight={700} flexShrink={0} color={weekdayColor[row.weekdayTone]}>
          {row.weekdayLabel}
        </Text>
      </Flex>
    </Box>
    <Box flex={1} minW={0} pt="1px">
      {row.staffRows.length > 0 ? (
        <Stack gap="5px">
          {row.staffRows.map((staff) => (
            <Text key={staff.key} textStyle="caption" fontWeight={600} color="gray.800">
              {staff.name}
            </Text>
          ))}
        </Stack>
      ) : (
        <Text textStyle="caption" color="gray.400" fontWeight={500} aria-label={row.statusAriaLabel}>
          {row.statusLabel}
        </Text>
      )}
    </Box>
  </Flex>
);
