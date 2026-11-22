import { Box, Flex, Icon, Text, VisuallyHidden } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuMessageSquare } from "react-icons/lu";
import { formatDateWithWeekday, getWeekdayLabel, isSaturday, isSunday } from "@/src/domains/shift/date";
import {
  AssignmentPill,
  FoldedStaffGroupToggle,
  FulfillmentLabel,
  PositionStaffingCount,
} from "../../assignmentCellParts";
import { ChromeCollapse } from "../../ChromeCollapse";
import { DateIssueBadge, dateIssueBorderColor, ShiftFormScrollEnd, StaffWarningIcon } from "../../components";
import { DisplaySettingsMenu } from "../../DisplaySettingsMenu";
import { useAllShiftDateNotes } from "../../dateNotes";
import {
  buildDateOnlyDayPresentation,
  buildDateOnlyStaffingPresentation,
  type DateOnlyDayRowPresentation,
  type DateOnlyStaffingPresentation,
} from "../../dateOnlyPresentation";
import { ProvisionalBadge } from "../../detailParts";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import { useScrollDateIntoView } from "../../hooks/useScrollDateIntoView";
import { useSwipeDateChange } from "../../hooks/useSwipeDateChange";
import { DayTemplateMenu, useDayStaffingView } from "../../staffingParts";
import {
  assignDateOnlyAtom,
  changeDateOnlyPositionAtom,
  dailySortedStaffsAtom,
  isPositionSelectableAtom,
  issueCountByDateAtom,
  removeDateOnlyAssignmentAtom,
  restoreRememberedWorkPositionAtom,
  selectDateWithDailyStaffOrderAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsAtom,
  usesPositionColorsAtom,
  warningCountByDateAtom,
} from "../../stores";
import { PositionDialog } from "../PositionDialog";

const dayColor = (iso: string): string => {
  if (isSunday(iso)) return "red.500";
  if (isSaturday(iso)) return "blue.500";
  return "gray.700";
};

