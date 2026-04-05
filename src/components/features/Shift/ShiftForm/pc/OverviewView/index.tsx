import { Box, Table } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { useDateStatuses } from "../../hooks/useDateStatuses";
import {
  selectedDateAtom,
  shiftConfigAtom,
  shiftsAtom,
  sortedStaffsAtom,
  sortModeAtom,
  viewModeAtom,
} from "../../stores";
import { prepareStaffRowData } from "../../utils/calculations";
import { getMonthsInRange } from "../../utils/dateUtils";
import { OverviewHeader } from "./OverviewHeader";
import { StaffRow } from "./StaffRow";

export const OverviewView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const sortedStaffs = useAtomValue(sortedStaffsAtom);
  const sortMode = useAtomValue(sortModeAtom);
  const setSortMode = useSetAtom(sortModeAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);
  const setViewMode = useSetAtom(viewModeAtom);

  const { dates, holidays, isReadOnly, currentStaffId, allShifts } = config;

  // 日付クリック → 日別ビューに遷移（readOnly時は無効）
  const handleDateClick = useCallback(
    (date: string) => {
      if (isReadOnly) return;
      setSelectedDate(date);
      setViewMode("daily");
    },
    [setSelectedDate, setViewMode, isReadOnly],
  );

  // 月一覧取得
  const months = useMemo(() => (dates.length > 0 ? getMonthsInRange(dates[0], dates[dates.length - 1]) : []), [dates]);

  // 月合計用のシフトデータ（allShiftsがあればそれを使用）
  const shiftsForMonthly = allShifts ?? shifts;

  const dateStatuses = useDateStatuses();

  // スタッフごとのデータ整形（sortedStaffs の順序を維持）
  const staffRowDataList = useMemo(
    () => prepareStaffRowData(sortedStaffs, shifts, shiftsForMonthly, dates, months),
    [sortedStaffs, shifts, shiftsForMonthly, dates, months],
  );

  return (
    <Box overflow="auto" border="1px solid" borderColor="gray.200" borderRadius="lg" bg="white">
      <Table.Root size="sm" variant="outline" stickyHeader>
        <OverviewHeader
          dates={dates}
          months={months}
          holidays={holidays}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          dateStatuses={dateStatuses}
        />
        <Table.Body>
          {staffRowDataList.map((staffData) => (
            <StaffRow
              key={staffData.staffId}
              data={staffData}
              dates={dates}
              months={months}
              holidays={holidays}
              onStaffClick={isReadOnly ? undefined : undefined}
              onDateClick={isReadOnly ? undefined : handleDateClick}
              isHighlighted={staffData.staffId === currentStaffId}
            />
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
};
