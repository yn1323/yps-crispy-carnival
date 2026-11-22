import { Box, chakra, Flex, Icon, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { getWeekdayLabel } from "@/src/domains/shift/date";
import { indexShiftsByStaffId } from "@/src/domains/shift/shiftLookup";
import {
  AssignmentDotLegend,
  AssignmentPill,
  FoldedStaffGroupToggle,
  FulfillmentLabel,
  PositionStaffingCount,
} from "../../assignmentCellParts";
import { ChromeCollapse } from "../../ChromeCollapse";
import { DateIssueBadge, dateIssueBorderColor } from "../../components";
import { DisplaySettingsMenu } from "../../DisplaySettingsMenu";
import { ShiftStaffNoteIcon, useAllShiftDateNotes } from "../../dateNotes";
import { StaffMeta } from "../../detailParts";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import { useScrollDateIntoView } from "../../hooks/useScrollDateIntoView";
import {
  buildShiftTypeDailyPresentation,
  buildShiftTypeStaffingPresentation,
  type ShiftTypeDailyCellPresentation,
  type ShiftTypeDailyOptionPresentation,
  type ShiftTypeDailyRowPresentation,
  type ShiftTypeStaffingPresentation,
} from "../../shiftTypeDailyPresentation";
import { DayTemplateMenu, useDayStaffingView } from "../../staffingParts";
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
import { getShiftWeekdayColor } from "../../weekdayPresentation";
import { PositionDialog } from "../PositionDialog";

// 勤務パターンは最大4つ。幅375pxでも横スクロールにならないよう、スタッフの列を狭くする。
const STAFF_COLUMN_WIDTH = "84px";
// 割り当ての前後で行の高さを変えないよう、行の高さを決めておく。
const ROW_HEIGHT = "52px";

type PositionDialogTarget = { row: ShiftTypeDailyRowPresentation; optionId: string };

export const SPShiftTypeDailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shiftsForDate = useAtomValue(shiftsForSelectedDateAtom);
  const sortedStaffs = useAtomValue(dailySortedStaffsAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const detailMode = useAtomValue(detailModeAtom);
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  const isPositionSelectable = useAtomValue(isPositionSelectableAtom);
  const assign = useSetAtom(assignShiftTypeAtom);
  const changePosition = useSetAtom(changeShiftTypePositionAtom);
  const removeAssignment = useSetAtom(removeShiftTypeAssignmentAtom);
  // 人数と過不足を出す日（くわしく表示の営業日）だけ値が入る。
  const staffingView = useDayStaffingView(selectedDate);
  const dateNotes = useAllShiftDateNotes();

  const { dates, holidays, isReadOnly, submissionPattern, shopId, positions } = config;
  const isConfirmedDisplay = config.displayMode === "confirmed";
  const isShopClosedDate = holidays.includes(selectedDate);
  const selectedDay = selectedDate ? dayjs(selectedDate) : null;
  const dateStripRef = useRef<HTMLDivElement>(null);
  useScrollDateIntoView(dateStripRef, selectedDate, "horizontal");
  useLockedDailyStaffOrder(selectedDate);

  // 前にこの店舗で最後に選んだポジションを、次に入れるポジションへ戻す。店舗とポジションが読み込まれてから行う。
  const restoreRememberedWorkPosition = useSetAtom(restoreRememberedWorkPositionAtom);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 店舗かポジションが変わったときに戻し直すため、値の変化を見る。
  useEffect(() => {
    restoreRememberedWorkPosition();
  }, [restoreRememberedWorkPosition, shopId, positions]);

  const presentation = useMemo(
    () =>
      buildShiftTypeDailyPresentation({
        submissionPattern,
        shifts: shiftsForDate,
        staffs: sortedStaffs,
        shiftByStaffId: indexShiftsByStaffId(shiftsForDate),
        isConfirmedDisplay,
        usesPositionColors,
        hasNote: (staffId) => dateNotes.getNote(staffId, selectedDate) !== undefined,
      }),
    [dateNotes, isConfirmedDisplay, selectedDate, shiftsForDate, sortedStaffs, submissionPattern, usesPositionColors],
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
  // テンプレートの選択は、必要人数のない日でも、店舗にテンプレートがあれば出す。
  const showsTemplate =
    staffingView !== null && (staffingView.hasRequirements || (config.staffing?.templates.length ?? 0) > 0);
  // 充足の欄は、必要人数が1つでもある日にだけ出す。
  const showsFulfillment = staffing !== null && staffing.percent !== null;

  // 休み希望のまとまりは、日付を変えるたびに閉じた状態へ戻す。
  const [openRestDate, setOpenRestDate] = useState<string | null>(null);
  const isRestOpen = openRestDate === selectedDate;
  const [dialogTarget, setDialogTarget] = useState<PositionDialogTarget | null>(null);
  // モーダルは、開いた時点の行ではなく、いまの表示内容から作る。ポジションを変えた直後の状態を出すためである。
  const allRows = [...presentation.rows, ...(presentation.restGroup?.rows ?? [])];
  const dialogRow = dialogTarget ? allRows.find((row) => row.key === dialogTarget.row.key) : undefined;
  const dialogCell = dialogRow?.cells.find((cell) => cell.key === dialogTarget?.optionId);
  // ピルを押してもモーダルが開かない表示（シンプル表示、ポジションが1つ以下の店舗、閲覧専用）では、理由を出す場所がない。
  // 点のある日だけ、表の下に点の意味を出す。
  const showsDotLegend = !isPositionSelectable && allRows.some((row) => row.cells.some((cell) => cell.dot !== null));

  const handleCellClick = (row: ShiftTypeDailyRowPresentation, cell: ShiftTypeDailyCellPresentation) => {
    if (!cell.assigned) {
      assign({ staff: row.staff, date: selectedDate, option: cell.option });
      return;
    }
    // ポジションを選び分けない表示（シンプル表示、ポジションが1つ以下の店舗）では、押すたびに付け外しする。
    if (!isPositionSelectable) {
      removeAssignment({ staffId: row.staff.id, date: selectedDate, optionId: cell.option.id });
      return;
    }
    setDialogTarget({ row, optionId: cell.option.id });
  };

  const renderRow = (row: ShiftTypeDailyRowPresentation) => (
    <Box as="tr" key={row.key} h={ROW_HEIGHT} borderTopWidth="1px" borderColor="gray.100">
      <StaffCell
        row={row}
        note={dateNotes.getNote(row.staff.id, selectedDate)}
        date={selectedDate}
        detailMode={detailMode}
      />
      {row.cells.map((cell) => (
        <Box as="td" key={cell.key} px="2px" py={0}>
          <Flex justify="center">
            <AssignmentPill
              cell={cell}
              size="sp"
              isInteractive={!isReadOnly}
              onClick={isReadOnly ? undefined : () => handleCellClick(row, cell)}
            />
          </Flex>
        </Box>
      ))}
    </Box>
  );

  return (
    <Flex direction="column" flex={1} minH={0}>
      {/* 日付の一覧は、表を下へスクロールすると上の行と一緒に隠す。日付の見出しは残す。 */}
      <ChromeCollapse>
        <Box px={3} pt={3} pb={2} bg="white" borderBottomWidth="1px" borderColor="gray.100">
          <Flex ref={dateStripRef} gap={2} overflow="auto" pt={2} pb={1}>
            {dates.map((iso) => {
              const date = dayjs(iso);
              const active = iso === selectedDate;
              const isClosed = holidays.includes(iso);
              const issueCount = issueCounts.get(iso) ?? 0;
              const warningCount = warningCounts.get(iso) ?? 0;
              const chipBorderColor = dateIssueBorderColor({
                active,
                issueCount,
                warningCount,
                activeColor: "teal.500",
                fallbackColor: "gray.200",
              });
              return (
                <Box
                  key={iso}
                  data-date-chip={iso}
                  onClick={() => selectDate(iso)}
                  position="relative"
                  flexShrink={0}
                  w="52px"
                  py="8px"
                  textAlign="center"
                  borderRadius="md"
                  borderWidth="1px"
                  borderColor={chipBorderColor}
                  bg={active ? "teal.500" : isClosed ? "gray.50" : "white"}
                  cursor="pointer"
                  transitionProperty="colors"
                  transitionDuration="faster"
                  _active={{ bg: active ? "teal.600" : "gray.100", transitionDuration: "0ms" }}
                >
                  <DateIssueBadge issueCount={issueCount} warningCount={warningCount} />
                  <Box
                    textStyle="md"
                    fontWeight={700}
                    color={active ? "white" : "gray.800"}
                    lineHeight="1.1"
                    fontVariantNumeric="tabular-nums"
                  >
                    {date.date()}
                  </Box>
                  {/* 休みは曜日と同じ行に置き、日付の高さをそろえる。 */}
                  <Box
                    textStyle="2xs"
                    mt="2px"
                    fontWeight={active ? 700 : 500}
                    whiteSpace="nowrap"
                    style={{ color: active ? "white" : getShiftWeekdayColor(iso) }}
                  >
                    {getWeekdayLabel(iso)}
                    {isClosed && (
                      <Box as="span" fontWeight={700} color={active ? "white" : "gray.500"}>
                        (休)
                      </Box>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Flex>
        </Box>
      </ChromeCollapse>

      {selectedDay && (
        <Flex
          px={4}
          py={3}
          bg="white"
          borderBottomWidth="1px"
          borderColor="gray.200"
          flexShrink={0}
          align="center"
          justify="space-between"
          gap={3}
        >
          <Flex align="baseline" gap={2} minW={0}>
            <Box textStyle="xl" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums">
              {selectedDay.month() + 1}月{selectedDay.date()}日
            </Box>
            <Box textStyle="sm" fontWeight={600} style={{ color: getShiftWeekdayColor(selectedDate) }}>
              ({getWeekdayLabel(selectedDate)})
            </Box>
            {isShopClosedDate && (
              <Box px={2} py={0.5} borderRadius="full" bg="gray.100" color="gray.600" textStyle="2xs" fontWeight={700}>
                定休日
              </Box>
            )}
          </Flex>
          <Flex align="center" gap={1} minW={0} flexShrink={1}>
            {showsTemplate && staffingView && <DayTemplateMenu date={selectedDate} view={staffingView} shrinks />}
            <DisplaySettingsMenu showsDateNotesToggle={false} />
          </Flex>
        </Flex>
      )}

      {!isShopClosedDate && showsFulfillment && staffing && staffing.percent !== null && (
        <FulfillmentPanel
          // 日付を変えるたびに、閉じた状態へ戻す。
          key={selectedDate}
          staffing={staffing}
          percent={staffing.percent}
          options={presentation.options}
        />
      )}

      <Box flex={1} minH={0} overflow="auto" bg="gray.50">
        {isShopClosedDate ? (
          <Flex minH="240px" align="center" justify="center" direction="column" gap={2} px={4}>
            <Text textStyle="md" fontWeight={700} color="gray.700">
              定休日
            </Text>
            <Text textStyle="sm" color="fg.muted" textAlign="center" lineHeight={1.7}>
              この日は店舗の定休日のため、シフトを登録できません。
            </Text>
          </Flex>
        ) : (
          // 右端の列の輪が画面の端に付かないよう、右に余白を取る。
          <Box bg="white" pe={2}>
            <Box as="table" w="100%" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
              <Box as="colgroup">
                <Box as="col" style={{ width: STAFF_COLUMN_WIDTH }} />
                {presentation.options.map((option) => (
                  <Box as="col" key={option.key} />
                ))}
              </Box>
              <Box as="thead" position="sticky" top={0} zIndex={2} bg="white" boxShadow="0 1px 0 #e5e7eb">
                <Box as="tr">
                  <chakra.th px={3} py={2} textAlign="left" verticalAlign="bottom" textStyle="2xs" fontWeight={600}>
                    <Text color="gray.600">スタッフ</Text>
                  </chakra.th>
                  {presentation.options.map((option) => (
                    <chakra.th key={option.key} px="2px" py={2} textAlign="center" verticalAlign="top">
                      <Box textStyle="sm" fontWeight={700} color="gray.800" truncate>
                        {option.name}
                      </Box>
                      <Box textStyle="2xs" color="gray.600" mt="2px" fontVariantNumeric="tabular-nums">
                        {option.shortTimeLabel}
                        {/* 充足の欄を出さない表示では、見出しに人数を添える。 */}
                        {!showsFulfillment && `・${option.countLabel}`}
                      </Box>
                    </chakra.th>
                  ))}
                </Box>
              </Box>
              <Box as="tbody">
                {presentation.rows.map(renderRow)}
                {presentation.restGroup && (
                  <Box as="tr" borderTopWidth="1px" borderColor="gray.100">
                    <chakra.td colSpan={presentation.options.length + 1} p={0}>
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
            {showsDotLegend && <AssignmentDotLegend showsRed />}
          </Box>
        )}
      </Box>

      {dialogRow && dialogCell?.assigned && (
        <PositionDialog
          title={dialogRow.staffName}
          subtitle={`${dialogCell.option.name} ${
            presentation.options.find((option) => option.key === dialogCell.key)?.timeLabel ?? ""
          }`}
          noticeTexts={dialogCell.noticeTexts}
          dot={dialogCell.dot}
          positions={positions}
          currentPositionId={dialogCell.positionId}
          onChangePosition={(positionId) => {
            changePosition({ staff: dialogRow.staff, date: selectedDate, option: dialogCell.option, positionId });
            setDialogTarget(null);
          }}
          onRemove={() => {
            removeAssignment({ staffId: dialogRow.staff.id, date: selectedDate, optionId: dialogCell.option.id });
            setDialogTarget(null);
          }}
          onClose={() => setDialogTarget(null)}
        />
      )}
    </Flex>
  );
};

const StaffCell = ({
  row,
  note,
  date,
  detailMode,
}: {
  row: ShiftTypeDailyRowPresentation;
  note?: string;
  date: string;
  detailMode: boolean;
}) => (
  <Box as="td" ps={3} pe={1} py={0}>
    {/* 名前の幅を取るため、スマートフォンではアバターを出さない。 */}
    <Flex align="center" minW={0}>
      <Flex direction="column" justify="center" gap="1px" flex={1} minW={0}>
        <Flex align="center" gap={1} minW={0}>
          <Text textStyle="xs" fontWeight={500} color={row.isNameMuted ? "gray.500" : "gray.800"} truncate>
            {row.staffName}
          </Text>
          {note && <ShiftStaffNoteIcon notes={[{ date, note }]} openOn="tap" hasNoteColumn={false} />}
        </Flex>
        {row.isUnsubmitted && (
          <Text textStyle="2xs" fontWeight={600} style={{ color: "#b45309" }}>
            未提出
          </Text>
        )}
        {/* 仮の勤務は、名前の下の「仮」だけで示す。点線は希望の輪に使うためである。 */}
        {detailMode && <StaffMeta staff={row.staff} shift={row.shift} showTotal={false} />}
      </Flex>
    </Flex>
  </Box>
);

/**
 * 「充足 56%」の欄。閉じた状態で始まり、押すと、ポジションごと・勤務パターンごとの「配置/必要」を出す。
 * 列の並びは、下の表の勤務パターンの列とそろえる。
 */
const FulfillmentPanel = ({
  staffing,
  percent,
  options,
}: {
  staffing: ShiftTypeStaffingPresentation;
  percent: number;
  options: ShiftTypeDailyOptionPresentation[];
}) => {
  const [isOpen, setOpen] = useState(false);
  return (
    <Box as="section" aria-label="充足" flexShrink={0} bg="white" borderBottomWidth="1px" borderColor="gray.200">
      <chakra.button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setOpen((current) => !current)}
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        w="full"
        minH="44px"
        px={4}
        cursor="pointer"
        _active={{ bg: "gray.100", transitionDuration: "0ms" }}
        _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
      >
        <FulfillmentLabel percent={percent} isFulfilled={staffing.isFulfilled} />
        <Icon boxSize={4} color="gray.500" aria-hidden>
          {isOpen ? <LuChevronUp /> : <LuChevronDown />}
        </Icon>
      </chakra.button>
      {isOpen && (
        <Box as="table" w="100%" pb={2} style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
          <Box as="colgroup">
            <Box as="col" style={{ width: STAFF_COLUMN_WIDTH }} />
            {options.map((option) => (
              <Box as="col" key={option.key} />
            ))}
          </Box>
          <Box as="thead">
            <Box as="tr">
              <chakra.th srOnly>ポジション</chakra.th>
              {options.map((option) => (
                <chakra.th key={option.key} srOnly>
                  {option.name}
                </chakra.th>
              ))}
            </Box>
          </Box>
          <Box as="tbody">
            {staffing.positions.map((position, index) => (
              <Box as="tr" key={position.positionId} h="32px">
                <chakra.th scope="row" ps={4} pe={1} textAlign="left" fontWeight={500}>
                  <Flex align="center" gap="6px" minW={0}>
                    <Box
                      boxSize="10px"
                      borderRadius="full"
                      flexShrink={0}
                      style={{ background: position.color }}
                      aria-hidden
                    />
                    <Text textStyle="xs" color="gray.700" truncate>
                      {position.name}
                    </Text>
                  </Flex>
                </chakra.th>
                {options.map((option) => {
                  const count = staffing.countsByOptionId.get(option.key)?.[index];
                  return (
                    <Box as="td" key={option.key} textAlign="center">
                      {count?.label != null && (
                        <Flex justify="center">
                          <PositionStaffingCount count={count} showsDot={false} />
                        </Flex>
                      )}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};