export const SPDateOnlyDailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const assign = useSetAtom(assignDateOnlyAtom);
  const changePosition = useSetAtom(changeDateOnlyPositionAtom);
  const removeAssignment = useSetAtom(removeDateOnlyAssignmentAtom);
  const sortedStaffs = useAtomValue(dailySortedStaffsAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  const isPositionSelectable = useAtomValue(isPositionSelectableAtom);
  // その日の連絡事項は、表示設定にかかわらず、名前の下に全文を出す。
  const dateNotes = useAllShiftDateNotes();

  const { dates, holidays, isReadOnly, shopId, positions } = config;
  const isConfirmedDisplay = config.displayMode === "confirmed";
  const activeDate = dates.includes(selectedDate) ? selectedDate : (dates[0] ?? "");
  const isShopClosedDate = holidays.includes(activeDate);
  // 人数と過不足を出す日（くわしく表示の営業日）だけ値が入る。
  const staffingView = useDayStaffingView(activeDate);
  useLockedDailyStaffOrder(activeDate);

  // 前にこの店舗で最後に選んだポジションを、次に入れるポジションへ戻す。店舗とポジションが読み込まれてから行う。
  const restoreRememberedWorkPosition = useSetAtom(restoreRememberedWorkPositionAtom);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 店舗かポジションが変わったときに戻し直すため、値の変化を見る。
  useEffect(() => {
    restoreRememberedWorkPosition();
  }, [restoreRememberedWorkPosition, shopId, positions]);

  const presentation = useMemo(
    () =>
      buildDateOnlyDayPresentation({
        staffs: sortedStaffs,
        shifts,
        date: activeDate,
        isClosed: isShopClosedDate,
        isConfirmedDisplay,
        usesPositionColors,
        getNote: dateNotes.getNote,
      }),
    [activeDate, dateNotes.getNote, isConfirmedDisplay, isShopClosedDate, shifts, sortedStaffs, usesPositionColors],
  );
  const staffing = useMemo(
    () => (staffingView ? buildDateOnlyStaffingPresentation([staffingView]) : null),
    [staffingView],
  );
  // 充足の行は、必要人数が1つでもある日にだけ出す。
  const showsFulfillment = staffing !== null && staffing.percent !== null;

  // たたんだまとまりは、日付を変えるたびに閉じた状態へ戻す。
  const [openFoldedDate, setOpenFoldedDate] = useState<string | null>(null);
  const isFoldedOpen = openFoldedDate === activeDate;
  const [dialogStaffId, setDialogStaffId] = useState<string | null>(null);
  // モーダルは、開いた時点の行ではなく、いまの表示内容から作る。ポジションを変えた直後の状態を出すためである。
  const allRows = [...presentation.rows, ...(presentation.foldedGroup?.rows ?? [])];
  const dialogRow = dialogStaffId ? allRows.find((row) => row.key === dialogStaffId) : undefined;

  const handlePillClick = (row: DateOnlyDayRowPresentation) => {
    if (!row.cell.assigned) {
      assign({ staff: row.staff, date: activeDate });
      return;
    }
    // ポジションを選び分けない表示（シンプル表示、ポジションが1つ以下の店舗）では、押すたびに付け外しする。
    if (!isPositionSelectable) {
      removeAssignment({ staffId: row.staff.id, date: activeDate });
      return;
    }
    setDialogStaffId(row.staff.id);
  };

  const handleDateSelect = useCallback(
    (iso: string) => {
      selectDate(iso);
    },
    [selectDate],
  );
  // 時間指定と同じく、左右フリックで前後の日へ移る。
  const swipeHandlers = useSwipeDateChange({ dates, selectedDate: activeDate, onSelect: handleDateSelect });

  if (!activeDate) {
    return (
      <Flex flex={1} minH={0} align="center" justify="center" bg="gray.50" px={4}>
        <Text textStyle="sm" color="gray.500">
          表示できる日付がありません。
        </Text>
      </Flex>
    );
  }

  const renderRow = (row: DateOnlyDayRowPresentation) => (
    <StaffRow key={row.key} row={row} isReadOnly={isReadOnly} onPillClick={() => handlePillClick(row)} />
  );

  return (
    <Flex direction="column" flex={1} minH={0} bg="gray.50" {...swipeHandlers}>
      {/* 日付の一覧は、一覧を下へスクロールすると上の行と一緒に隠す。日付の見出しは残す。 */}
      <ChromeCollapse>
        <DateRail
          dates={dates}
          holidays={holidays}
          selectedDate={activeDate}
          issueCounts={issueCounts}
          warningCounts={warningCounts}
          onSelect={handleDateSelect}
        />
      </ChromeCollapse>

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
          <Text textStyle="xl" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums">
            {/* 時間指定とパターン選択の日付の見出しと同じく「1月1日」の形にする。 */}
            {Number(activeDate.slice(5, 7))}月{Number(activeDate.slice(8, 10))}日
          </Text>
          <Text textStyle="sm" fontWeight={600} color={dayColor(activeDate)}>
            ({getWeekdayLabel(activeDate)})
          </Text>
          {isShopClosedDate ? (
            <Box px={2} py={0.5} borderRadius="full" bg="gray.100" color="gray.600" textStyle="2xs" fontWeight={700}>
              定休日
            </Box>
          ) : (
            // 充足の行を出す日は、ポジションごとの人数をそちらで示す。
            !showsFulfillment && (
              <Text textStyle="sm" fontWeight={600} color="gray.600" fontVariantNumeric="tabular-nums">
                {presentation.countLabel}
              </Text>
            )
          )}
        </Flex>
        <Flex align="center" gap={1} minW={0} flexShrink={1}>
          {staffingView && <DayTemplateMenu date={activeDate} view={staffingView} shrinks hidesIcon />}
          <DisplaySettingsMenu showsDateNotesToggle={false} />
        </Flex>
      </Flex>

      {!isShopClosedDate && showsFulfillment && staffing && staffing.percent !== null && (
        <FulfillmentLine date={activeDate} staffing={staffing} percent={staffing.percent} />
      )}

      <Box flex={1} minH={0} overflow="auto" bg="gray.50" data-tour="shift-grid">
        {isShopClosedDate ? (
          <Flex minH="220px" align="center" justify="center" direction="column" gap={2} px={4}>
            <Text textStyle="md" fontWeight={700} color="gray.700">
              定休日
            </Text>
            <Text textStyle="sm" color="fg.muted" textAlign="center" lineHeight={1.7}>
              この日は店舗の定休日のため、割当を編集できません。
            </Text>
          </Flex>
        ) : (
          <Box bg="white">
            <Box as="ul" listStyleType="none">
              {presentation.rows.map(renderRow)}
            </Box>
            {presentation.foldedGroup && (
              <Box borderBottomWidth="1px" borderColor="gray.100">
                <FoldedStaffGroupToggle
                  group={presentation.foldedGroup}
                  isOpen={isFoldedOpen}
                  onToggle={() => setOpenFoldedDate(isFoldedOpen ? null : activeDate)}
                />
              </Box>
            )}
            {isFoldedOpen && presentation.foldedGroup && (
              <Box as="ul" listStyleType="none">
                {presentation.foldedGroup.rows.map(renderRow)}
              </Box>
            )}
          </Box>
        )}
        {/* 未提出の帯は、リストのいちばん下に置く。 */}
        <ShiftFormScrollEnd />
      </Box>

      {dialogRow?.cell.assigned && (
        <PositionDialog
          title={dialogRow.staffName}
          subtitle={formatDateWithWeekday(activeDate)}
          noticeTexts={dialogRow.cell.noticeTexts}
          positions={positions}
          currentPositionId={dialogRow.cell.positionId}
          onChangePosition={(positionId) => {
            changePosition({ staff: dialogRow.staff, date: activeDate, positionId });
            setDialogStaffId(null);
          }}
          onRemove={() => {
            removeAssignment({ staffId: dialogRow.staff.id, date: activeDate });
            setDialogStaffId(null);
          }}
          onClose={() => setDialogStaffId(null)}
        />
      )}
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
  dates: string[];
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
        {dates.map((iso) => {
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
              as="button"
              key={iso}
              data-date-chip={iso}
              aria-label={`${formatDateWithWeekday(iso)}を表示`}
              aria-pressed={active}
              onClick={() => onSelect(iso)}
              position="relative"
              flexShrink={0}
              w="52px"
              py="8px"
              textAlign="center"
              borderRadius="md"
              borderWidth="1px"
              borderColor={chipBorderColor}
              bg={active ? "teal.500" : isClosed ? "gray.50" : "white"}
              color={active ? "white" : isClosed ? "gray.400" : "gray.800"}
              cursor="pointer"
              transitionProperty="colors"
              transitionDuration="faster"
              _active={{ bg: active ? "teal.600" : "gray.100", transitionDuration: "0ms" }}
              _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
            >
              <DateIssueBadge issueCount={issueCount} warningCount={warningCount} />
              <Text
                textStyle="md"
                fontWeight={700}
                lineHeight="1.1"
                color={active ? "white" : undefined}
                fontVariantNumeric="tabular-nums"
              >
                {dayjs(iso).date()}
              </Text>
              {/* 休みは曜日と同じ行に置き、日付の高さをそろえる。 */}
              <Text
                textStyle="2xs"
                mt="2px"
                fontWeight={active ? 700 : 500}
                whiteSpace="nowrap"
                color={active ? "white" : isClosed ? "gray.400" : dayColor(iso)}
              >
                {getWeekdayLabel(iso)}
                {isClosed && (
                  <Text as="span" fontWeight={700}>
                    (休)
                  </Text>
                )}
              </Text>
            </Box>
          );
        })}
      </Flex>
    </Box>
  );
};

