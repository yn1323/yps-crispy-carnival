import { Box, Table } from "@chakra-ui/react";
import { useCallback, useMemo, useState } from "react";
import { StaffEditModal } from "@/src/components/features/Staff/StaffEditModal";
import { useDialog } from "@/src/components/ui/Dialog";
import { OverviewHeader } from "./OverviewHeader";
import { StaffRow } from "./StaffRow";
import type { OverviewSortMode, ShiftOverviewProps } from "./types";
import { prepareStaffRowData } from "./utils/calculations";
import { getDateRange, getMonthsInRange } from "./utils/dateUtils";
import { sortStaffsForOverview } from "./utils/sortStaffs";

export const ShiftOverview = ({
  shopId,
  startDate,
  endDate,
  staffs,
  shifts,
  allShifts,
  holidays = [],
  onDateClick,
}: ShiftOverviewProps) => {
  const [sortMode, setSortMode] = useState<OverviewSortMode>("default");

  // スタッフ編集モーダル
  const staffEditModal = useDialog();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  const handleStaffNameClick = useCallback(
    (staffId: string) => {
      setSelectedStaffId(staffId);
      staffEditModal.open();
    },
    [staffEditModal],
  );

  // 日付配列生成
  const dates = useMemo(() => getDateRange(startDate, endDate), [startDate, endDate]);

  // 月一覧取得
  const months = useMemo(() => getMonthsInRange(startDate, endDate), [startDate, endDate]);

  // 月合計用のシフトデータ（allShiftsがあればそれを使用）
  const shiftsForMonthly = allShifts ?? shifts;

  // スタッフごとのデータ整形
  const staffRowDataList = useMemo(
    () => prepareStaffRowData(staffs, shifts, shiftsForMonthly, dates, months),
    [staffs, shifts, shiftsForMonthly, dates, months],
  );

  // ソート適用
  const sortedStaffData = useMemo(
    () => sortStaffsForOverview(staffRowDataList, sortMode),
    [staffRowDataList, sortMode],
  );

  return (
    <>
      <Box overflow="auto" maxH="80vh" border="1px solid" borderColor="gray.200" borderRadius="md">
        <Table.Root size="sm" variant="outline" stickyHeader>
          <OverviewHeader
            dates={dates}
            months={months}
            holidays={holidays}
            sortMode={sortMode}
            onSortChange={setSortMode}
          />
          <Table.Body>
            {sortedStaffData.map((staffData) => (
              <StaffRow
                key={staffData.staffId}
                data={staffData}
                dates={dates}
                months={months}
                holidays={holidays}
                onStaffClick={() => handleStaffNameClick(staffData.staffId)}
                onDateClick={onDateClick}
              />
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* スタッフ編集モーダル */}
      {selectedStaffId && (
        <StaffEditModal
          staffId={selectedStaffId}
          shopId={shopId}
          isOpen={staffEditModal.isOpen}
          onOpenChange={staffEditModal.onOpenChange}
          onClose={staffEditModal.close}
        />
      )}
    </>
  );
};
