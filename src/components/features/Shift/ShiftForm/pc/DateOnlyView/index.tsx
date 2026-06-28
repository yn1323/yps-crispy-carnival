import { Box, Flex, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAssignmentWarningSettingText } from "@/src/domains/shift/assignmentWarningSummary";
import {
  buildWeeklyGrid,
  formatDateShort,
  formatDateWithWeekday,
  getWeekdayLabel,
  isSaturday,
  isSunday,
} from "@/src/domains/shift/date";
import {
  countDateOnlyAssignmentsByDate,
  hasDateOnlyAssignment,
  hasDateOnlyRequest,
  toggleDateOnlyAssignment,
} from "@/src/domains/shift/dateOnlyAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { Avatar, type IssueTone, StaffWarningIcon } from "../../components";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import {
  dailySortedStaffsAtom,
  issueCountByDateAtom,
  lockDailyStaffOrderAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsAtom,
  validationWarningsAtom,
  warningCountByDateAtom,
} from "../../stores";

const STAFF_COL_WIDTH = 220;
const REQUEST_COL_WIDTH = 160;
const DATE_COL_WIDTH = 92;
const WEEK_RAIL_WIDTH = 128;

type WeekItem = {
  key: string;
  label: string;
  subLabel: string;
  dates: DateInfo[];
};

type DateInfo = {
  iso: string;
  inRange: boolean;
};

