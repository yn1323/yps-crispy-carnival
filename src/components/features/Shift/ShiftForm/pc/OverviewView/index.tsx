import { Box, Table } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { StaffEditModal } from "@/src/components/features/Staff/StaffEditModal";
import { useDialog } from "@/src/components/ui/Dialog";
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
import { SummaryFooterRow } from "./SummaryFooterRow";

export const OverviewView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const sortedStaffs = useAtomValue(sortedStaffsAtom);
  const sortMode = useAtomValue(sortModeAtom);
  const setSortMode = useSetAtom(sortModeAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);
  const setViewMode = useSetAtom(viewModeAtom);

  const { dates, holidays, isReadOnly, currentStaffId, allShifts, requiredStaffing } = config;

  // 日付クリック → 日別ビューに遷移
  const handleDateClick = useCallback(
    (date: string) => {
      setSelectedDate(date);
      setViewMode("daily");
    },
    [setSelectedDate, setViewMode],
  );

  // スタッフ編集モーダル
  const staffEditModal = useDialog();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  const handleStaffNameClick = useCallback(
    (staffId: string) => {
      if (isReadOnly) return;
      setSelectedStaffId(staffId);
      staffEditModal.open();
    },
    [staffEditModal, isReadOnly],
  );

  // 月一覧取得
  const months = useMemo(() => (dates.length > 0 ? getMonthsInRange(dates[0], dates[dates.length - 1]) : []), [dates]);

  // 月合計用のシフトデータ（allShiftsがあればそれを使用）
  const shiftsForMonthly = allShifts ?? shifts;

  // スタッフごとのデータ整形（sortedStaffs の順序を維持）
  const staffRowDataList = useMemo(
    () => prepareStaffRowData(sortedStaffs, shifts, shiftsForMonthly, dates, months),
    [sortedStaffs, shifts, shiftsForMonthly, dates, months],
  );

  // 未提出スタッフ数
  const unsubmittedCount = useMemo(() => staffRowDataList.filter((s) => !s.isSubmitted).length, [staffRowDataList]);

  return (
    <>
      <Box overflow="auto" border="1px solid" borderColor="gray.200" borderRadius="md">
        <Table.Root size="sm" variant="outline" stickyHeader>
          <OverviewHeader
            dates={dates}
            months={months}
            holidays={holidays}
            unsubmittedCount={unsubmittedCount}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
          />
          <Table.Body>
            {staffRowDataList.map((staffData) => (
              <StaffRow
                key={staffData.staffId}
                data={staffData}
                dates={dates}
                months={months}
                holidays={holidays}
                onStaffClick={() => handleStaffNameClick(staffData.staffId)}
                onDateClick={handleDateClick}
                isHighlighted={staffData.staffId === currentStaffId}
              />
            ))}
          </Table.Body>
          <SummaryFooterRow shifts={shifts} dates={dates} months={months} requiredStaffing={requiredStaffing} />
        </Table.Root>
      </Box>

      {/* スタッフ編集モーダル（閲覧専用時は非表示） */}
      {!isReadOnly && selectedStaffId && (
        <StaffEditModal
          staffId={selectedStaffId}
          shopId={config.shopId}
          isOpen={staffEditModal.isOpen}
          onOpenChange={staffEditModal.onOpenChange}
          onClose={staffEditModal.close}
        />
      )}
    </>
  );
};
