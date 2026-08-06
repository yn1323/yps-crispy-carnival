import { Box, Flex, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import {
  formatDateShort,
  formatDateWithWeekday,
  getWeekdayLabel,
  isSaturday,
  isSunday,
} from "@/src/domains/shift/date";
import type { StaffType } from "@/src/domains/shift/types";
import { Avatar, StaffWarningIcon } from "../../components";
import { DateSortToolbar } from "./DateSortToolbar";
import type { DateInfo, DateOnlyColumn, DateOnlyRequestBadgeViewModel, DateOnlyRowViewModel } from "./types";

const STAFF_COL_WIDTH = 220;
const REQUEST_COL_WIDTH = 160;
const DATE_COL_WIDTH = 92;

type Props = {
  columns: DateOnlyColumn[];
  rows: DateOnlyRowViewModel[];
  sortableDates: DateInfo[];
  sortDate: string;
  isConfirmedDisplay: boolean;
  isReadOnly: boolean;
  onSortDateSelect: (date: string) => void;
  onToggle: (staff: StaffType, date: string) => void;
};

export const DateOnlyTable = ({
  columns,
  rows,
  sortableDates,
  sortDate,
  isConfirmedDisplay,
  isReadOnly,
  onSortDateSelect,
  onToggle,
}: Props) => (
  <Box minW={`${STAFF_COL_WIDTH + REQUEST_COL_WIDTH + columns.length * DATE_COL_WIDTH}px`} bg="white" overflow="hidden">
    <DateSortToolbar dates={sortableDates} selectedDate={sortDate} onSelect={onSortDateSelect} />
    <Box as="table" w="100%" style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
      <Box as="colgroup">
        <Box as="col" style={{ width: STAFF_COL_WIDTH }} />
        <Box as="col" style={{ width: REQUEST_COL_WIDTH }} />
        {columns.map(({ date }) => (
          <Box as="col" key={date.iso} style={{ width: DATE_COL_WIDTH }} />
        ))}
      </Box>
      <Box as="thead">
        <Box as="tr" bg="gray.50">
          <StickyHeaderCell left={0}>ユーザー</StickyHeaderCell>
          <StickyHeaderCell left={STAFF_COL_WIDTH}>{isConfirmedDisplay ? "確定" : "希望"}</StickyHeaderCell>
          {columns.map(({ date, isClosed }) => (
            <DateHeaderCell key={date.iso} date={date} isClosed={isClosed} isSortDate={date.iso === sortDate} />
          ))}
        </Box>
        <Box as="tr">
          <StickyHeaderCell left={0} muted bg="gray.50">
            人数
          </StickyHeaderCell>
          <StickyHeaderCell left={STAFF_COL_WIDTH} muted bg="gray.50" />
          {columns.map(({ date, isClosed, assignmentCount }) => (
            <HeaderCell key={date.iso} muted bg={isClosed ? "gray.100" : "gray.50"}>
              <Text color={!date.inRange || isClosed ? "gray.400" : "teal.700"} fontWeight={700}>
                {!date.inRange ? "—" : isClosed ? "休" : `${assignmentCount}人`}
              </Text>
            </HeaderCell>
          ))}
        </Box>
      </Box>
      <Box as="tbody">
        {rows.map((row) => (
          <Box as="tr" key={row.staff.id}>
            <StaffCell staff={row.staff} isNameMuted={row.isStaffNameMuted} warningMessages={row.warningMessages} />
            <RequestCell badges={row.requestBadges} />
            {row.cells.map((cell) => (
              <DateOnlyCell
                key={cell.date.iso}
                staffName={row.staff.name}
                date={cell.date}
                assigned={cell.assigned}
                requested={cell.requested}
                isClosed={cell.isClosed}
                isSortDate={cell.date.iso === sortDate}
                isReadOnly={isReadOnly}
                onToggle={() => onToggle(row.staff, cell.date.iso)}
              />
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  </Box>
);

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
    <HeaderCell bg={isSortDate ? "teal.500" : isClosed ? "gray.100" : "gray.50"} active={isSortDate}>
      <Box
        textStyle="sm"
        color={isSortDate ? "white" : !date.inRange || isClosed ? "gray.400" : "gray.800"}
        fontWeight={700}
        fontVariantNumeric="tabular-nums"
      >
        {formatDateShort(date.iso)}
      </Box>
      <Box
        textStyle="caption"
        color={isSortDate ? "white" : !date.inRange || isClosed ? "gray.400" : color}
        mt="2px"
        fontWeight={600}
      >
        {getWeekdayLabel(date.iso)}
      </Box>
    </HeaderCell>
  );
};

const StaffCell = ({
  staff,
  isNameMuted,
  warningMessages,
}: {
  staff: StaffType;
  isNameMuted: boolean;
  warningMessages: string[];
}) => (
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
      <Text textStyle="sm" fontWeight={500} color={isNameMuted ? "gray.500" : "gray.800"} flex={1} truncate>
        {staff.name}
      </Text>
      <StaffWarningIcon messages={warningMessages} />
    </Flex>
  </Box>
);

const REQUEST_BADGE_COLORS = {
  warning: { bg: "#fef3c7", color: "#b45309" },
  requested: { bg: "#ccfbf1", color: "#0f766e" },
  muted: { bg: "#f4f4f5", color: "#71717a" },
} as const;

const RequestCell = ({ badges }: { badges: DateOnlyRequestBadgeViewModel[] }) => (
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
      {badges.map((badge) => {
        const colors = REQUEST_BADGE_COLORS[badge.tone];
        return (
          <RequestBadge key={badge.key} bg={colors.bg} color={colors.color}>
            {badge.label}
          </RequestBadge>
        );
      })}
    </Flex>
  </Box>
);

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
  staffName,
  date,
  assigned,
  requested,
  isClosed,
  isSortDate,
  isReadOnly,
  onToggle,
}: {
  staffName: string;
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
      aria-label={`${staffName} ${formatDateWithWeekday(date.iso)} ${
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
      bg={!date.inRange || isClosed ? "gray.50" : assigned ? "teal.500" : requested ? "white" : "gray.50"}
      borderWidth="1px"
      borderColor={!date.inRange || isClosed ? "gray.100" : assigned ? "teal.600" : "gray.200"}
      borderRadius="md"
      color={!date.inRange || isClosed ? "gray.300" : assigned ? "white" : "gray.400"}
      fontSize="xl"
      fontWeight={assigned ? 700 : 500}
      cursor={isReadOnly || isClosed || !date.inRange ? "default" : "pointer"}
      transition="background 0.12s ease, border-color 0.12s ease, color 0.12s ease"
      _hover={
        isReadOnly || isClosed || !date.inRange
          ? undefined
          : {
              bg: assigned ? "teal.600" : "gray.100",
              borderColor: assigned ? "teal.700" : "gray.400",
              color: assigned ? "white" : "gray.500",
            }
      }
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
    >
      {!date.inRange || isClosed ? "-" : assigned ? "○" : "×"}
    </Box>
  </Box>
);
