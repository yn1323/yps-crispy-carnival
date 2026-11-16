import { Box, chakra, Flex, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import {
  formatDateShort,
  formatDateWithWeekday,
  getWeekdayLabel,
  isSaturday,
  isSunday,
} from "@/src/domains/shift/date";
import type { PositionSegment, ShiftData, StaffType } from "@/src/domains/shift/types";
import { Avatar, StaffWarningIcon } from "../../components";
import {
  ShiftDateNoteCornerMark,
  ShiftDateNoteText,
  ShiftDateNoteTooltip,
  ShiftStaffNoteIcon,
  useAllShiftDateNotes,
  type useShiftDateNotes,
} from "../../dateNotes";
import { BreakMark, SegmentSkillMark, StaffMeta } from "../../detailParts";
import type { DayStaffingView } from "../../staffingPresentation";
import { DateStaffingCell, StaffingRowLabel } from "./DateStaffingCell";
import { buildRowWeekNotes, type DateOnlyRowNote } from "./script";
import type { DateInfo, DateOnlyColumn, DateOnlyRequestBadgeViewModel, DateOnlyRowViewModel } from "./types";
import { WeekPeriodBar } from "./WeekPeriodBar";

const STAFF_COL_WIDTH = 220;
const REQUEST_COL_WIDTH = 160;
const NOTE_COL_WIDTH = 240;
const DATE_COL_WIDTH = 92;
// メモ列を置く募集では、メモを読む幅を優先して日付列を詰める。
const DATE_COL_WIDTH_WITH_NOTES = 64;
// 勤務のあるセルにポジションと休憩を縦に並べるため、くわしく表示ではセルを高くする。
const CELL_MIN_HEIGHT = "34px";
const DETAIL_CELL_MIN_HEIGHT = "40px";
// くわしく表示では、行を送っても人数と過不足が見えるよう、見出しを上端に留める。
const STICKY_HEAD_PROPS = {
  position: "sticky",
  top: 0,
  zIndex: 5,
  boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
} as const;

type Props = {
  columns: DateOnlyColumn[];
  rows: DateOnlyRowViewModel[];
  periodLabel: string;
  sortableDates: DateInfo[];
  sortDate: string;
  isConfirmedDisplay: boolean;
  isReadOnly: boolean;
  /** くわしく表示かどうか。falseのときは従来の表と同じ内容を出す。 */
  detailMode: boolean;
  /** ポジションを塗り分ける表示（くわしく表示で、ポジションが2つ以上）かどうか。 */
  usesPositionColors: boolean;
  /** 日付ごとの人数と過不足。くわしく表示のときだけ渡す。 */
  staffingByDate: ReadonlyMap<string, DayStaffingView> | null;
  onSortDateSelect: (date: string) => void;
  onToggle: (staff: StaffType, date: string) => void;
  dateNotes: ReturnType<typeof useShiftDateNotes>;
};

export const DateOnlyTable = ({
  columns,
  rows,
  periodLabel,
  sortableDates,
  sortDate,
  isConfirmedDisplay,
  isReadOnly,
  detailMode,
  usesPositionColors,
  staffingByDate,
  onSortDateSelect,
  onToggle,
  dateNotes,
}: Props) => {
  const hasNotes = dateNotes.hasNotes;
  const allDateNotes = useAllShiftDateNotes();
  const sortableDateSet = new Set(sortableDates.map((date) => date.iso));
  const dateColWidth = hasNotes ? DATE_COL_WIDTH_WITH_NOTES : DATE_COL_WIDTH;
  const tableMinWidth =
    STAFF_COL_WIDTH + REQUEST_COL_WIDTH + (hasNotes ? NOTE_COL_WIDTH : 0) + columns.length * dateColWidth;
  const leadingHeaderRowSpan = staffingByDate ? 1 : 2;

  return (
    // くわしく表示では見出しを上端に留めるため、内側で切り取らない。
    <Box minW={`${tableMinWidth}px`} bg="white" overflow={detailMode ? "visible" : "hidden"}>
      <WeekPeriodBar periodLabel={periodLabel} />
      <Box as="table" w="100%" style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
        <Box as="colgroup">
          <Box as="col" style={{ width: STAFF_COL_WIDTH }} />
          <Box as="col" style={{ width: REQUEST_COL_WIDTH }} />
          {hasNotes && <Box as="col" style={{ width: NOTE_COL_WIDTH }} />}
          {columns.map(({ date }) => (
            <Box as="col" key={date.iso} style={{ width: dateColWidth }} />
          ))}
        </Box>
        <Box as="thead" {...(detailMode ? STICKY_HEAD_PROPS : undefined)}>
          <Box as="tr" bg="gray.50">
            {/* 人数の行には日付列の人数だけを置き、左の見出しは2行分を結合する。 */}
            {/* くわしく表示では結合をやめ、人数の行の左に見出しを置く。 */}
            <StickyHeaderCell left={0} rowSpan={leadingHeaderRowSpan}>
              ユーザー
            </StickyHeaderCell>
            <StickyHeaderCell left={STAFF_COL_WIDTH} rowSpan={leadingHeaderRowSpan}>
              {isConfirmedDisplay ? "確定" : "希望"}
            </StickyHeaderCell>
            {hasNotes && (
              <StickyHeaderCell left={STAFF_COL_WIDTH + REQUEST_COL_WIDTH} rowSpan={leadingHeaderRowSpan}>
                連絡事項
              </StickyHeaderCell>
            )}
            {columns.map(({ date, isClosed }) => (
              <DateHeaderCell
                key={date.iso}
                date={date}
                isClosed={isClosed}
                isSortDate={date.iso === sortDate}
                isSortable={sortableDateSet.has(date.iso)}
                noteCount={dateNotes.countByDate.get(date.iso) ?? 0}
                onSort={() => onSortDateSelect(date.iso)}
              />
            ))}
          </Box>
          <Box as="tr">
            {staffingByDate && (
              <StickyHeaderCell left={0} colSpan={hasNotes ? 3 : 2}>
                <StaffingRowLabel />
              </StickyHeaderCell>
            )}
            {columns.map(({ date, isClosed, assignmentCount }) => {
              const staffingView = staffingByDate?.get(date.iso);
              return staffingView ? (
                <HeaderCell key={date.iso} muted bg="gray.50" flush>
                  <DateStaffingCell date={date.iso} view={staffingView} />
                </HeaderCell>
              ) : (
                <HeaderCell key={date.iso} muted bg={isClosed ? "gray.100" : "gray.50"}>
                  <Text color={!date.inRange || isClosed ? "gray.400" : "teal.700"} fontWeight={700}>
                    {!date.inRange ? "—" : isClosed ? "休" : `${assignmentCount}人`}
                  </Text>
                </HeaderCell>
              );
            })}
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
                detailMode={detailMode}
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
                  detailMode={detailMode}
                  positionSegment={usesPositionColors ? cell.segment : undefined}
                  skillMark={<SegmentSkillMark staff={row.staff} segment={cell.segment} />}
                  breakShift={detailMode ? cell.breakShift : undefined}
                  isProvisional={detailMode && cell.isProvisional}
                  isNarrow={hasNotes}
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
  flush = false,
}: {
  children?: ReactNode;
  muted?: boolean;
  bg?: string;
  active?: boolean;
  /** 中のボタンでセル全体を押せるよう、セル自身の余白をなくす。 */
  flush?: boolean;
}) => (
  <Box
    as="th"
    px={flush ? 0 : 3}
    py={flush ? 0 : 2}
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
  rowSpan,
  colSpan,
}: {
  children?: ReactNode;
  left: number;
  rowSpan?: number;
  colSpan?: number;
}) => (
  <chakra.th
    rowSpan={rowSpan}
    colSpan={colSpan}
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

/** 並べ替えられる日付の見出しは、押すとその日の希望で行を並べ替えるボタンにする。 */
const DateHeaderCell = ({
  date,
  isClosed,
  isSortDate,
  isSortable,
  noteCount,
  onSort,
}: {
  date: DateInfo;
  isClosed: boolean;
  isSortDate: boolean;
  isSortable: boolean;
  noteCount: number;
  onSort: () => void;
}) => {
  const color = isSunday(date.iso) ? "red.500" : isSaturday(date.iso) ? "blue.500" : "gray.700";
  const label = (
    <>
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
    </>
  );
  return (
    <HeaderCell bg={isSortDate ? "teal.500" : isClosed ? "gray.100" : "gray.50"} active={isSortDate} flush={isSortable}>
      {isSortable ? (
        <chakra.button
          type="button"
          aria-label={`${formatDateWithWeekday(date.iso)}で並べ替える${noteCount > 0 ? `、連絡事項${noteCount}件` : ""}`}
          aria-pressed={isSortDate}
          onClick={onSort}
          display="block"
          w="full"
          px={3}
          py={2}
          cursor="pointer"
          transitionProperty="background"
          transitionDuration="faster"
          _hover={{ bg: isSortDate ? "teal.600" : "gray.100" }}
          _active={{ bg: isSortDate ? "teal.700" : "gray.200", transitionDuration: "0ms" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
        >
          {label}
        </chakra.button>
      ) : (
        label
      )}
    </HeaderCell>
  );
};

const StaffCell = ({
  staff,
  isNameMuted,
  warningMessages,
  weekNotes,
  detailMode,
}: {
  staff: StaffType;
  isNameMuted: boolean;
  warningMessages: string[];
  weekNotes: DateOnlyRowNote[];
  detailMode: boolean;
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
      {detailMode ? (
        // 名前を詰めないよう、熟練度と出勤日数の合計は名前の下の2行目に置く。
        <Flex direction="column" justify="center" gap="2px" flex={1} minW={0}>
          <Text textStyle="sm" fontWeight={500} color={isNameMuted ? "gray.500" : "gray.800"} truncate>
            {staff.name}
          </Text>
          <StaffMeta staff={staff} />
        </Flex>
      ) : (
        <Text textStyle="sm" fontWeight={500} color={isNameMuted ? "gray.500" : "gray.800"} flex={1} truncate>
          {staff.name}
        </Text>
      )}
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

const COLORED_CELL_STATE_LAYER = {
  content: '""',
  position: "absolute",
  inset: 0,
  zIndex: -1,
  borderRadius: "inherit",
  bg: "blackAlpha.200",
  opacity: 0,
  pointerEvents: "none",
  transitionProperty: "opacity",
  transitionDuration: "faster",
} as const;

const PROVISIONAL_OUTLINE_PROPS = {
  outline: "1.5px dashed rgba(255,255,255,0.9)",
  outlineOffset: "-4px",
} as const;

const DateOnlyCell = ({
  note,
  staffName,
  date,
  assigned,
  requested,
  isClosed,
  isSortDate,
  isReadOnly,
  detailMode,
  positionSegment,
  skillMark,
  breakShift,
  isProvisional,
  isNarrow,
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
  detailMode: boolean;
  /** ポジションを塗り分ける表示のときだけ渡す、その日の勤務。 */
  positionSegment?: PositionSegment;
  /** その日のポジションでの熟練度の印（新・責）。くわしく表示の、勤務のある日にだけ出す。 */
  skillMark: ReactNode;
  /** くわしく表示で、休憩のある勤務の日だけ渡す。 */
  breakShift?: ShiftData;
  /** くわしく表示で、前回の勤務を仮で入れた日だけtrueにする。 */
  isProvisional: boolean;
  /** 連絡事項の列があり、日付の列を詰めているかどうか。 */
  isNarrow: boolean;
  onToggle: () => void;
}) => {
  const isAssignedCell = date.inRange && !isClosed && assigned;
  // ポジションを塗り分ける表示では、勤務のあるセルをポジションの色で塗る。
  const coloredSegment = isAssignedCell ? positionSegment : undefined;
  const visibleBreakShift = isAssignedCell ? breakShift : undefined;
  const button = (
    <Box
      as="button"
      aria-label={`${staffName} ${formatDateWithWeekday(date.iso)} ${
        !date.inRange ? "期間外" : assigned ? "勤務あり" : "勤務なし"
      }${coloredSegment ? `、${coloredSegment.positionName}` : ""}${visibleBreakShift ? "、休憩あり" : ""}${
        note ? "、連絡事項あり" : ""
      }`}
      position="relative"
      aria-disabled={isReadOnly || isClosed || !date.inRange}
      onClick={isReadOnly || isClosed || !date.inRange ? undefined : onToggle}
      w="calc(100% - 8px)"
      minH={detailMode ? DETAIL_CELL_MIN_HEIGHT : CELL_MIN_HEIGHT}
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
      // 仮の勤務は、内側の点線で確定前の候補であることを示す。
      {...(isProvisional && isAssignedCell ? PROVISIONAL_OUTLINE_PROPS : undefined)}
      {...(coloredSegment
        ? {
            // ポジションの色は店舗ごとに違うため、押せる手掛かりは色を変えず、暗い面を重ねて示す。
            style: { background: coloredSegment.color, borderColor: coloredSegment.color },
            isolation: "isolate",
            overflow: "hidden",
            _before: COLORED_CELL_STATE_LAYER,
          }
        : undefined)}
      _hover={
        isReadOnly || isClosed || !date.inRange
          ? undefined
          : coloredSegment
            ? { _before: { opacity: 0.5 } }
            : {
                bg: assigned ? "teal.600" : "gray.100",
                borderColor: assigned ? "teal.700" : requested ? "teal.600" : "gray.400",
                color: assigned ? "white" : "gray.500",
              }
      }
      _active={
        isReadOnly || isClosed || !date.inRange
          ? undefined
          : coloredSegment
            ? { _before: { opacity: 1, transitionDuration: "0ms" } }
            : { bg: assigned ? "teal.600" : "gray.100", transitionDuration: "0ms" }
      }
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
    >
      {detailMode && isAssignedCell ? (
        <Flex direction="column" align="center" justify="center" gap="2px" minW={0} maxW="100%" px="4px">
          {coloredSegment ? (
            // セルをポジションの色で塗っているため、色の丸は添えず、名前だけを出す。熟練度の印は名前の右に添える。
            <Flex as="span" align="center" gap="3px" maxW="100%" minW={0}>
              <Box as="span" minW={0} textStyle={isNarrow ? "2xs" : "xs"} fontWeight={700} truncate>
                {coloredSegment.positionName}
              </Box>
              {skillMark}
            </Flex>
          ) : (
            <Flex as="span" align="center" gap="4px" lineHeight={1}>
              ○{skillMark}
            </Flex>
          )}
          {visibleBreakShift && (
            // 休憩の印は、色の付いた面の上でも見えるよう白い丸に載せる。
            <Flex as="span" bg="white" borderRadius="full" p="1px">
              <BreakMark shift={visibleBreakShift} compact />
            </Flex>
          )}
        </Flex>
      ) : !date.inRange || isClosed ? (
        "-"
      ) : assigned ? (
        "○"
      ) : (
        "×"
      )}
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
