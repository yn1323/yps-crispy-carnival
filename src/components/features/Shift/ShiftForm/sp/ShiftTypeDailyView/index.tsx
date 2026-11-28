import { Box, chakra, Flex, Icon, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useRef, useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { getWeekdayLabel } from "@/src/domains/shift/date";
import {
  AssignmentPill,
  FoldedStaffGroupToggle,
  FulfillmentLabel,
  PositionStaffingCount,
} from "../../assignmentCellParts";
import { ChromeCollapse } from "../../ChromeCollapse";
import { ShiftFormScrollEnd, StaffWarningIcon } from "../../components";
import { DisplaySettingsMenu } from "../../DisplaySettingsMenu";
import { ShiftStaffNoteIcon, useAllShiftDateNotes } from "../../dateNotes";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import { useRestoreRememberedWorkPosition } from "../../hooks/useRestoreRememberedWorkPosition";
import { useScrollDateIntoView } from "../../hooks/useScrollDateIntoView";
import { useShiftTypeDailyPresentation } from "../../hooks/useShiftTypeDailyPresentation";
import { useSwipeDateChange } from "../../hooks/useSwipeDateChange";
import {
  type ShiftTypeDailyCellPresentation,
  type ShiftTypeDailyOptionPresentation,
  type ShiftTypeDailyRowPresentation,
  type ShiftTypeStaffingPresentation,
  toShiftTypeWarningMessages,
} from "../../shiftTypeDailyPresentation";
import { DayTemplateMenu } from "../../staffingParts";
import {
  assignShiftTypeAtom,
  changeShiftTypePositionAtom,
  isPositionSelectableAtom,
  issueCountByDateAtom,
  removeShiftTypeAssignmentAtom,
  selectDateWithDailyStaffOrderAtom,
  selectedDateAtom,
  shiftConfigAtom,
  warningCountByDateAtom,
} from "../../stores";
import { getShiftWeekdayColor } from "../../weekdayPresentation";
import { DateChips } from "../DailyView/DateRail";
import { PositionDialog } from "../PositionDialog";

// 名前と確認事項のアイコンが並んでも名前が読めるよう、スタッフの列を広めに取る。
// 勤務パターンが4つでも、幅375pxでは1列あたり約60pxが残り、「キッチン」のピルが入る。
const STAFF_COLUMN_WIDTH = "126px";
// 割り当ての前後で行の高さを変えないよう、行の高さを決めておく。
const ROW_HEIGHT = "52px";

type PositionDialogTarget = { row: ShiftTypeDailyRowPresentation; optionId: string };

export const SPShiftTypeDailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const isPositionSelectable = useAtomValue(isPositionSelectableAtom);
  const assign = useSetAtom(assignShiftTypeAtom);
  const changePosition = useSetAtom(changeShiftTypePositionAtom);
  const removeAssignment = useSetAtom(removeShiftTypeAssignmentAtom);
  const dateNotes = useAllShiftDateNotes();

  const { dates, holidays, isReadOnly, positions } = config;
  const isShopClosedDate = holidays.includes(selectedDate);
  const selectedDay = selectedDate ? dayjs(selectedDate) : null;
  const dateStripRef = useRef<HTMLDivElement>(null);
  useScrollDateIntoView(dateStripRef, selectedDate, "horizontal");
  useLockedDailyStaffOrder(selectedDate);
  useRestoreRememberedWorkPosition();

  // 人数と過不足（staffingView、staffing）は、出す日（くわしく表示の営業日）だけ値が入る。
  const { presentation, staffing, staffingView, showsTemplate } = useShiftTypeDailyPresentation();
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
      <StaffCell row={row} note={dateNotes.getNote(row.staff.id, selectedDate)} date={selectedDate} />
      {row.cells.map((cell) => (
        <Box as="td" key={cell.key} px="2px" py={0}>
          <Flex justify="center">
            <AssignmentPill
              // スマートフォンでは、ピルの右上の点を出さない。押しても理由が出せず、分からないためである。
              // 確かめたいことは、名前の右の確認事項のアイコンにまとめる。
              cell={{ ...cell, dot: null }}
              size="sp"
              isInteractive={!isReadOnly}
              onClick={isReadOnly ? undefined : () => handleCellClick(row, cell)}
            />
          </Flex>
        </Box>
      ))}
    </Box>
  );

  // 時間指定と同じく、左右フリックで前後の日へ移る。
  const swipeHandlers = useSwipeDateChange({ dates, selectedDate, onSelect: selectDate });

  return (
    <Flex direction="column" flex={1} minH={0} {...swipeHandlers}>
      {/* 日付の一覧は、表を下へスクロールすると上の行と一緒に隠す。日付の見出しは残す。 */}
      <ChromeCollapse>
        <Box px={3} pt={3} pb={2} bg="white" borderBottomWidth="1px" borderColor="gray.100">
          <DateChips
            dates={dates}
            selectedDate={selectedDate}
            holidays={holidays}
            issueCounts={issueCounts}
            warningCounts={warningCounts}
            dateStripRef={dateStripRef}
            onSelect={selectDate}
          />
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
          {/* 日付は折り返さず、縮めない。幅が足りないときは、右のテンプレートの名前が先に縮む。 */}
          <Flex align="baseline" gap={2} flexShrink={0} whiteSpace="nowrap">
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
            {showsTemplate && staffingView && (
              <DayTemplateMenu date={selectedDate} view={staffingView} shrinks hidesIcon />
            )}
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

      {/* 充足を開いて低くなっても、画面のスクロールとして扱う。 */}
      <Box flex={1} minH={0} overflow="auto" bg="gray.50" data-chrome-scroll-target>
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
          </Box>
        )}
        {/* 未提出の帯は、表のいちばん下に置く。 */}
        <ShiftFormScrollEnd />
      </Box>

      {dialogRow && dialogCell?.assigned && (
        <PositionDialog
          title={dialogRow.staffName}
          subtitle={`${dialogCell.option.name} ${
            presentation.options.find((option) => option.key === dialogCell.key)?.timeLabel ?? ""
          }`}
          noticeTexts={dialogCell.noticeTexts}
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

const StaffCell = ({ row, note, date }: { row: ShiftTypeDailyRowPresentation; note?: string; date: string }) => (
  <Box as="td" ps={3} pe={1} py={0}>
    {/* 名前の幅を取るため、スマートフォンではアバターを出さない。 */}
    <Flex align="center" minW={0}>
      <Flex direction="column" justify="center" gap="1px" flex={1} minW={0}>
        <Flex align="center" gap={1} minW={0}>
          <Text textStyle="xs" fontWeight={500} color={row.isNameMuted ? "gray.500" : "gray.800"} truncate>
            {row.staffName}
          </Text>
          {note && <ShiftStaffNoteIcon notes={[{ date, note }]} openOn="tap" hasNoteColumn={false} />}
          <StaffWarningIcon messages={toShiftTypeWarningMessages(row)} openOn="tap" />
        </Flex>
        {row.isUnsubmitted && (
          <Text textStyle="2xs" fontWeight={600} style={{ color: "#b45309" }}>
            未提出
          </Text>
        )}
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
