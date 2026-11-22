import { Box, Flex } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { compareDefaultStaffOrder } from "@/src/domains/shift/sortStaffs";
import { useAllShiftDateNotes, useShiftDateNotes } from "../../dateNotes";
import { buildDateOnlyStaffingPresentation, buildDateOnlyWeekPresentation } from "../../dateOnlyPresentation";
import {
  assignDateOnlyAtom,
  changeDateOnlyPositionAtom,
  dayStaffingViewByDateAtom,
  isPositionSelectableAtom,
  issueCountByDateAtom,
  removeDateOnlyAssignmentAtom,
  restoreRememberedWorkPositionAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsAtom,
  usesPositionColorsAtom,
  warningCountByDateAtom,
} from "../../stores";
import { DateOnlyTable } from "./DateOnlyTable";
import { buildDateOnlyWeeks } from "./script";
import { WeekPeriodBar } from "./WeekPeriodBar";
import { WeekRail } from "./WeekRail";

export const DateOnlyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const assign = useSetAtom(assignDateOnlyAtom);
  const changePosition = useSetAtom(changeDateOnlyPositionAtom);
  const removeAssignment = useSetAtom(removeDateOnlyAssignmentAtom);
  // 連絡事項の列と角の印は、表示設定に従う。たたむ人の判定は、表示設定で変わらないよう、すべての連絡事項で行う。
  const dateNotes = useShiftDateNotes();
  const allDateNotes = useAllShiftDateNotes();
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  const isPositionSelectable = useAtomValue(isPositionSelectableAtom);
  // くわしく表示のときだけ値を持つ。スタッフ向けの確定シフトでは空になる。
  const staffingViews = useAtomValue(dayStaffingViewByDateAtom);

  const { dates, holidays, isReadOnly, shopId, positions, staffs } = config;
  // 日付選択は、勤務や希望があってもなくても、スタッフのページで決めた並び順のままにする。
  const sortedStaffs = useMemo(() => [...staffs].sort(compareDefaultStaffOrder), [staffs]);
  const isConfirmedDisplay = config.displayMode === "confirmed";
  const weeks = useMemo(() => buildDateOnlyWeeks(dates), [dates]);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const selectedWeek = weeks[selectedWeekIndex] ?? weeks[0];
  const visibleDates = selectedWeek?.dates ?? [];
  const selectedDate = useAtomValue(selectedDateAtom);
  const didInitWeek = useRef(false);

  // 前にこの店舗で最後に選んだポジションを、次に入れるポジションへ戻す。店舗とポジションが読み込まれてから行う。
  const restoreRememberedWorkPosition = useSetAtom(restoreRememberedWorkPositionAtom);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 店舗かポジションが変わったときに戻し直すため、値の変化を見る。
  useEffect(() => {
    restoreRememberedWorkPosition();
  }, [restoreRememberedWorkPosition, shopId, positions]);

  useEffect(() => {
    if (didInitWeek.current || !selectedDate || weeks.length === 0) return;
    didInitWeek.current = true;
    const index = weeks.findIndex((week) => week.dates.some((date) => date.inRange && date.iso === selectedDate));
    if (index > 0) setSelectedWeekIndex(index);
  }, [selectedDate, weeks]);

  const presentation = useMemo(
    () =>
      buildDateOnlyWeekPresentation({
        staffs: sortedStaffs,
        shifts,
        dates: visibleDates,
        holidays,
        isConfirmedDisplay,
        usesPositionColors,
        getNote: allDateNotes.getNote,
      }),
    [allDateNotes.getNote, holidays, isConfirmedDisplay, shifts, sortedStaffs, usesPositionColors, visibleDates],
  );
  // 表示中の週の営業日の人数。くわしく表示でない場合と、スタッフ向けの確定シフトではnullにする。
  const staffing = useMemo(() => {
    const views = visibleDates.flatMap((date) => {
      const view = date.inRange ? staffingViews.get(date.iso) : undefined;
      return view ? [view] : [];
    });
    return views.length > 0 ? buildDateOnlyStaffingPresentation(views) : null;
  }, [staffingViews, visibleDates]);
  // 充足率は、必要人数が1つでもある週にだけ出す。
  const fulfillment =
    staffing && staffing.percent !== null ? { percent: staffing.percent, isFulfilled: staffing.isFulfilled } : null;

  useEffect(() => {
    if (selectedWeekIndex >= weeks.length) setSelectedWeekIndex(0);
  }, [selectedWeekIndex, weeks.length]);

  return (
    <Flex flex={1} minH={0} overflow="hidden" bg="gray.50">
      <WeekRail
        weeks={weeks}
        selectedIndex={selectedWeekIndex}
        issueCounts={issueCounts}
        warningCounts={warningCounts}
        onSelect={setSelectedWeekIndex}
      />
      <Flex direction="column" flex={1} minW={0} minH={0}>
        <WeekPeriodBar periodLabel={selectedWeek?.label ?? ""} fulfillment={fulfillment} />
        <Box flex={1} minH={0} overflow="auto" bg="gray.50">
          <DateOnlyTable
            // 「希望なし」のまとまりは、週を変えるたびに閉じた状態へ戻す。
            key={selectedWeek?.key}
            presentation={presentation}
            staffing={staffing}
            staffingViews={staffingViews}
            isReadOnly={isReadOnly}
            usesPositionColors={usesPositionColors}
            isPositionSelectable={isPositionSelectable}
            positions={positions}
            showsNoteColumn={dateNotes.hasNotes}
            noteCountByDate={dateNotes.countByDate}
            onAssign={(staff, date) => assign({ staff, date })}
            onChangePosition={(staff, date, positionId) => changePosition({ staff, date, positionId })}
            onRemove={(staff, date) => removeAssignment({ staffId: staff.id, date })}
          />
        </Box>
      </Flex>
    </Flex>
  );
};
