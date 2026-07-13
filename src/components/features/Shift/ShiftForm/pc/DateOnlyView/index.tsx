import { Box, Flex } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAssignmentWarningSettingText } from "@/src/components/shared/ShiftAssignmentWarning";
import { formatDateShort } from "@/src/domains/shift/date";
import { countDateOnlyAssignmentsByDate } from "@/src/domains/shift/dateOnlyAssignments";
import type { StaffType } from "@/src/domains/shift/types";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import {
  dailySortedStaffsAtom,
  issueCountByDateAtom,
  lockDailyStaffOrderAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsAtom,
  toggleDateOnlyAssignmentAtom,
  validationWarningsAtom,
  warningCountByDateAtom,
} from "../../stores";
import { DateOnlyTable } from "./DateOnlyTable";
import { buildDateOnlyRows, buildDateOnlyWeeks, getSortableDates } from "./script";
import type { DateOnlyColumn } from "./types";
import { WeekRail } from "./WeekRail";

export const DateOnlyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const validationWarnings = useAtomValue(validationWarningsAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const toggleAssignment = useSetAtom(toggleDateOnlyAssignmentAtom);
  const sortedStaffs = useAtomValue(dailySortedStaffsAtom);
  const lockDailyStaffOrder = useSetAtom(lockDailyStaffOrderAtom);

  const { dates, holidays, isReadOnly } = config;
  const isConfirmedDisplay = config.displayMode === "confirmed";
  const weeks = useMemo(() => buildDateOnlyWeeks(dates), [dates]);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const selectedWeek = weeks[selectedWeekIndex] ?? weeks[0];
  const visibleDates = selectedWeek?.dates ?? [];
  const sortableDates = useMemo(() => getSortableDates(visibleDates, holidays), [visibleDates, holidays]);
  const defaultSortDate = sortableDates[0]?.iso ?? "";
  const [sortDate, setSortDate] = useState(defaultSortDate);
  const selectedDate = useAtomValue(selectedDateAtom);
  const didInitWeek = useRef(false);

  useEffect(() => {
    if (didInitWeek.current || !selectedDate || weeks.length === 0) return;
    didInitWeek.current = true;
    const index = weeks.findIndex((week) => week.dates.some((date) => date.inRange && date.iso === selectedDate));
    if (index > 0) setSelectedWeekIndex(index);
  }, [selectedDate, weeks]);

  const visibleInRangeDateKeys = useMemo(
    () => visibleDates.filter((date) => date.inRange).map((date) => date.iso),
    [visibleDates],
  );
  const counts = useMemo(
    () => countDateOnlyAssignmentsByDate(shifts, visibleInRangeDateKeys),
    [shifts, visibleInRangeDateKeys],
  );
  const warningMessagesByStaffId = useMemo(() => {
    const visibleDateSet = new Set(visibleInRangeDateKeys);
    const messagesByStaffId = new Map<string, string[]>();
    for (const warning of validationWarnings) {
      if (!visibleDateSet.has(warning.date)) continue;
      const messages = messagesByStaffId.get(warning.staffId) ?? [];
      messages.push(`${formatDateShort(warning.date)} ${getAssignmentWarningSettingText(warning.code)}`);
      messagesByStaffId.set(warning.staffId, messages);
    }
    return messagesByStaffId;
  }, [validationWarnings, visibleInRangeDateKeys]);
  const columns = useMemo<DateOnlyColumn[]>(
    () =>
      visibleDates.map((date) => ({
        date,
        isClosed: date.inRange && holidays.includes(date.iso),
        assignmentCount: counts.get(date.iso) ?? 0,
      })),
    [counts, holidays, visibleDates],
  );
  const rows = useMemo(
    () =>
      buildDateOnlyRows({
        staffs: sortedStaffs,
        shifts,
        dates: visibleDates,
        holidays,
        isConfirmedDisplay,
        warningMessagesByStaffId,
      }),
    [holidays, isConfirmedDisplay, shifts, sortedStaffs, visibleDates, warningMessagesByStaffId],
  );

  useEffect(() => {
    if (selectedWeekIndex >= weeks.length) setSelectedWeekIndex(0);
  }, [selectedWeekIndex, weeks.length]);

  useEffect(() => {
    lockDailyStaffOrder(defaultSortDate);
    setSortDate(defaultSortDate);
  }, [defaultSortDate, lockDailyStaffOrder]);

  useLockedDailyStaffOrder(sortDate);

  const handleWeekSelect = useCallback(
    (weekIndex: number) => {
      const nextWeek = weeks[weekIndex] ?? weeks[0];
      const nextSortDate = getSortableDates(nextWeek?.dates ?? [], holidays)[0]?.iso ?? "";
      lockDailyStaffOrder(nextSortDate);
      setSortDate(nextSortDate);
      setSelectedWeekIndex(weekIndex);
    },
    [holidays, lockDailyStaffOrder, weeks],
  );

  const handleSortDateSelect = useCallback(
    (date: string) => {
      lockDailyStaffOrder(date);
      setSortDate(date);
    },
    [lockDailyStaffOrder],
  );

  const handleToggle = (staff: StaffType, date: string) => {
    toggleAssignment({ staff, date });
  };

  return (
    <Flex flex={1} minH={0} overflow="hidden" bg="gray.50">
      <WeekRail
        weeks={weeks}
        selectedIndex={selectedWeekIndex}
        issueCounts={issueCounts}
        warningCounts={warningCounts}
        onSelect={handleWeekSelect}
      />
      <Box flex={1} minW={0} overflow="auto" bg="gray.50">
        <DateOnlyTable
          columns={columns}
          rows={rows}
          sortableDates={sortableDates}
          sortDate={sortDate}
          isConfirmedDisplay={isConfirmedDisplay}
          isReadOnly={isReadOnly}
          onSortDateSelect={handleSortDateSelect}
          onToggle={handleToggle}
        />
      </Box>
    </Flex>
  );
};
