import { Box, chakra, Flex, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useMemo } from "react";
import type { ShiftTypeOptionLike } from "@/src/domains/shift/shiftTypeAssignments";
import type { StaffType } from "@/src/domains/shift/types";
import { Avatar, StaffWarningIcon } from "../../components";
import { ShiftDateNoteText, ShiftStaffNoteIcon, useAllShiftDateNotes, useShiftDateNotes } from "../../dateNotes";
import { BreakMark, PositionMark, SegmentSkillMark, StaffMeta } from "../../detailParts";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import type { ShiftTypeOptionColor } from "../../shiftTypeOptionStyles";
import { DayTemplateMenu, StaffingUnsetNote, useDayStaffingView } from "../../staffingParts";
import {
  dailySortedStaffsAtom,
  dayStaffingMarksByDateAtom,
  detailModeAtom,
  issueCountByDateAtom,
  selectDateWithDailyStaffOrderAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsForSelectedDateAtom,
  toggleShiftTypeAssignmentAtom,
  usesPositionColorsAtom,
  warningCountByDateAtom,
  warningMessagesByStaffIdForSelectedDateAtom,
} from "../../stores";
import { DateRail } from "../DailyView/DateRail";
import { DayTitle } from "../DailyView/DayTitle";
import { StaffingSlotCount } from "./StaffingSlotCount";
import {
  buildShiftTypeDailyViewModel,
  indexStaffingSlotsByOptionKey,
  type ShiftTypeDailyAssignmentCellViewModel,
  type ShiftTypeDailyRequestBadgeViewModel,
  type ShiftTypeDailyRowViewModel,
} from "./script";

// 勤務のあるセルにポジションと休憩を2行で出すため、くわしく表示ではセルを高くする。
const CELL_MIN_HEIGHT = "32px";
const DETAIL_CELL_MIN_HEIGHT = "44px";

