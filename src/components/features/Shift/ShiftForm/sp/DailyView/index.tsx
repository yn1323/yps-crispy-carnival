import { Box, Flex, Stack } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { type TouchEvent, useCallback, useMemo, useRef, useState } from "react";
import { useDialog } from "@/src/components/ui/Dialog";
import { isTimeStaffFolded } from "@/src/domains/shift/foldedStaff";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { FoldedStaffGroupToggle } from "../../assignmentCellParts";
import { useAllShiftDateNotes } from "../../dateNotes";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import { useScrollDateIntoView } from "../../hooks/useScrollDateIntoView";
import { SP_LIST_PADDING_X_PX } from "../../spTimelineScale";
import { DayTemplateMenu, useDayStaffingView } from "../../staffingParts";
import { buildStaffNamesLabel } from "../../staffNamesLabel";
import {
  clearShiftDraftPositionsAtom,
  dailySortedStaffsAtom,
  issueCountByDateAtom,
  issueStaffIdSetForSelectedDateAtom,
  selectDateWithDailyStaffOrderAtom,
  selectedDateAtom,
  shiftByStaffIdForSelectedDateAtom,
  shiftConfigAtom,
  staffWarningCountByDateAtom,
  upsertShiftDraftAtom,
  warningMessagesByStaffIdForSelectedDateAtom,
} from "../../stores";
import { DateRail } from "./DateRail";
import { DetailControls } from "./DetailControls";
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
  const warningCounts = useAtomValue(staffWarningCountByDateAtom);
  const warningMessagesByStaffId = useAtomValue(warningMessagesByStaffIdForSelectedDateAtom);
  // その日のテンプレートを出す日（くわしく表示の営業日）だけ値が入る。
  const staffingView = useDayStaffingView(selectedDate);
  // カード下段の本文と名前の右のアイコンは、表示設定に応じてどちらか一方だけが出る。
  const dateNotes = useAllShiftDateNotes();

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
  const unassignedRows = useMemo(() => rows.filter((row) => !row.viewModel.hasAssignment), [rows]);
  // 編集中は、勤務を外しても希望シフトの時間がある人を休み希望に混ぜず、希望の点線を残す。
  // 閲覧専用はPC版と同じく希望を出さないため、勤務がない人はすべて休みとして扱う。
  const requestRows = useMemo(
    () => (isReadOnly ? [] : unassignedRows.filter((row) => row.viewModel.hasRequest)),
    [isReadOnly, unassignedRows],
  );
  const offRows = useMemo(
    () => (isReadOnly ? unassignedRows : unassignedRows.filter((row) => !row.viewModel.hasRequest)),
    [isReadOnly, unassignedRows],
  );
  const submittedOffRows = useMemo(() => offRows.filter((row) => row.staff.isSubmitted), [offRows]);
  // 休み希望（提出済みで、その日の希望の時間がない）で、勤務も連絡事項もない人は、下にまとめてたたむ。
  // 未提出の人はたたまない。スタッフ向けの確定シフトでは、全員をそのまま出す。
  const isConfirmedDisplay = config.displayMode === "confirmed";
  const foldedRows = useMemo(
    () =>
      isConfirmedDisplay
        ? []
        : submittedOffRows.filter(({ staff, shift }) =>
            isTimeStaffFolded({ shift, staff, hasNote: dateNotes.getNote(staff.id, selectedDate) !== undefined }),
          ),
    [dateNotes, isConfirmedDisplay, selectedDate, submittedOffRows],
  );
  const restRows = useMemo(
    () => submittedOffRows.filter((row) => !foldedRows.includes(row)),
    [foldedRows, submittedOffRows],
  );
  // たたんだまとまりは、日付を変えるたびに閉じた状態へ戻す。
  const [openFoldedDate, setOpenFoldedDate] = useState<string | null>(null);
  const isFoldedOpen = openFoldedDate === selectedDate;
  const unsubmittedRows = useMemo(() => offRows.filter((row) => !row.staff.isSubmitted), [offRows]);

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

  const renderDailyCard = ({ staff, shift, viewModel }: (typeof rows)[number]) => (
    <SPDailyCard
      key={staff.id}
      staffId={staff.id}
      staffName={staff.name}
      staff={staff}
      shift={shift}
      viewModel={viewModel}
      onTap={() => handleCardTap(staff.id)}
      hasError={issueStaffIds.has(staff.id)}
      warningMessages={warningMessagesByStaffId.get(staff.id) ?? []}
      note={dateNotes.getNote(staff.id, selectedDate)}
      noteDate={selectedDate}
    />
  );

  const renderRestCard = (staff: StaffType) => (
    <SPOffCard
      key={staff.id}
      staffId={staff.id}
      staffName={staff.name}
      staff={staff}
      label={isReadOnly ? "休み" : "休み希望"}
      labelTone="muted"
      onTap={() => handleCardTap(staff.id)}
      isReadOnly={isReadOnly}
      hasError={issueStaffIds.has(staff.id)}
      warningMessages={warningMessagesByStaffId.get(staff.id) ?? []}
      note={dateNotes.getNote(staff.id, selectedDate)}
      noteDate={selectedDate}
    />
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
        // テンプレートは、日付と表示設定の間に置く。
        headingAction={staffingView && <DayTemplateMenu date={selectedDate} view={staffingView} shrinks />}
      />
      {/* 充足。閉じている間は、日付の見出しの下に留める。 */}
      <DetailControls />
      <Box
        flex={1}
        minH={0}
        overflow="auto"
        bg="gray.50"
        // カードのバーの両端を、充足の帯と時刻の軸にそろえるため、物差しと同じ余白を使う。
        px={`${SP_LIST_PADDING_X_PX}px`}
        py={3}
        data-tour="shift-grid"
      >
        {isShopClosedDate ? (
          <Flex minH="240px" align="center" justify="center" direction="column" gap={2} px={4}>
            <Box textStyle="md" fontWeight={700} color="gray.700">
              定休日
            </Box>
            <Box textStyle="sm" color="fg.muted" textAlign="center" lineHeight={1.7}>
              この日は店舗の定休日のため、シフトを登録できません。
            </Box>
          </Flex>
        ) : (
          <Stack gap={4}>
            {workRows.length > 0 && (
              <Box>
                <SectionHeader label="出勤あり" count={workRows.length} />
                <Stack gap={2}>{workRows.map(renderDailyCard)}</Stack>
              </Box>
            )}
            {requestRows.length > 0 && (
              <Box>
                <SectionHeader label="出勤希望" count={requestRows.length} hint="タップで追加" />
                <Stack gap={2}>{requestRows.map(renderDailyCard)}</Stack>
              </Box>
            )}
            {restRows.length > 0 && (
              <Box>
                <SectionHeader label="休み" count={restRows.length} hint={isReadOnly ? undefined : "タップで追加"} />
                <Stack gap="6px">{restRows.map(({ staff }) => renderRestCard(staff))}</Stack>
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
                      staff={staff}
                      label="未提出"
                      labelTone="warning"
                      onTap={() => handleCardTap(staff.id)}
                      isReadOnly={isReadOnly}
                      hasError={issueStaffIds.has(staff.id)}
                      warningMessages={warningMessagesByStaffId.get(staff.id) ?? []}
                      note={dateNotes.getNote(staff.id, selectedDate)}
                      noteDate={selectedDate}
                    />
                  ))}
                </Stack>
              </Box>
            )}
            {foldedRows.length > 0 && (
              <Box>
                <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="md" overflow="hidden">
                  <FoldedStaffGroupToggle
                    group={{
                      label: `休み希望 ${foldedRows.length}人`,
                      namesLabel: buildStaffNamesLabel(foldedRows.map(({ staff }) => staff.name)),
                    }}
                    isOpen={isFoldedOpen}
                    onToggle={() => setOpenFoldedDate(isFoldedOpen ? null : selectedDate)}
                  />
                </Box>
                {isFoldedOpen && (
                  <Stack gap="6px" mt={2}>
                    {foldedRows.map(({ staff }) => renderRestCard(staff))}
                  </Stack>
                )}
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
          key={`${selectedStaff.id}-${selectedDate}`}
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
