import { Box, Flex, Stack } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { type TouchEvent, useCallback, useMemo, useRef, useState } from "react";
import { useDialog } from "@/src/components/ui/Dialog";
import type { ShiftData } from "@/src/domains/shift/types";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import { useScrollDateIntoView } from "../../hooks/useScrollDateIntoView";
import {
  clearShiftDraftPositionsAtom,
  dailySortedStaffsAtom,
  issueCountByDateAtom,
  issueStaffIdSetForSelectedDateAtom,
  selectDateWithDailyStaffOrderAtom,
  selectedDateAtom,
  shiftByStaffIdForSelectedDateAtom,
  shiftConfigAtom,
  upsertShiftDraftAtom,
  warningCountByDateAtom,
  warningMessagesByStaffIdForSelectedDateAtom,
} from "../../stores";
import { DateRail } from "./DateRail";
import { ShiftDetailSheet } from "./ShiftDetailSheet";
import { ShiftEditSheet } from "./ShiftEditSheet";
import { SectionHeader, SPDailyCard, SPOffCard } from "./StaffCards";
import { buildSPDailyCardViewModel } from "./script";

const SWIPE_THRESHOLD = 50;

export const SPDailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const upsertShift = useSetAtom(upsertShiftDraftAtom);
  const clearShiftPositions = useSetAtom(clearShiftDraftPositionsAtom);
  const sortedStaffs = useAtomValue(dailySortedStaffsAtom);
  const shiftByStaffId = useAtomValue(shiftByStaffIdForSelectedDateAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const issueStaffIds = useAtomValue(issueStaffIdSetForSelectedDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const warningMessagesByStaffId = useAtomValue(warningMessagesByStaffIdForSelectedDateAtom);

  const { positions, dates, timeRange, isReadOnly, holidays } = config;
  const isShopClosedDate = holidays.includes(selectedDate);
  useLockedDailyStaffOrder(selectedDate);

  const editDialog = useDialog();
  const detailDialog = useDialog();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const touchStartX = useRef(0);
  const dateStripRef = useRef<HTMLDivElement>(null);
  useScrollDateIntoView(dateStripRef, selectedDate, "horizontal");

  const rows = useMemo(
    () =>
      sortedStaffs.map((staff) => {
        const shift = shiftByStaffId.get(staff.id);
        return { staff, shift, viewModel: buildSPDailyCardViewModel(shift, timeRange) };
      }),
    [sortedStaffs, shiftByStaffId, timeRange],
  );
  const workRows = useMemo(() => rows.filter((row) => row.viewModel.hasAssignment), [rows]);
  const restRows = useMemo(() => rows.filter((row) => !row.viewModel.hasAssignment && row.staff.isSubmitted), [rows]);
  const unsubmittedRows = useMemo(
    () => rows.filter((row) => !row.viewModel.hasAssignment && !row.staff.isSubmitted),
    [rows],
  );

  const selectedStaff = useMemo(
    () => sortedStaffs.find((staff) => staff.id === selectedStaffId),
    [sortedStaffs, selectedStaffId],
  );
  const selectedShift = useMemo(
    () => (selectedStaffId ? shiftByStaffId.get(selectedStaffId) : undefined),
    [shiftByStaffId, selectedStaffId],
  );

  const handleCardTap = useCallback(
    (staffId: string) => {
      if (isShopClosedDate) return;
      setSelectedStaffId(staffId);
      if (isReadOnly) detailDialog.open();
      else editDialog.open();
    },
    [isShopClosedDate, isReadOnly, detailDialog, editDialog],
  );

  const handleStaffDialogOpenChange = useCallback(
    (details: { open: boolean }) => {
      const dialog = isReadOnly ? detailDialog : editDialog;
      dialog.onOpenChange(details);
      if (!details.open) setSelectedStaffId(null);
    },
    [isReadOnly, detailDialog, editDialog],
  );

  const handleShiftUpdate = useCallback((updatedShift: ShiftData) => upsertShift(updatedShift), [upsertShift]);
  const handleShiftDelete = useCallback(
    (staffId: string) => clearShiftPositions({ staffId, date: selectedDate }),
    [clearShiftPositions, selectedDate],
  );

  const handleTouchStart = useCallback((event: TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      const deltaX = event.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
      const currentIndex = dates.indexOf(selectedDate);
      if (deltaX > 0 && currentIndex > 0) selectDate(dates[currentIndex - 1]);
      else if (deltaX < 0 && currentIndex < dates.length - 1) selectDate(dates[currentIndex + 1]);
    },
    [dates, selectedDate, selectDate],
  );

  return (
    <Flex direction="column" flex={1} minH={0} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <DateRail
        dates={dates}
        selectedDate={selectedDate}
        holidays={holidays}
        issueCounts={issueCounts}
        warningCounts={warningCounts}
        dateStripRef={dateStripRef}
        onSelect={selectDate}
      />
      <Box flex={1} minH={0} overflow="auto" bg="gray.50" px={3} py={3} data-tour="shift-grid">
        {isShopClosedDate ? (
          <Flex minH="240px" align="center" justify="center" direction="column" gap={2} px={4}>
            <Box textStyle="md" fontWeight={700} color="gray.700">
              定休日
            </Box>
            <Box textStyle="sm" color="fg.muted" textAlign="center" lineHeight={1.7}>
              この日はお店のお休みとして設定されているため、シフトは登録できません。
            </Box>
          </Flex>
        ) : (
          <Stack gap={4}>
            {workRows.length > 0 && (
              <Box>
                <SectionHeader label="出勤あり" count={workRows.length} />
                <Stack gap={2}>
                  {workRows.map(({ staff, viewModel }) => (
                    <SPDailyCard
                      key={staff.id}
                      staffId={staff.id}
                      staffName={staff.name}
                      viewModel={viewModel}
                      showRestLabel={viewModel.showRestLabel && staff.isSubmitted}
                      onTap={() => handleCardTap(staff.id)}
                      hasError={issueStaffIds.has(staff.id)}
                      warningMessages={warningMessagesByStaffId.get(staff.id) ?? []}
                    />
                  ))}
                </Stack>
              </Box>
            )}
            {restRows.length > 0 && (
              <Box>
                <SectionHeader label="休み" count={restRows.length} hint={isReadOnly ? undefined : "タップで追加"} />
                <Stack gap="6px">
                  {restRows.map(({ staff }) => (
                    <SPOffCard
                      key={staff.id}
                      staffId={staff.id}
                      staffName={staff.name}
                      label={isReadOnly ? "休み" : "休み希望"}
                      labelTone="muted"
                      onTap={() => handleCardTap(staff.id)}
                      isReadOnly={isReadOnly}
                      hasError={issueStaffIds.has(staff.id)}
                      warningMessages={warningMessagesByStaffId.get(staff.id) ?? []}
                    />
                  ))}
                </Stack>
              </Box>
            )}
            {unsubmittedRows.length > 0 && (
              <Box>
                <SectionHeader
                  label="未提出"
                  count={unsubmittedRows.length}
                  hint={isReadOnly ? undefined : "タップで追加"}
                />
                <Stack gap="6px">
                  {unsubmittedRows.map(({ staff }) => (
                    <SPOffCard
                      key={staff.id}
                      staffId={staff.id}
                      staffName={staff.name}
                      label="未提出"
                      labelTone="warning"
                      onTap={() => handleCardTap(staff.id)}
                      isReadOnly={isReadOnly}
                      hasError={issueStaffIds.has(staff.id)}
                      warningMessages={warningMessagesByStaffId.get(staff.id) ?? []}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </Box>
      {isReadOnly && selectedStaff && (
        <ShiftDetailSheet
          staff={selectedStaff}
          shift={selectedShift}
          selectedDate={selectedDate}
          isOpen={detailDialog.isOpen}
          onOpenChange={handleStaffDialogOpenChange}
        />
      )}
      {!isReadOnly && selectedStaff && (
        <ShiftEditSheet
          staff={selectedStaff}
          shift={selectedShift}
          positions={positions}
          timeRange={timeRange}
          selectedDate={selectedDate}
          isOpen={editDialog.isOpen}
          onOpenChange={handleStaffDialogOpenChange}
          onShiftUpdate={handleShiftUpdate}
          onShiftDelete={handleShiftDelete}
        />
      )}
    </Flex>
  );
};
