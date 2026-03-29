import { Box, useBreakpointValue } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import type { ShiftData } from "@/src/components/features/Shift/ShiftForm/types";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { ConfirmShiftContent } from "../ConfirmShiftContent";
import { mockDates, mockPeriodLabel, mockPositions, mockShifts, mockStaffs, mockTimeRange } from "../mocks";
import { ShiftBoardHeader } from "../ShiftBoardHeader";
import { ShiftBoardSPHeader } from "../ShiftBoardSPHeader";

export const ShiftBoardPage = () => {
  const navigate = useNavigate();
  const isMobile = useBreakpointValue({ base: true, lg: false });

  const [confirmedAt, setConfirmedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const shiftsRef = useRef<ShiftData[]>(mockShifts);
  const handleShiftsChange = useCallback((shifts: ShiftData[]) => {
    shiftsRef.current = shifts;
  }, []);

  const confirmModal = useDialog();
  const Modal = isMobile ? BottomSheet : Dialog;

  const submittedCount = mockStaffs.filter((s) => s.isSubmitted).length;
  const isConfirmed = confirmedAt !== null;

  const handleBack = useCallback(() => {
    navigate({ to: "/dashboard" });
  }, [navigate]);

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

  const confirmTitle = isConfirmed ? "シフトを再送しますか？" : "シフトを確定しますか？";

  return (
    <Box display="flex" flexDirection="column">
      <Box display={{ base: "none", lg: "block" }}>
        <ShiftBoardHeader
          periodLabel={mockPeriodLabel}
          submittedCount={submittedCount}
          totalStaffCount={mockStaffs.length}
          confirmedAt={confirmedAt}
          onSave={handleSave}
          onConfirm={confirmModal.open}
          isSaving={isSaving}
        />
      </Box>

      <Box px={{ base: 0, lg: 6 }}>
        <Box display={{ base: "block", lg: "none" }}>
          <ShiftBoardSPHeader
            periodLabel={mockPeriodLabel}
            submittedCount={submittedCount}
            totalStaffCount={mockStaffs.length}
            confirmedAt={confirmedAt}
            onBack={handleBack}
            onSave={handleSave}
            onConfirm={confirmModal.open}
            isSaving={isSaving}
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
        />
      </Box>

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
