import { Box, Table } from "@chakra-ui/react";
import { useCallback, useMemo, useState } from "react";
import { StaffEditModal } from "@/src/components/features/Staff/StaffEditModal";
import { useDialog } from "@/src/components/ui/Dialog";
import { OverviewHeader } from "./OverviewHeader";
import { StaffRow } from "./StaffRow";
import { SummaryFooterRow } from "./SummaryFooterRow";
import type { ShiftOverviewProps } from "./types";
import { prepareStaffRowData } from "./utils/calculations";
import { getMonthsInRange } from "./utils/dateUtils";

export const ShiftOverview = ({
  shopId,
  dates,
  staffs,
  shifts,
  allShifts,
  holidays = [],
  onDateClick,
  requiredStaffing,
  sortMode,
  onSortModeChange,
}: ShiftOverviewProps) => {
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

  // 月一覧取得
  const months = useMemo(() => (dates.length > 0 ? getMonthsInRange(dates[0], dates[dates.length - 1]) : []), [dates]);

  // 月合計用のシフトデータ（allShiftsがあればそれを使用）
  const shiftsForMonthly = allShifts ?? shifts;

  // スタッフごとのデータ整形（staffs の props 順を維持）
  const staffRowDataList = useMemo(
    () => prepareStaffRowData(staffs, shifts, shiftsForMonthly, dates, months),
    [staffs, shifts, shiftsForMonthly, dates, months],
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
            sortMode={sortMode ?? null}
            onSortModeChange={onSortModeChange ?? (() => {})}
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
                onDateClick={onDateClick}
              />
            ))}
          </Table.Body>
          <SummaryFooterRow
            shifts={shifts}
            dates={dates}
            months={months}
            onDateClick={onDateClick}
            requiredStaffing={requiredStaffing}
          />
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
