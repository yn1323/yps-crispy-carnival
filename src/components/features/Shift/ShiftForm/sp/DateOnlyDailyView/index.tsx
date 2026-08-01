import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef } from "react";
import {
  formatDateShort,
  formatDateWithWeekday,
  getWeekdayLabel,
  isSaturday,
  isSunday,
} from "@/src/domains/shift/date";
import type { StaffType } from "@/src/domains/shift/types";
import { Avatar, DateIssueBadge, dateIssueBorderColor, StaffWarningIcon } from "../../components";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import { useScrollDateIntoView } from "../../hooks/useScrollDateIntoView";
import {
  dailySortedStaffsAtom,
  issueCountByDateAtom,
  selectDateWithDailyStaffOrderAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsAtom,
  toggleDateOnlyAssignmentAtom,
  warningCountByDateAtom,
  warningMessagesByStaffIdForSelectedDateAtom,
} from "../../stores";
import { buildSPDateOnlyDailyViewModel, type SPDateInfo, type SPDateOnlyStaffRowViewModel } from "./script";

const dayColor = (iso: string): string => {
  if (isSunday(iso)) return "red.500";
  if (isSaturday(iso)) return "blue.500";
  return "gray.700";
};

export const SPDateOnlyDailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const toggleAssignment = useSetAtom(toggleDateOnlyAssignmentAtom);
  const sortedStaffs = useAtomValue(dailySortedStaffsAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const warningMessagesByStaffId = useAtomValue(warningMessagesByStaffIdForSelectedDateAtom);

  const { dates, holidays, isReadOnly } = config;
  const isConfirmedDisplay = config.displayMode === "confirmed";
  const viewModel = useMemo(
    () =>
      buildSPDateOnlyDailyViewModel({
        dates,
        selectedDate,
        holidays,
        staffs: sortedStaffs,
        shifts,
        isConfirmedDisplay,
      }),
    [dates, holidays, isConfirmedDisplay, selectedDate, shifts, sortedStaffs],
  );
  const { activeDate, assignedCount, isInRange, isShopClosedDate, rows } = viewModel;
  useLockedDailyStaffOrder(activeDate);

  const handleToggle = useCallback(
    (staff: StaffType) => {
      toggleAssignment({ staff, date: activeDate });
    },
    [activeDate, toggleAssignment],
  );

  const handleDateSelect = useCallback(
    (iso: string) => {
      selectDate(iso);
    },
    [selectDate],
  );

  if (!activeDate) {
    return (
      <Flex flex={1} minH={0} align="center" justify="center" bg="gray.50" px={4}>
        <Text textStyle="sm" color="gray.500">
          表示できる日付がありません。
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" flex={1} minH={0} bg="gray.50">
      <DateRail
        dates={viewModel.dates}
        holidays={holidays}
        selectedDate={activeDate}
        issueCounts={issueCounts}
        warningCounts={warningCounts}
        onSelect={handleDateSelect}
      />

      <Box px={4} py={3} bg="white" borderBottomWidth="1px" borderColor="gray.200" flexShrink={0}>
        <Flex align="center" justify="space-between" gap={3}>
          <Box minW={0}>
            <Flex align="baseline" gap={2}>
              <Text textStyle="xl" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums">
                {formatDateShort(activeDate)}
              </Text>
              <Text textStyle="sm" fontWeight={600} color={dayColor(activeDate)}>
                {getWeekdayLabel(activeDate)}
              </Text>
              {!isInRange && <StatusBadge tone="muted">期間外</StatusBadge>}
              {isShopClosedDate && <StatusBadge tone="muted">定休日</StatusBadge>}
            </Flex>
          </Box>
          <Flex flexShrink={0} align="center" gap={2}>
            <SummaryPill label="合計" count={assignedCount} muted={!isInRange || isShopClosedDate} />
          </Flex>
        </Flex>
      </Box>

      <Box flex={1} minH={0} overflow="auto" px={3} py={3} data-tour="shift-grid">
        {!isInRange ? (
          <UnavailableState title="期間外" body="この日は募集期間外のため、割当は編集できません。" />
        ) : isShopClosedDate ? (
          <UnavailableState
            title="定休日"
            body="この日はお店のお休みとして設定されているため、割当は編集できません。"
          />
        ) : (
          <Stack gap={2}>
            {rows.map((row) => (
              <StaffToggleRow
                key={row.staff.id}
                row={row}
                activeDate={activeDate}
                isReadOnly={isReadOnly}
                warningMessages={warningMessagesByStaffId.get(row.staff.id) ?? []}
                onToggle={() => handleToggle(row.staff)}
              />
            ))}
          </Stack>
        )}
      </Box>
    </Flex>
  );
};

const DateRail = ({
  dates,
  holidays,
  selectedDate,
  issueCounts,
  warningCounts,
  onSelect,
}: {
  dates: SPDateInfo[];
  holidays: string[];
  selectedDate: string;
  issueCounts: ReadonlyMap<string, number>;
  warningCounts: ReadonlyMap<string, number>;
  onSelect: (iso: string) => void;
}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  useScrollDateIntoView(stripRef, selectedDate, "horizontal");

  return (
    <Box
      px={3}
      pt={3}
      pb={2}
      bg="white"
      borderBottomWidth="1px"
      borderColor="gray.100"
      flexShrink={0}
      data-tour="date-rail"
    >
      <Flex ref={stripRef} gap={2} overflow="auto" pt={2} pb={1}>
        {dates.map((date) => {
          const active = date.iso === selectedDate;
          const isClosed = date.inRange && holidays.includes(date.iso);
          const issueCount = issueCounts.get(date.iso) ?? 0;
          const warningCount = warningCounts.get(date.iso) ?? 0;
          const chipBorderColor = dateIssueBorderColor({
            active,
            issueCount,
            warningCount,
            activeColor: "teal.500",
            fallbackColor: "gray.200",
          });
          return (
            <Box
              as="button"
              key={date.iso}
              data-date-chip={date.iso}
              aria-label={`${formatDateWithWeekday(date.iso)}を表示`}
              aria-pressed={active}
              onClick={() => onSelect(date.iso)}
              position="relative"
              flexShrink={0}
              w="56px"
              minH="58px"
              py="7px"
              textAlign="center"
              borderRadius="md"
              borderWidth="1px"
              borderColor={chipBorderColor}
              bg={active ? "teal.50" : isClosed || !date.inRange ? "gray.50" : "white"}
              color={!date.inRange || isClosed ? "gray.400" : "gray.800"}
              cursor="pointer"
              _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
            >
              <DateIssueBadge issueCount={issueCount} warningCount={warningCount} />
              <Text
                textStyle="md"
                fontWeight={700}
                lineHeight="1.1"
                color={active ? "teal.700" : undefined}
                fontVariantNumeric="tabular-nums"
              >
                {formatDateShort(date.iso)}
              </Text>
              <Text
                textStyle="2xs"
                mt="2px"
                fontWeight={active ? 700 : 500}
                color={!date.inRange || isClosed ? "gray.400" : dayColor(date.iso)}
              >
                {getWeekdayLabel(date.iso)}
              </Text>
              {(isClosed || !date.inRange) && (
                <Text textStyle="2xs" mt="1px" fontWeight={700} color="gray.400">
                  {date.inRange ? "休" : "外"}
                </Text>
              )}
            </Box>
          );
        })}
      </Flex>
    </Box>
  );
};

const StaffToggleRow = ({
  row,
  activeDate,
  isReadOnly,
  warningMessages,
  onToggle,
}: {
  row: SPDateOnlyStaffRowViewModel;
  activeDate: string;
  isReadOnly: boolean;
  warningMessages: string[];
  onToggle: () => void;
}) => {
  return (
    <Flex bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="md" px={3} py={3} align="center" gap={3}>
      <Avatar staff={row.staff} size={28} />
      <Box flex={1} minW={0}>
        <Text textStyle="sm" fontWeight={600} color={row.isNameMuted ? "gray.500" : "gray.800"} truncate>
          {row.staff.name}
        </Text>
        <Flex mt={1} align="center" gap={2}>
          <StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge>
        </Flex>
      </Box>
      <StaffWarningIcon messages={warningMessages} />
      <Box
        as="button"
        aria-label={`${row.staff.name} ${formatDateWithWeekday(activeDate)} ${row.assigned ? "勤務あり" : "勤務なし"}`}
        aria-pressed={row.assigned}
        aria-disabled={isReadOnly}
        onClick={isReadOnly ? undefined : onToggle}
        w="56px"
        h="40px"
        flexShrink={0}
        borderRadius="md"
        borderWidth="1px"
        borderColor="gray.200"
        bg={row.assigned ? "teal.50" : row.requested ? "white" : "gray.50"}
        color={row.assigned ? "teal.700" : "gray.400"}
        fontSize="xl"
        fontWeight={row.assigned ? 700 : 500}
        cursor={isReadOnly ? "default" : "pointer"}
        _hover={
          isReadOnly
            ? undefined
            : {
                bg: row.assigned ? "teal.100" : "gray.100",
                borderColor: "gray.300",
              }
        }
        _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
      >
        {row.assigned ? "○" : "×"}
      </Box>
    </Flex>
  );
};

const SummaryPill = ({ label, count, muted = false }: { label: string; count: number; muted?: boolean }) => (
  <Flex
    align="baseline"
    gap="3px"
    px={2}
    py="4px"
    borderRadius="full"
    bg={muted ? "gray.100" : "teal.50"}
    color={muted ? "gray.500" : "teal.700"}
    fontWeight={700}
  >
    <Text textStyle="2xs">{label}</Text>
    <Text textStyle="sm" fontVariantNumeric="tabular-nums">
      {count}
    </Text>
    <Text textStyle="2xs">人</Text>
  </Flex>
);

const StatusBadge = ({ tone, children }: { tone: "positive" | "warning" | "muted"; children: ReactNode }) => {
  const styles = {
    positive: { bg: "#ccfbf1", color: "#0f766e" },
    warning: { bg: "#fef3c7", color: "#b45309" },
    muted: { bg: "#f4f4f5", color: "#71717a" },
  }[tone];

  return (
    <Box px={2} py="2px" borderRadius="full" textStyle="2xs" fontWeight={600} style={styles}>
      {children}
    </Box>
  );
};

const UnavailableState = ({ title, body }: { title: string; body: string }) => (
  <Flex minH="220px" align="center" justify="center" direction="column" gap={2} px={4}>
    <Text textStyle="md" fontWeight={700} color="gray.700">
      {title}
    </Text>
    <Text textStyle="sm" color="fg.muted" textAlign="center" lineHeight={1.7}>
      {body}
    </Text>
  </Flex>
);
