import { Box, chakra, Flex, Text } from "@chakra-ui/react";
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
import {
  ShiftDateNoteCornerMark,
  ShiftDateNoteText,
  ShiftDateNoteTooltip,
  ShiftStaffNoteIcon,
  useAllShiftDateNotes,
  type useShiftDateNotes,
} from "../../dateNotes";
import { DateSortToolbar } from "./DateSortToolbar";
import { buildRowWeekNotes, type DateOnlyRowNote } from "./script";
import type { DateInfo, DateOnlyColumn, DateOnlyRequestBadgeViewModel, DateOnlyRowViewModel } from "./types";

const STAFF_COL_WIDTH = 220;
const REQUEST_COL_WIDTH = 160;
const NOTE_COL_WIDTH = 240;
const DATE_COL_WIDTH = 92;
// メモ列を置く募集では、メモを読む幅を優先して日付列を詰める。
const DATE_COL_WIDTH_WITH_NOTES = 64;

type Props = {
  columns: DateOnlyColumn[];
  rows: DateOnlyRowViewModel[];
  sortableDates: DateInfo[];
  sortDate: string;
  isConfirmedDisplay: boolean;
  isReadOnly: boolean;
  onSortDateSelect: (date: string) => void;
  onToggle: (staff: StaffType, date: string) => void;
  dateNotes: ReturnType<typeof useShiftDateNotes>;
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
  dateNotes,
}: Props) => {
  const hasNotes = dateNotes.hasNotes;
  const allDateNotes = useAllShiftDateNotes();
  const dateColWidth = hasNotes ? DATE_COL_WIDTH_WITH_NOTES : DATE_COL_WIDTH;
  const tableMinWidth =
    STAFF_COL_WIDTH + REQUEST_COL_WIDTH + (hasNotes ? NOTE_COL_WIDTH : 0) + columns.length * dateColWidth;

  return (
    <Box minW={`${tableMinWidth}px`} bg="white" overflow="hidden">
      <DateSortToolbar
        dates={sortableDates}
        selectedDate={sortDate}
        onSelect={onSortDateSelect}
        noteCountByDate={dateNotes.countByDate}
      />
      <Box as="table" w="100%" style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
        <Box as="colgroup">
          <Box as="col" style={{ width: STAFF_COL_WIDTH }} />
          <Box as="col" style={{ width: REQUEST_COL_WIDTH }} />
          {hasNotes && <Box as="col" style={{ width: NOTE_COL_WIDTH }} />}
          {columns.map(({ date }) => (
            <Box as="col" key={date.iso} style={{ width: dateColWidth }} />
          ))}
        </Box>
        <Box as="thead">
          <Box as="tr" bg="gray.50">
            {/* 人数の行には日付列の人数だけを置き、左の見出しは2行分を結合する。 */}
            <StickyHeaderCell left={0} rowSpan={2}>
              ユーザー
            </StickyHeaderCell>
            <StickyHeaderCell left={STAFF_COL_WIDTH} rowSpan={2}>
              {isConfirmedDisplay ? "確定" : "希望"}
            </StickyHeaderCell>
            {hasNotes && (
              <StickyHeaderCell left={STAFF_COL_WIDTH + REQUEST_COL_WIDTH} rowSpan={2}>
                連絡事項
              </StickyHeaderCell>
            )}
            {columns.map(({ date, isClosed }) => (
              <DateHeaderCell key={date.iso} date={date} isClosed={isClosed} isSortDate={date.iso === sortDate} />
            ))}
          </Box>
          <Box as="tr">
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
              <StaffCell
                staff={row.staff}
                isNameMuted={row.isStaffNameMuted}
                warningMessages={row.warningMessages}
                weekNotes={buildRowWeekNotes(row.staff.id, columns, allDateNotes.getNote)}
              />
              <RequestCell badges={row.requestBadges} />
              {hasNotes && (
                <NoteListCell
                  staffName={row.staff.name}
                  notes={buildRowWeekNotes(row.staff.id, columns, dateNotes.getNote)}
                />
              )}
              {row.cells.map((cell) => (
                <DateOnlyCell
                  key={cell.date.iso}
                  note={dateNotes.getNote(row.staff.id, cell.date.iso)}
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

const StickyHeaderCell = ({ children, left, rowSpan }: { children?: ReactNode; left: number; rowSpan?: number }) => (
  <chakra.th
    rowSpan={rowSpan}
    position="sticky"
    left={`${left}px`}
    zIndex={4}
    px={3}
    py={2}
    textAlign="center"
    borderRightWidth="1px"
    borderBottomWidth="1px"
    borderColor="gray.200"
    bg="gray.50"
    color="gray.800"
    textStyle="xs"
    fontWeight={600}
  >
    {children}
  </chakra.th>
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
  weekNotes,
}: {
  staff: StaffType;
  isNameMuted: boolean;
  warningMessages: string[];
  weekNotes: DateOnlyRowNote[];
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
      <ShiftStaffNoteIcon notes={weekNotes} showDates />
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

/** 表示中の週のメモを、日付とともに1件1行で並べる。省略した分はホバーとキーボードfocusで全文を読む。 */
const NoteListCell = ({ staffName, notes }: { staffName: string; notes: DateOnlyRowNote[] }) => (
  <Box
    as="td"
    px={3}
    py={1.5}
    borderRightWidth="1px"
    borderBottomWidth="1px"
    borderColor="gray.100"
    position="sticky"
    left={`${STAFF_COL_WIDTH + REQUEST_COL_WIDTH}px`}
    zIndex={2}
    bg="white"
  >
    <Box as="ul" listStyleType="none">
      {notes.map(({ date, note }) => (
        <Flex as="li" key={date} gap={2} align="baseline" minW={0}>
          <Text
            textStyle="xs"
            fontWeight={700}
            color="gray.600"
            fontVariantNumeric="tabular-nums"
            flexShrink={0}
            minW="3em"
          >
            {formatDateShort(date)}
          </Text>
          <Box flex={1} minW={0}>
            <ShiftDateNoteText staffName={staffName} date={date} note={note} lineClamp={1} />
          </Box>
        </Flex>
      ))}
    </Box>
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
  note,
  staffName,
  date,
  assigned,
  requested,
  isClosed,
  isSortDate,
  isReadOnly,
  onToggle,
}: {
  note?: string;
  staffName: string;
  date: DateInfo;
  assigned: boolean;
  requested: boolean;
  isClosed: boolean;
  isSortDate: boolean;
  isReadOnly: boolean;
  onToggle: () => void;
}) => {
  const button = (
    <Box
      as="button"
      aria-label={`${staffName} ${formatDateWithWeekday(date.iso)} ${
        !date.inRange ? "期間外" : assigned ? "勤務あり" : "勤務なし"
      }${note ? "、メモあり" : ""}`}
      position="relative"
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
      borderColor={!date.inRange || isClosed ? "gray.100" : assigned ? "teal.600" : requested ? "teal.500" : "gray.200"}
      borderRadius="md"
      color={!date.inRange || isClosed ? "gray.300" : assigned ? "white" : "gray.400"}
      fontSize="xl"
      fontWeight={assigned ? 700 : 500}
      cursor={isReadOnly || isClosed || !date.inRange ? "default" : "pointer"}
      transitionProperty="colors"
      transitionDuration="faster"
      _hover={
        isReadOnly || isClosed || !date.inRange
          ? undefined
          : {
              bg: assigned ? "teal.600" : "gray.100",
              borderColor: assigned ? "teal.700" : requested ? "teal.600" : "gray.400",
              color: assigned ? "white" : "gray.500",
            }
      }
      _active={
        isReadOnly || isClosed || !date.inRange
          ? undefined
          : { bg: assigned ? "teal.600" : "gray.100", transitionDuration: "0ms" }
      }
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
    >
      {!date.inRange || isClosed ? "-" : assigned ? "○" : "×"}
      {note && <ShiftDateNoteCornerMark onFilled={assigned && date.inRange && !isClosed} />}
    </Box>
  );
  return (
    <Box
      as="td"
      p={0}
      borderRightWidth="1px"
      borderBottomWidth="1px"
      borderColor="gray.100"
      bg={isClosed ? "gray.50" : isSortDate ? "teal.50" : "white"}
    >
      {note ? (
        <ShiftDateNoteTooltip staffName={staffName} date={date.iso} note={note}>
          {button}
        </ShiftDateNoteTooltip>
      ) : (
        button
      )}
    </Box>
  );
};
