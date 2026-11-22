import { Box, chakra, Flex, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { indexShiftsByStaffId } from "@/src/domains/shift/shiftLookup";
import { AssignmentPill, FoldedStaffGroupToggle, PositionStaffingCount } from "../../assignmentCellParts";
import { Avatar, StaffWarningIcon } from "../../components";
import { ShiftStaffNoteIcon, useAllShiftDateNotes, useShiftDateNotes } from "../../dateNotes";
import { StaffMeta } from "../../detailParts";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import {
  buildShiftTypeDailyPresentation,
  buildShiftTypeStaffingPresentation,
  type ShiftTypeDailyCellPresentation,
  type ShiftTypeDailyOptionPresentation,
  type ShiftTypeDailyRowPresentation,
  type ShiftTypeStaffingPresentation,
  toShiftTypeWarningMessages,
} from "../../shiftTypeDailyPresentation";
import { useDayStaffingView } from "../../staffingParts";
import {
  assignShiftTypeAtom,
  changeShiftTypePositionAtom,
  dailySortedStaffsAtom,
  detailModeAtom,
  isPositionSelectableAtom,
  issueCountByDateAtom,
  removeShiftTypeAssignmentAtom,
  restoreRememberedWorkPositionAtom,
  selectDateWithDailyStaffOrderAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsForSelectedDateAtom,
  usesPositionColorsAtom,
  warningCountByDateAtom,
} from "../../stores";
import { DateRail } from "../DailyView/DateRail";
import { DayTitle } from "../DailyView/DayTitle";
import { PositionMenuCell } from "../PositionMenuCell";

const STAFF_COLUMN_WIDTH = 220;
const OPTION_COLUMN_MIN_WIDTH = 140;
// 連絡事項の列の幅。勤務パターンの列は、残りの横幅を等分する。
const NOTE_COLUMN_WIDTH = 280;
// 割り当ての前後で行の高さを変えないよう、行の高さを決めておく。
const ROW_HEIGHT = "52px";

export const ShiftTypeDailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shiftsForDate = useAtomValue(shiftsForSelectedDateAtom);
  const sortedStaffs = useAtomValue(dailySortedStaffsAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const allDateNotes = useAllShiftDateNotes();
  // 連絡事項の列は、表示設定で連絡事項を表示していて、募集期間に1件でもあるときに出す。日付を変えても列の有無を変えない。
  const showsNoteColumn = useShiftDateNotes().hasNotes;
  const detailMode = useAtomValue(detailModeAtom);
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  const isPositionSelectable = useAtomValue(isPositionSelectableAtom);
  const assign = useSetAtom(assignShiftTypeAtom);
  const changePosition = useSetAtom(changeShiftTypePositionAtom);
  const removeAssignment = useSetAtom(removeShiftTypeAssignmentAtom);
  // くわしく表示のときだけ値を持つ。シンプル表示、定休日、スタッフ向けの確定シフトではnullになる。
  const staffingView = useDayStaffingView(selectedDate);

  const { dates, holidays, isReadOnly, submissionPattern, shopId, positions } = config;
  const isConfirmedDisplay = config.displayMode === "confirmed";
  const isShopClosedDate = holidays.includes(selectedDate);

  // 前にこの店舗で最後に選んだポジションを、次に入れるポジションへ戻す。店舗とポジションが読み込まれてから行う。
  const restoreRememberedWorkPosition = useSetAtom(restoreRememberedWorkPositionAtom);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 店舗かポジションが変わったときに戻し直すため、値の変化を見る。
  useEffect(() => {
    restoreRememberedWorkPosition();
  }, [restoreRememberedWorkPosition, shopId, positions]);
  useLockedDailyStaffOrder(selectedDate);

  const presentation = useMemo(
    () =>
      buildShiftTypeDailyPresentation({
        submissionPattern,
        shifts: shiftsForDate,
        staffs: sortedStaffs,
        shiftByStaffId: indexShiftsByStaffId(shiftsForDate),
        isConfirmedDisplay,
        usesPositionColors,
        hasNote: (staffId) => allDateNotes.getNote(staffId, selectedDate) !== undefined,
      }),
    [
      allDateNotes,
      isConfirmedDisplay,
      selectedDate,
      shiftsForDate,
      sortedStaffs,
      submissionPattern,
      usesPositionColors,
    ],
  );
  const staffing = useMemo(
    () =>
      staffingView
        ? buildShiftTypeStaffingPresentation(
            staffingView,
            presentation.options.map(({ option }) => option),
          )
        : null,
    [presentation.options, staffingView],
  );
  // 充足率は、必要人数が1つでもある日にだけ出す。
  const fulfillment =
    staffing && staffing.percent !== null ? { percent: staffing.percent, isFulfilled: staffing.isFulfilled } : null;
  // テンプレートの選択は、必要人数のない日でも、店舗にテンプレートがあれば出す。その日にテンプレートを当てられるようにするためである。
  const showsTemplate =
    staffingView !== null && (staffingView.hasRequirements || (config.staffing?.templates.length ?? 0) > 0);

  // 休み希望のまとまりは、日付を変えるたびに閉じた状態へ戻す。
  const [openRestDate, setOpenRestDate] = useState<string | null>(null);
  const isRestOpen = openRestDate === selectedDate;

  const renderCell = (row: ShiftTypeDailyRowPresentation, cell: ShiftTypeDailyCellPresentation) => {
    if (isReadOnly) return <AssignmentPill cell={cell} size="pc" isInteractive={false} showsNoticeTooltip />;
    if (!cell.assigned) {
      return (
        <AssignmentPill
          cell={cell}
          size="pc"
          isInteractive
          showsNoticeTooltip
          onClick={() => assign({ staff: row.staff, date: selectedDate, option: cell.option })}
        />
      );
    }
    const remove = () => removeAssignment({ staffId: row.staff.id, date: selectedDate, optionId: cell.option.id });
    // ポジションを選び分けない表示（シンプル表示、ポジションが1つ以下の店舗）では、押すたびに付け外しする。
    if (!isPositionSelectable) {
      return <AssignmentPill cell={cell} size="pc" isInteractive showsNoticeTooltip onClick={remove} />;
    }
    return (
      <PositionMenuCell
        cell={cell}
        size="pc"
        positions={positions}
        onChangePosition={(positionId) =>
          changePosition({ staff: row.staff, date: selectedDate, option: cell.option, positionId })
        }
        onRemove={remove}
      />
    );
  };

  const renderRow = (row: ShiftTypeDailyRowPresentation) => (
    <Box as="tr" key={row.key} h={ROW_HEIGHT} borderTopWidth="1px" borderColor="gray.100">
      <StaffCell
        row={row}
        note={allDateNotes.getNote(row.staff.id, selectedDate)}
        date={selectedDate}
        detailMode={detailMode}
        hasNoteColumn={showsNoteColumn}
      />
      {row.cells.map((cell) => (
        <Box as="td" key={cell.key} px={2} py={0}>
          <Flex justify="center">{renderCell(row, cell)}</Flex>
        </Box>
      ))}
      {showsNoteColumn && <NoteCell note={allDateNotes.getNote(row.staff.id, selectedDate)} />}
    </Box>
  );

  return (
    <Flex flex={1} minH={0} overflow="hidden">
      <DateRail
        dates={dates}
        selectedDate={selectedDate}
        onSelect={selectDate}
        holidays={holidays}
        issueCounts={issueCounts}
        warningCounts={warningCounts}
      />
      <Flex direction="column" minW={0} minH={0} flex={1} overflow="hidden">
        <DayTitle
          date={selectedDate}
          holidays={holidays}
          positionControl="legend"
          showsTemplate={showsTemplate}
          fulfillment={fulfillment}
        />
        {isShopClosedDate ? (
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
            {/* 見出しの行を上端に留めるため、内側で切り取らない。 */}
            <Box
              minW={`${STAFF_COLUMN_WIDTH + presentation.options.length * OPTION_COLUMN_MIN_WIDTH + (showsNoteColumn ? NOTE_COLUMN_WIDTH : 0)}px`}
              bg="white"
            >
              <Box as="table" w="100%" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                <Box as="colgroup">
                  <Box as="col" style={{ width: STAFF_COLUMN_WIDTH }} />
                  {/* 勤務パターンの列は幅を決めず、残りの横幅を等分する。 */}
                  {presentation.options.map((option) => (
                    <Box as="col" key={option.key} />
                  ))}
                  {showsNoteColumn && <Box as="col" style={{ width: NOTE_COLUMN_WIDTH }} />}
                </Box>
                <Box as="thead" position="sticky" top={0} zIndex={3} bg="white" boxShadow="0 1px 0 #e5e7eb">
                  <Box as="tr">
                    <chakra.th px={4} py={2} textAlign="left" verticalAlign="bottom" textStyle="xs" fontWeight={600}>
                      <Text color="gray.600">スタッフ</Text>
                    </chakra.th>
                    {presentation.options.map((option) => (
                      <OptionHeader
                        key={option.key}
                        option={option}
                        staffing={staffing}
                        showsDot={usesPositionColors}
                      />
                    ))}
                    {showsNoteColumn && (
                      <chakra.th px={3} py={2} textAlign="left" verticalAlign="bottom" textStyle="xs" fontWeight={600}>
                        <Text color="gray.600">連絡事項</Text>
                      </chakra.th>
                    )}
                  </Box>
                </Box>
                <Box as="tbody">
                  {presentation.rows.map(renderRow)}
                  {presentation.restGroup && (
                    <Box as="tr" borderTopWidth="1px" borderColor="gray.100">
                      <chakra.td colSpan={presentation.options.length + 1 + (showsNoteColumn ? 1 : 0)} p={0}>
                        <FoldedStaffGroupToggle
                          group={presentation.restGroup}
                          isOpen={isRestOpen}
                          onToggle={() => setOpenRestDate(isRestOpen ? null : selectedDate)}
                        />
                      </chakra.td>
                    </Box>
                  )}
                  {isRestOpen && presentation.restGroup?.rows.map(renderRow)}
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </Flex>
    </Flex>
  );
};

/**
 * 勤務パターンの見出し。名前と時間の下に、シンプル表示では人数、くわしく表示ではポジションごとの「配置/必要」を出す。
 * 列ごとの色は付けない。色は、ポジションと、足りない・多いの状態だけに使う。
 */
const OptionHeader = ({
  option,
  staffing,
  showsDot,
}: {
  option: ShiftTypeDailyOptionPresentation;
  staffing: ShiftTypeStaffingPresentation | null;
  /** 色の丸を出すか。ポジションを塗り分けない表示では、凡例がないため出さない。 */
  showsDot: boolean;
}) => {
  // 必要人数がなく、だれも入っていないポジションは並べず、残りを中央に寄せる。
  // 空きとして残すと、ほかの勤務パターンより並ぶ数が少ない列で、分数が左へずれて見える。
  const counts = (staffing?.countsByOptionId.get(option.key) ?? []).filter((count) => count.label !== null);
  return (
    <chakra.th px={2} py={2} textAlign="center" verticalAlign="top" fontWeight={600}>
      <Box textStyle="sm" fontWeight={700} color="gray.800">
        {option.name}
      </Box>
      <Box textStyle="xs" color="gray.600" mt="2px" fontVariantNumeric="tabular-nums">
        {option.timeLabel}
      </Box>
      {staffing ? (
        // 出すポジションがない勤務パターンでも、行の高さを残して見出しの高さをそろえる。
        <Flex
          mt={1}
          minH="22px"
          align="center"
          justify="center"
          columnGap={3}
          rowGap={1}
          flexWrap="wrap"
          data-position-counts
        >
          {counts.map((count) => (
            <PositionStaffingCount key={count.positionId} count={count} showsDot={showsDot} />
          ))}
        </Flex>
      ) : (
        <Box mt={1} textStyle="xs" fontWeight={700} color="gray.700" fontVariantNumeric="tabular-nums">
          {option.countLabel}
        </Box>
      )}
    </chakra.th>
  );
};

const StaffCell = ({
  row,
  note,
  date,
  detailMode,
  hasNoteColumn,
}: {
  row: ShiftTypeDailyRowPresentation;
  note?: string;
  date: string;
  detailMode: boolean;
  hasNoteColumn: boolean;
}) => (
  <Box as="td" px={4} py={0}>
    <Flex align="center" gap={3} minW={0}>
      <Avatar staff={row.staff} size={24} />
      <Flex direction="column" justify="center" gap="2px" flex={1} minW={0}>
        <Text textStyle="sm" fontWeight={500} color={row.isNameMuted ? "gray.500" : "gray.800"} truncate>
          {row.staffName}
        </Text>
        {/* 仮の勤務は、名前の下の「仮」だけで示す。点線は希望の輪に使うためである。 */}
        {detailMode && <StaffMeta staff={row.staff} shift={row.shift} showTotal={false} />}
      </Flex>
      {row.isUnsubmitted && (
        <Text textStyle="2xs" fontWeight={600} flexShrink={0} style={{ color: "#b45309" }}>
          未提出
        </Text>
      )}
      {/* セルの右上の点と同じ確認事項を、名前の右でもまとめて知らせる。 */}
      <StaffWarningIcon messages={toShiftTypeWarningMessages(row)} />
      {/* 連絡事項の列を表示設定で隠したときだけ、名前の横のアイコンで知らせる。 */}
      {note && <ShiftStaffNoteIcon notes={[{ date, note }]} hasNoteColumn={hasNoteColumn} />}
    </Flex>
  </Box>
);

/** 選んだ日の連絡事項。行数は制限せず、全文を出す。 */
const NoteCell = ({ note }: { note?: string }) => (
  <Box as="td" px={3} py={note ? 2 : 0}>
    {note && (
      <Text textStyle="sm" lineHeight={1.6} color="gray.700" overflowWrap="anywhere" data-clarity-mask="true">
        {note}
      </Text>
    )}
  </Box>
);
