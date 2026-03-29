import { Box, useBreakpointValue } from "@chakra-ui/react";
import { useCallback, useRef, useState } from "react";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import type { ShiftData, ViewMode } from "@/src/components/features/Shift/ShiftForm/types";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { ConfirmShiftContent } from "../ConfirmShiftContent";
import { mockDates, mockPeriodLabel, mockPositions, mockShifts, mockStaffs, mockTimeRange } from "../mocks";
import { ShiftBoardHeader } from "../ShiftBoardHeader";
import { ShiftBoardSPHeader } from "../ShiftBoardSPHeader";

export const ShiftBoardPage = () => {
  const isMobile = useBreakpointValue({ base: true, lg: false });

  const [confirmedAt, setConfirmedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("daily");

  const shiftsRef = useRef<ShiftData[]>(mockShifts);
  const handleShiftsChange = useCallback((shifts: ShiftData[]) => {
    shiftsRef.current = shifts;
  }, []);

  const confirmModal = useDialog();
  const Modal = isMobile ? BottomSheet : Dialog;

  const isConfirmed = confirmedAt !== null;

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    // TODO: Convex mutation で保存
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsSaving(false);
    toaster.create({ title: "保存しました", type: "success" });
  }, [isSaving]);

  const handleConfirm = useCallback(() => {
    // TODO: Convex mutation で確定
    setConfirmedAt(new Date());
    confirmModal.close();
    toaster.create({ title: "シフトを確定しました", type: "success" });
  }, [confirmModal]);

  const confirmTitle = isConfirmed ? "シフトを再確定しますか？" : "シフトを確定しますか？";

  return (
    <Box>
      <Box display={{ base: "none", lg: "block" }}>
        <ShiftBoardHeader
          periodLabel={mockPeriodLabel}
          confirmedAt={confirmedAt}
          onSave={handleSave}
          onConfirm={confirmModal.open}
          isSaving={isSaving}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </Box>

      <Box display={{ base: "block", lg: "none" }}>
        <ShiftBoardSPHeader
          periodLabel={mockPeriodLabel}
          confirmedAt={confirmedAt}
          onSave={handleSave}
          onConfirm={confirmModal.open}
          isSaving={isSaving}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </Box>

      <ShiftForm
        shopId="shop-1"
        staffs={mockStaffs}
        positions={mockPositions}
        initialShifts={mockShifts}
        dates={mockDates}
        timeRange={mockTimeRange}
        onShiftsChange={handleShiftsChange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        hideViewSwitcher
      />

      <Modal
        title={confirmTitle}
        isOpen={confirmModal.isOpen}
        onOpenChange={confirmModal.onOpenChange}
        onSubmit={handleConfirm}
        submitLabel="確定する"
        onClose={confirmModal.close}
      >
        <ConfirmShiftContent staffCount={mockStaffs.length} periodLabel={mockPeriodLabel} />
      </Modal>
    </Box>
  );
};