export const DateOnlyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const validationWarnings = useAtomValue(validationWarningsAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const setShifts = useSetAtom(shiftsAtom);
  const sortedStaffs = useAtomValue(dailySortedStaffsAtom);
  const lockDailyStaffOrder = useSetAtom(lockDailyStaffOrderAtom);

  const { dates, holidays, isReadOnly, positions, timeRange } = config;
  const isConfirmedDisplay = config.displayMode === "confirmed";
  const fallbackPosition = positions[0];
  const weeks = useMemo(() => buildDateOnlyWeeks(dates), [dates]);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const selectedWeek = weeks[selectedWeekIndex] ?? weeks[0];
  const visibleDates = selectedWeek?.dates ?? [];
  const sortableDates = useMemo(() => getSortableDates(visibleDates, holidays), [visibleDates, holidays]);
  const defaultSortDate = sortableDates[0]?.iso ?? "";
  const [sortDate, setSortDate] = useState(defaultSortDate);
  const selectedDate = useAtomValue(selectedDateAtom);
  const didInitWeek = useRef(false);

  // 初回1度だけ、選択日（スタッフ確認では今日）を含む週を開く。
  // 通常の呼び出し元では selectedDate = 期間先頭日 = 1週目のため変更なし。
  useEffect(() => {
    if (didInitWeek.current || !selectedDate || weeks.length === 0) return;
    didInitWeek.current = true;
    const idx = weeks.findIndex((week) => week.dates.some((date) => date.inRange && date.iso === selectedDate));
    if (idx > 0) setSelectedWeekIndex(idx);
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
    const map = new Map<string, string[]>();
    for (const warning of validationWarnings) {
      if (!visibleDateSet.has(warning.date)) continue;
      const messages = map.get(warning.staffId) ?? [];
      messages.push(`${formatDateShort(warning.date)} ${getAssignmentWarningSettingText(warning.code)}`);
      map.set(warning.staffId, messages);
    }
    return map;
  }, [validationWarnings, visibleInRangeDateKeys]);
  const shiftByStaffDate = useMemo(() => {
    const map = new Map<string, ShiftData>();
    for (const shift of shifts) {
      map.set(`${shift.staffId}-${shift.date}`, shift);
    }
    return map;
  }, [shifts]);

  useEffect(() => {
    if (selectedWeekIndex >= weeks.length) {
      setSelectedWeekIndex(0);
    }
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
    if (isReadOnly || holidays.includes(date)) return;
    setShifts((current) =>
      toggleDateOnlyAssignment({
        shifts: current,
        staff,
        date,
        timeRange,
        ...(fallbackPosition ? { position: fallbackPosition } : {}),
      }),
    );
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
        <Box
          minW={`${STAFF_COL_WIDTH + REQUEST_COL_WIDTH + visibleDates.length * DATE_COL_WIDTH}px`}
          bg="white"
          overflow="hidden"
        >
          <DateSortToolbar dates={sortableDates} selectedDate={sortDate} onSelect={handleSortDateSelect} />
          <Box as="table" w="100%" style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
            <Box as="colgroup">
              <Box as="col" style={{ width: STAFF_COL_WIDTH }} />
              <Box as="col" style={{ width: REQUEST_COL_WIDTH }} />
              {visibleDates.map((date) => (
                <Box as="col" key={date.iso} style={{ width: DATE_COL_WIDTH }} />
              ))}
            </Box>
            <Box as="thead">
              <Box as="tr" bg="gray.50">
                <StickyHeaderCell left={0}>ユーザー</StickyHeaderCell>
                <StickyHeaderCell left={STAFF_COL_WIDTH}>{isConfirmedDisplay ? "確定" : "希望"}</StickyHeaderCell>
                {visibleDates.map((date) => (
                  <DateHeaderCell
                    key={date.iso}
                    date={date}
                    isClosed={date.inRange && holidays.includes(date.iso)}
                    isSortDate={date.iso === sortDate}
                  />
                ))}
              </Box>
              <Box as="tr">
                <StickyHeaderCell left={0} muted bg="gray.50">
                  人数
                </StickyHeaderCell>
                <StickyHeaderCell left={STAFF_COL_WIDTH} muted bg="gray.50" />
                {visibleDates.map((date) => (
                  <HeaderCell
                    key={date.iso}
                    muted
                    bg={date.inRange && holidays.includes(date.iso) ? "gray.100" : "gray.50"}
                  >
                    <Text
                      color={!date.inRange || holidays.includes(date.iso) ? "gray.400" : "teal.700"}
                      fontWeight={700}
                    >
                      {!date.inRange ? "—" : holidays.includes(date.iso) ? "休" : `${counts.get(date.iso) ?? 0}人`}
                    </Text>
                  </HeaderCell>
                ))}
              </Box>
            </Box>
            <Box as="tbody">
              {sortedStaffs.map((staff) => (
                <Box as="tr" key={staff.id}>
                  <StaffCell staff={staff} warningMessages={warningMessagesByStaffId.get(staff.id) ?? []} />
                  <RequestCell staff={staff} shifts={shifts} dates={visibleDates} confirmed={isConfirmedDisplay} />
                  {visibleDates.map((date) => {
                    const shift = shiftByStaffDate.get(`${staff.id}-${date.iso}`);
                    const assigned = hasDateOnlyAssignment(shift);
                    const requested = hasDateOnlyRequest(shift);
                    const isClosed = date.inRange && holidays.includes(date.iso);
                    const isSortDate = date.iso === sortDate;
                    return (
                      <DateOnlyCell
                        key={date.iso}
                        staff={staff}
                        date={date}
                        assigned={assigned}
                        requested={requested}
                        isClosed={isClosed}
                        isSortDate={isSortDate}
                        isReadOnly={isReadOnly}
                        onToggle={() => handleToggle(staff, date.iso)}
                      />
                    );
                  })}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Flex>
  );
};

const buildDateOnlyWeeks = (dates: string[]): WeekItem[] =>
  buildWeeklyGrid(dates).map((week, index) => {
    const start = week[0]?.iso ?? "";
    const end = week[week.length - 1]?.iso ?? start;
    return {
      key: `${start}-${end}`,
      label: start === end ? formatDateShort(start) : `${formatDateShort(start)}-${formatDateShort(end)}`,
      subLabel: `${index + 1}週目`,
      dates: week,
    };
  });

const getSortableDates = (dates: DateInfo[], holidays: string[]): DateInfo[] => {
  const inRangeDates = dates.filter((date) => date.inRange);
  const openDates = inRangeDates.filter((date) => !holidays.includes(date.iso));
  return openDates.length > 0 ? openDates : inRangeDates;
};

const DateSortToolbar = ({
  dates,
  selectedDate,
  onSelect,
}: {
  dates: DateInfo[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) => {
  if (dates.length === 0) return null;

  return (
    <Flex align="center" gap={3} px={4} py={3} bg="white" borderBottomWidth="1px" borderColor="gray.200">
      <Text textStyle="xs" fontWeight={700} color="gray.600" flexShrink={0}>
        この日で並べ替える
      </Text>
      <Flex gap={2} overflowX="auto" minW={0}>
        {dates.map((date) => {
          const selected = date.iso === selectedDate;
          return (
            <Box
              as="button"
              key={date.iso}
              aria-label={`${formatDateWithWeekday(date.iso)}で並べ替える`}
              aria-pressed={selected}
              onClick={() => onSelect(date.iso)}
              flexShrink={0}
              px={3}
              py="6px"
              borderRadius="full"
              borderWidth="1px"
              borderColor={selected ? "teal.500" : "gray.200"}
              bg={selected ? "teal.50" : "white"}
              color={selected ? "teal.700" : "gray.700"}
              textStyle="xs"
              fontWeight={700}
              fontVariantNumeric="tabular-nums"
              cursor="pointer"
              _hover={{ bg: selected ? "teal.100" : "gray.50" }}
              _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
            >
              {formatDateShort(date.iso)}
            </Box>
          );
        })}
      </Flex>
    </Flex>
  );
};

const WeekRail = ({
  weeks,
  selectedIndex,
  issueCounts,
  warningCounts,
  onSelect,
}: {
  weeks: WeekItem[];
  selectedIndex: number;
  issueCounts: ReadonlyMap<string, number>;
  warningCounts: ReadonlyMap<string, number>;
  onSelect: (index: number) => void;
}) => (
  <Box
    w={`${WEEK_RAIL_WIDTH}px`}
    flexShrink={0}
    bg="white"
    borderRightWidth="1px"
    borderColor="gray.200"
    overflowY="auto"
  >
    <Box px={3} py={2} borderBottomWidth="1px" borderColor="gray.200" bg="gray.50">
      <Text textStyle="2xs" fontWeight={700} color="gray.600">
        週
      </Text>
    </Box>
    {weeks.map((week, index) => {
      const selected = selectedIndex === index;
      const issueCount = sumWeekCount(week.dates, issueCounts);
      const warningCount = sumWeekCount(week.dates, warningCounts);
      const badge =
        issueCount > 0
          ? { count: issueCount, tone: "error" as const }
          : warningCount > 0
            ? { count: warningCount, tone: "warning" as const }
            : null;
      return (
        <Box
          as="button"
          key={week.key}
          aria-label={`${week.label}を表示`}
          aria-pressed={selected}
          onClick={() => onSelect(index)}
          w="100%"
          px={3}
          py={3}
          textAlign="left"
          borderBottomWidth="1px"
          borderColor="gray.100"
          bg={selected ? "teal.50" : "white"}
          color={selected ? "teal.800" : "gray.700"}
          cursor="pointer"
          _hover={{ bg: selected ? "teal.50" : "gray.50" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
        >
          <Flex align="center" gap={2}>
            <Box flex={1} minW={0}>
              <Text textStyle="sm" fontWeight={700} fontVariantNumeric="tabular-nums" truncate>
                {week.label}
              </Text>
              <Text textStyle="2xs" color={selected ? "teal.700" : "gray.500"} fontWeight={500} mt={1}>
                {week.subLabel}
              </Text>
            </Box>
            {badge && <WeekCountBadge count={badge.count} tone={badge.tone} />}
          </Flex>
        </Box>
      );
    })}
  </Box>
);

const sumWeekCount = (dates: DateInfo[], counts: ReadonlyMap<string, number>): number =>
  dates.reduce((total, date) => total + (counts.get(date.iso) ?? 0), 0);

const WeekCountBadge = ({ count, tone }: { count: number; tone: IssueTone }) => {
  const bg = tone === "error" ? "red.500" : "orange.400";
  const noun = tone === "error" ? "エラー" : "確認事項";
  return (
    <Flex
      aria-label={`${noun}${count}件`}
      flexShrink={0}
      minW="20px"
      h="20px"
      px="6px"
      align="center"
      justify="center"
      borderRadius="full"
      bg={bg}
      color="white"
      fontSize="11px"
      fontWeight={800}
      lineHeight={1}
      fontVariantNumeric="tabular-nums"
    >
      {count}
    </Flex>
  );
};

const HeaderCell = ({
  children,
  muted = false,
  bg,
  active = false,
}: {
  children?: ReactNode;
  muted?: boolean;
  bg?: string;
  active?: boolean;
}) => (
  <Box
    as="th"
    px={3}
    py={2}
    textAlign="center"
    borderRightWidth="1px"
    borderBottomWidth={active ? "2px" : "1px"}
    borderColor="gray.200"
    borderBottomColor={active ? "teal.500" : "gray.200"}
    bg={bg}
    color={muted ? "gray.600" : "gray.800"}
    textStyle="xs"
    fontWeight={600}
    _last={{ borderRightWidth: 0 }}
  >
    {children}
  </Box>
);

const StickyHeaderCell = ({
  children,
  left,
  muted = false,
  bg = "gray.50",
}: {
  children?: ReactNode;
  left: number;
  muted?: boolean;
  bg?: string;
}) => (
  <Box
    as="th"
    position="sticky"
    left={`${left}px`}
    zIndex={4}
    px={3}
    py={2}
    textAlign="center"
    borderRightWidth="1px"
    borderBottomWidth="1px"
    borderColor="gray.200"
    bg={bg}
    color={muted ? "gray.600" : "gray.800"}
    textStyle="xs"
    fontWeight={600}
  >
    {children}
  </Box>
);

const DateHeaderCell = ({ date, isClosed, isSortDate }: { date: DateInfo; isClosed: boolean; isSortDate: boolean }) => {
  const color = isSunday(date.iso) ? "red.500" : isSaturday(date.iso) ? "blue.500" : "gray.700";
  return (
    <HeaderCell bg={isSortDate ? "teal.50" : isClosed ? "gray.100" : "gray.50"} active={isSortDate}>
      <Box
        textStyle="sm"
        color={isSortDate ? "teal.800" : !date.inRange || isClosed ? "gray.400" : "gray.800"}
        fontWeight={700}
        fontVariantNumeric="tabular-nums"
      >
        {formatDateShort(date.iso)}
      </Box>
      <Box
        textStyle="caption"
        color={isSortDate ? "teal.700" : !date.inRange || isClosed ? "gray.400" : color}
        mt="2px"
        fontWeight={600}
      >
        {getWeekdayLabel(date.iso)}
      </Box>
    </HeaderCell>
  );
};

const StaffCell = ({ staff, warningMessages }: { staff: StaffType; warningMessages: string[] }) => (
  <Box
    as="td"
    px={4}
    py={2}
    borderRightWidth="1px"
    borderBottomWidth="1px"
    borderColor="gray.100"
    position="sticky"
    left={0}
    zIndex={2}
    bg="white"
  >
    <Flex align="center" gap={3} minW={0}>
      <Avatar staff={staff} size={24} />
      <Text textStyle="sm" fontWeight={500} color={staff.isSubmitted ? "gray.800" : "gray.500"} flex={1} truncate>
        {staff.name}
      </Text>
      <StaffWarningIcon messages={warningMessages} />
    </Flex>
  </Box>
);

const RequestCell = ({
  staff,
  shifts,
  dates,
  confirmed,
}: {
  staff: StaffType;
  shifts: ShiftData[];
  dates: DateInfo[];
  confirmed: boolean;
}) => {
  const requestedDates = dates.filter(
    (date) =>
      date.inRange && hasDateOnlyRequest(shifts.find((shift) => shift.staffId === staff.id && shift.date === date.iso)),
  );

  return (
    <Box
      as="td"
      px={3}
      py={2}
      borderRightWidth="1px"
      borderBottomWidth="1px"
      borderColor="gray.100"
      position="sticky"
      left={`${STAFF_COL_WIDTH}px`}
      zIndex={2}
      bg="white"
    >
      <Flex align="center" gap={1} minW={0} wrap="wrap">
        {!staff.isSubmitted ? (
          <RequestBadge bg="#fef3c7" color="#b45309">
            未提出
          </RequestBadge>
        ) : requestedDates.length > 0 ? (
          requestedDates.map((date) => (
            <RequestBadge key={date.iso} bg="#ccfbf1" color="#0f766e">
              {formatDateShort(date.iso)}
            </RequestBadge>
          ))
        ) : (
          <RequestBadge bg="#f4f4f5" color="#71717a">
            {confirmed ? "勤務なし" : "希望なし"}
          </RequestBadge>
        )}
      </Flex>
    </Box>
  );
};

const RequestBadge = ({ bg, color, children }: { bg: string; color: string; children: ReactNode }) => (
  <Box
    flexShrink={0}
    px={2}
    py="2px"
    borderRadius="full"
    textStyle="2xs"
    fontWeight={600}
    style={{ color, background: bg }}
  >
    {children}
  </Box>
);

const DateOnlyCell = ({
  staff,
  date,
  assigned,
  requested,
  isClosed,
  isSortDate,
  isReadOnly,
  onToggle,
}: {
  staff: StaffType;
  date: DateInfo;
  assigned: boolean;
  requested: boolean;
  isClosed: boolean;
  isSortDate: boolean;
  isReadOnly: boolean;
  onToggle: () => void;
}) => (
  <Box
    as="td"
    p={0}
    borderRightWidth="1px"
    borderBottomWidth="1px"
    borderColor="gray.100"
    bg={isClosed ? "gray.50" : isSortDate ? "teal.50" : "white"}
  >
    <Box
      as="button"
      aria-label={`${staff.name} ${formatDateWithWeekday(date.iso)} ${
        !date.inRange ? "期間外" : assigned ? "勤務あり" : "勤務なし"
      }`}
      aria-disabled={isReadOnly || isClosed || !date.inRange}
      onClick={isReadOnly || isClosed || !date.inRange ? undefined : onToggle}
      w="calc(100% - 8px)"
      minH="34px"
      m="4px"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg={!date.inRange ? "gray.50" : assigned ? "teal.50" : requested ? "white" : "gray.50"}
      borderWidth="1px"
      borderColor={!date.inRange ? "gray.100" : assigned ? "teal.600" : requested ? "teal.200" : "gray.200"}
      borderRadius="md"
      color={assigned ? "teal.700" : !date.inRange || isClosed ? "gray.300" : "gray.400"}
      fontSize="xl"
      fontWeight={assigned ? 700 : 500}
      cursor={isReadOnly || isClosed || !date.inRange ? "default" : "pointer"}
      transition="background 0.12s ease, border-color 0.12s ease, color 0.12s ease"
      _hover={
        isReadOnly || isClosed || !date.inRange
          ? undefined
          : {
              bg: assigned ? "teal.100" : "gray.100",
              borderColor: assigned ? "teal.700" : "gray.400",
              color: assigned ? "teal.800" : "gray.500",
            }
      }
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
    >
      {!date.inRange || isClosed ? "-" : assigned ? "○" : "×"}
    </Box>
  </Box>
);