/**
 * その日の充足を1行で示す。「充足 60%　● 販売 2/3　● 製造 1/2」。開閉はなく、入りきらない分は折り返す。
 * スマートフォンには凡例がないため、ポジションの名前も文字で出す。
 */
const FulfillmentLine = ({
  date,
  staffing,
  percent,
}: {
  date: string;
  staffing: DateOnlyStaffingPresentation;
  percent: number;
}) => {
  const counts = (staffing.countsByDate.get(date) ?? []).filter((count) => count.label !== null);
  // ポジションを分けていない店舗では、色と名前を出さず、分数だけにする。
  const showsPosition = staffing.positions.length > 1;
  return (
    <Flex
      as="section"
      aria-label="充足"
      flexShrink={0}
      align="center"
      columnGap={3}
      rowGap={1}
      flexWrap="wrap"
      px={4}
      py={2}
      bg="gray.50"
      borderBottomWidth="1px"
      borderColor="gray.200"
    >
      <FulfillmentLabel percent={percent} isFulfilled={staffing.isFulfilled} />
      {counts.map((count) => (
        <PositionStaffingCount
          key={count.positionId}
          count={count}
          showsDot={showsPosition}
          showsName={showsPosition}
        />
      ))}
    </Flex>
  );
};

/** リストの1行。左に名前とその日の連絡事項、右に希望の輪と割り当てのピルを置く。 */
const StaffRow = ({
  row,
  isReadOnly,
  onPillClick,
}: {
  row: DateOnlyDayRowPresentation;
  isReadOnly: boolean;
  onPillClick: () => void;
}) => (
  <Flex
    as="li"
    align="center"
    gap={3}
    minH="56px"
    px={4}
    py={2}
    borderBottomWidth="1px"
    borderColor="gray.100"
    data-tour={`shift-row-${row.staff.id}`}
  >
    <Box flex={1} minW={0}>
      <Flex align="center" gap={2} minW={0}>
        <Text textStyle="sm" fontWeight={600} color={row.isNameMuted ? "gray.500" : "gray.800"} truncate>
          {row.staffName}
        </Text>
        {/* 仮の勤務は、名前の横の「仮」だけで示す。点線は希望の輪に使うためである。 */}
        {row.isProvisional && <ProvisionalBadge />}
        {row.isUnsubmitted && (
          <Text textStyle="2xs" fontWeight={600} flexShrink={0} style={{ color: "#b45309" }}>
            未提出
          </Text>
        )}
        <StaffWarningIcon messages={row.cell.dot === null ? [] : row.cell.noticeTexts} openOn="tap" />
      </Flex>
      {row.note !== null && (
        <Flex mt={1} gap={1.5} align="flex-start">
          <Icon boxSize={3.5} mt="3px" color="gray.500" flexShrink={0}>
            <LuMessageSquare aria-hidden />
          </Icon>
          <Text textStyle="xs" lineHeight={1.6} color="gray.700" minW={0} overflowWrap="anywhere">
            <VisuallyHidden>連絡事項：</VisuallyHidden>
            <span data-clarity-mask="true">{row.note}</span>
          </Text>
        </Flex>
      )}
    </Box>
    <Box w="96px" flexShrink={0}>
      <AssignmentPill
        // スマートフォンでは、ピルの右上の点を出さない。押しても理由が出せず、分からないためである。
        // 確かめたいことは、名前の右の確認事項のアイコンにまとめる。
        cell={{ ...row.cell, dot: null }}
        size="list"
        isInteractive={!isReadOnly}
        onClick={isReadOnly ? undefined : onPillClick}
      />
    </Box>
  </Flex>
);