export const ShiftTypeDailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shiftsForDate = useAtomValue(shiftsForSelectedDateAtom);
  const toggleAssignment = useSetAtom(toggleShiftTypeAssignmentAtom);
  const sortedStaffs = useAtomValue(dailySortedStaffsAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const staffingMarks = useAtomValue(dayStaffingMarksByDateAtom);
  const warningMessagesByStaffId = useAtomValue(warningMessagesByStaffIdForSelectedDateAtom);
  const dateNotes = useShiftDateNotes();
  const allDateNotes = useAllShiftDateNotes();
  const detailMode = useAtomValue(detailModeAtom);
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  // くわしく表示のときだけ値を持つ。シンプル表示と定休日ではnullになる。
  const staffingView = useDayStaffingView(selectedDate);
  const staffingSlotByOptionKey = useMemo(
    () => (staffingView ? indexStaffingSlotsByOptionKey(staffingView) : null),
    [staffingView],
  );

  const { dates, holidays, isReadOnly, submissionPattern } = config;
  const isConfirmedDisplay = config.displayMode === "confirmed";
  const viewModel = useMemo(
    () =>
      buildShiftTypeDailyViewModel({
        submissionPattern,
        shifts: shiftsForDate,
        staffs: sortedStaffs,
        selectedDate,
        holidays,
        isConfirmedDisplay,
        warningMessagesByStaffId,
        hasDateNotes: dateNotes.hasNotes,
        detailMode,
        usesPositionColors,
      }),
    [
      dateNotes.hasNotes,
      detailMode,
      holidays,
      isConfirmedDisplay,
      selectedDate,
      shiftsForDate,
      sortedStaffs,
      submissionPattern,
      usesPositionColors,
      warningMessagesByStaffId,
    ],
  );
  // 人数の行の左に置く見出しが、スタッフ・希望・連絡事項の列をまたぐ数。
  const leadingColumnCount = dateNotes.hasNotes ? 3 : 2;
  const leadingHeaderRowSpan = staffingView ? 1 : 2;
  useLockedDailyStaffOrder(selectedDate);

  const handleToggle = (staff: StaffType, option: ShiftTypeOptionLike) => {
    toggleAssignment({ staff, date: selectedDate, option });
  };

  return (
    <Flex flex={1} minH={0} overflow="hidden">
      <DateRail
        dates={dates}
        selectedDate={selectedDate}
        onSelect={selectDate}
        holidays={holidays}
        issueCounts={issueCounts}
        warningCounts={warningCounts}
        staffingMarks={staffingMarks}
      />
      <Flex direction="column" minW={0} minH={0} flex={1} overflow="hidden">
        <DayTitle date={selectedDate} holidays={holidays} />
        {viewModel.isShopClosedDate ? (
          <Flex flex={1} minH={0} bg="gray.50" align="center" justify="center" direction="column" gap={2} px={6}>
            <Text fontSize="md" fontWeight="bold" color="gray.700">
              定休日
            </Text>
            <Text fontSize="sm" color="fg.muted" textAlign="center">
              この日は店舗の定休日のため、シフトを登録できません。
            </Text>
          </Flex>
        ) : (
          <Box flex={1} minH={0} overflow="auto" bg="gray.50">
            {/* くわしく表示では人数の行を上端に留めるため、内側で切り取らない。 */}
            <Box minW={`${viewModel.minimumTableWidth}px`} bg="white" overflow={detailMode ? "visible" : "hidden"}>
              <Box as="table" w="100%" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                <Box as="colgroup">
                  <Box as="col" style={{ width: viewModel.columnWidths.staff }} />
                  <Box as="col" style={{ width: viewModel.columnWidths.request }} />
                  {viewModel.columnWidths.note !== null && (
                    <Box as="col" style={{ width: viewModel.columnWidths.note }} />
                  )}
                  {viewModel.optionColumns.map((option) => (
                    <Box as="col" key={option.key} style={{ width: viewModel.columnWidths.option }} />
                  ))}
                </Box>
                <Box as="thead" {...(detailMode ? STICKY_HEAD_PROPS : undefined)}>
                  <Box as="tr" bg="gray.50">
                    {/* 人数の行には勤務パターンごとの人数だけを置き、左の見出しは2行分を結合する。 */}
                    {/* くわしく表示では結合をやめ、人数の行の左に見出しと、その日のテンプレートのメニューを置く。 */}
                    <HeaderCell rowSpan={leadingHeaderRowSpan}>スタッフ</HeaderCell>
                    <HeaderCell rowSpan={leadingHeaderRowSpan}>{viewModel.requestHeaderLabel}</HeaderCell>
                    {dateNotes.hasNotes && <HeaderCell rowSpan={leadingHeaderRowSpan}>連絡事項</HeaderCell>}
                    {viewModel.optionColumns.map((option) => (
                      <HeaderCell key={option.key} optionColor={option.color}>
                        <Box fontWeight={700}>{option.name}</Box>
                        <Box textStyle="2xs" color={option.color.accent} mt="2px" fontVariantNumeric="tabular-nums">
                          {option.timeLabel}
                        </Box>
                      </HeaderCell>
                    ))}
                  </Box>
                  {staffingView && staffingSlotByOptionKey ? (
                    <Box as="tr">
                      <chakra.th
                        colSpan={leadingColumnCount}
                        px={4}
                        py={2}
                        bg="gray.50"
                        borderRightWidth="1px"
                        borderTopWidth="1px"
                        borderColor="gray.200"
                        textStyle="xs"
                        fontWeight={600}
                      >
                        <Flex align="center" justify="space-between" columnGap={2} rowGap={1} wrap="wrap">
                          <Flex align="center" gap={2} minW={0}>
                            <Text fontWeight={700} color="gray.700" whiteSpace="nowrap">
                              {staffingView.hasRequirements ? "人数 / 必要" : "人数"}
                            </Text>
                            {!staffingView.hasRequirements && <StaffingUnsetNote />}
                          </Flex>
                          <DayTemplateMenu date={selectedDate} view={staffingView} />
                        </Flex>
                      </chakra.th>
                      {viewModel.optionColumns.map((option) => {
                        const slot = staffingSlotByOptionKey.get(option.key);
                        return (
                          <HeaderCell key={option.key} optionColor={option.color} tone="count">
                            {slot ? <StaffingSlotCount slot={slot} /> : option.countLabel}
                          </HeaderCell>
                        );
                      })}
                    </Box>
                  ) : (
                    <Box as="tr">
                      {viewModel.optionColumns.map((option) => (
                        <HeaderCell key={option.key} optionColor={option.color} tone="count">
                          <Text color={option.color.accent} fontWeight={700}>
                            {option.countLabel}
                          </Text>
                        </HeaderCell>
                      ))}
                    </Box>
                  )}
                </Box>
                <Box as="tbody">
                  {viewModel.rows.map((row) => (
                    <Box as="tr" key={row.key} borderTopWidth="1px" borderColor="gray.100">
                      <StaffCell
                        row={row}
                        note={allDateNotes.getNote(row.staff.id, selectedDate)}
                        date={selectedDate}
                        detailMode={detailMode}
                      />
                      <RequestCell badges={row.requestBadges} />
                      {dateNotes.hasNotes && (
                        <NoteCell
                          note={dateNotes.getNote(row.staff.id, selectedDate)}
                          staffName={row.staffName}
                          date={selectedDate}
                        />
                      )}
                      {row.cells.map((cell) => (
                        <ShiftTypeCell
                          key={cell.key}
                          cell={cell}
                          staff={row.staff}
                          detailMode={detailMode}
                          usesPositionColors={usesPositionColors}
                          isReadOnly={isReadOnly}
                          onToggle={() => handleToggle(row.staff, cell.option)}
                        />
                      ))}
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </Flex>
    </Flex>
  );
};

// くわしく表示では、行を送っても人数と過不足が見えるよう、見出しを上端に留める。
const STICKY_HEAD_PROPS = {
  position: "sticky",
  top: 0,
  zIndex: 3,
  boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
} as const;

const HeaderCell = ({
  children,
  optionColor,
  tone = "header",
  rowSpan,
  bg,
}: {
  children?: ReactNode;
  optionColor?: ShiftTypeOptionColor;
  tone?: "header" | "count";
  rowSpan?: number;
  /** 不足のある列を示すなど、勤務パターンの色より優先する背景。 */
  bg?: string;
}) => (
  <chakra.th
    rowSpan={rowSpan}
    px={4}
    py={2}
    textAlign="center"
    borderRightWidth="1px"
    borderColor="gray.200"
    bg={bg ?? (optionColor ? (tone === "count" ? optionColor.countBg : optionColor.headerBg) : undefined)}
    color={optionColor ? optionColor.accent : "gray.800"}
    textStyle="xs"
    fontWeight={600}
    _last={{ borderRightWidth: 0 }}
  >
    {children}
  </chakra.th>
);

const StaffCell = ({
  row,
  note,
  date,
  detailMode,
}: {
  row: ShiftTypeDailyRowViewModel;
  note?: string;
  date: string;
  detailMode: boolean;
}) => (
  <Box as="td" px={4} py={2} borderRightWidth="1px" borderColor="gray.100">
    <Flex align="center" gap={3} minW={0}>
      <Avatar staff={row.staff} size={24} />
      {detailMode ? (
        // 名前を詰めないよう、熟練度・仮・合計は名前の下の2行目に置く。
        <Flex direction="column" justify="center" gap="2px" flex={1} minW={0}>
          <Text textStyle="sm" fontWeight={500} color={row.isStaffNameMuted ? "gray.500" : "gray.800"} truncate>
            {row.staffName}
          </Text>
          <StaffMeta staff={row.staff} shift={row.shift} />
        </Flex>
      ) : (
        <Text textStyle="sm" fontWeight={500} color={row.isStaffNameMuted ? "gray.500" : "gray.800"} flex={1} truncate>
          {row.staffName}
        </Text>
      )}
      <StaffWarningIcon messages={row.warningMessages} />
      {note && <ShiftStaffNoteIcon notes={[{ date, note }]} />}
    </Flex>
  </Box>
);

const RequestCell = ({ badges }: { badges: ShiftTypeDailyRequestBadgeViewModel[] }) => (
  <Box as="td" px={4} py={2} borderRightWidth="1px" borderColor="gray.100">
    <Flex align="center" gap={1} minW={0} wrap="wrap">
      {badges.map((badge) => (
        <RequestBadge key={badge.key} bg={badge.bg} color={badge.color}>
          {badge.label}
        </RequestBadge>
      ))}
    </Flex>
  </Box>
);

/** 時間指定の日別表示のメモ列と同じく、上下の余白を詰めて2行まで表示する。 */
const NoteCell = ({ note, staffName, date }: { note?: string; staffName: string; date: string }) => (
  <Box as="td" px={3} py="4px" borderRightWidth="1px" borderColor="gray.100">
    {note && <ShiftDateNoteText staffName={staffName} date={date} note={note} lineClamp={2} />}
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

const ShiftTypeCell = ({
  cell,
  staff,
  detailMode,
  usesPositionColors,
  isReadOnly,
  onToggle,
}: {
  cell: ShiftTypeDailyAssignmentCellViewModel;
  staff: StaffType;
  detailMode: boolean;
  usesPositionColors: boolean;
  isReadOnly: boolean;
  onToggle: () => void;
}) => (
  <Box as="td" p={0} borderRightWidth="1px" borderColor="gray.100" _last={{ borderRightWidth: 0 }}>
    <Box
      as="button"
      aria-label={cell.ariaLabel}
      aria-disabled={isReadOnly}
      onClick={isReadOnly ? undefined : onToggle}
      w="calc(100% - 8px)"
      minH={detailMode ? DETAIL_CELL_MIN_HEIGHT : CELL_MIN_HEIGHT}
      m="4px"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg={cell.assigned ? cell.color.assignedBg : "white"}
      borderWidth="1px"
      borderColor={cell.assigned ? cell.color.accent : "gray.200"}
      // 仮の勤務は、点線の枠で確定前の候補であることを示す。
      borderStyle={detailMode && cell.isProvisional ? "dashed" : undefined}
      borderRadius="md"
      color={cell.assigned ? cell.color.accent : "gray.400"}
      fontSize="xl"
      fontWeight={cell.assigned ? 700 : 500}
      cursor={isReadOnly ? "default" : "pointer"}
      position="relative"
      isolation="isolate"
      overflow="hidden"
      transitionProperty="colors"
      transitionDuration="faster"
      _before={
        cell.assigned
          ? {
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
            }
          : undefined
      }
      _hover={
        isReadOnly
          ? undefined
          : {
              bg: cell.assigned ? cell.color.headerBg : "gray.50",
              borderColor: cell.assigned ? cell.color.accent : "gray.400",
              color: cell.assigned ? cell.color.accent : "gray.500",
            }
      }
      _active={
        isReadOnly
          ? undefined
          : cell.assigned
            ? { _before: { opacity: 1, transitionDuration: "0ms" } }
            : { bg: "gray.100", transitionDuration: "0ms" }
      }
      _focusVisible={{ outline: "2px solid", outlineColor: cell.color.accent, outlineOffset: "1px" }}
    >
      {detailMode && cell.assigned ? (
        // 勤務パターンの色は面に残し、ポジションは色の丸と名前で、休憩は時刻で示す。
        <Flex direction="column" align="center" justify="center" gap="3px" minW={0} maxW="100%" px={2}>
          {usesPositionColors && cell.segment ? (
            <Flex maxW="100%" minW={0} color="gray.800">
              <PositionMark segment={cell.segment} staff={staff} />
            </Flex>
          ) : (
            // ポジションが1つの店舗では、記号の横に熟練度の印だけを添える。
            <Flex as="span" align="center" gap="4px" lineHeight={1}>
              {cell.symbol}
              <SegmentSkillMark staff={staff} segment={cell.segment} />
            </Flex>
          )}
          <BreakMark shift={cell.breakShift} />
        </Flex>
      ) : (
        cell.symbol
      )}
    </Box>
  </Box>
);
