import { useBreakpointValue } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ContentWrapper } from "@/src/components/templates/ContentWrapper";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { AddStaffForm } from "../AddStaffForm";
import { CreateRecruitmentForm } from "../CreateRecruitmentForm";
import { RecruitmentSection } from "../RecruitmentSection";
import { SetupModal } from "../SetupModal";
import { StaffSection } from "../StaffSection";
import type { Recruitment, Staff } from "../types";

type Props = {
  recruitments: Recruitment[];
  staffs: Staff[];
};

export const DashboardContent = ({ recruitments, staffs }: Props) => {
  const navigate = useNavigate();
  const recruitmentModal = useDialog();
  const staffModal = useDialog();
  const setupModal = useDialog();
  const isMobile = useBreakpointValue({ base: true, lg: false });
  const [hasStaffEntry, setHasStaffEntry] = useState(false);
  const isEmpty = recruitments.length === 0 && staffs.length === 0;

  const Modal = isMobile ? BottomSheet : Dialog;

  const handleOpenShiftBoard = (recruitmentId: string) => {
    navigate({ to: "/shiftboard/$recruitmentId", params: { recruitmentId } });
  };

  const handleStaffEntriesChange = useCallback((hasValid: boolean) => {
    setHasStaffEntry(hasValid);
  }, []);

  return (
    <>
      <ContentWrapper>
        <RecruitmentSection
          recruitments={recruitments}
          onCreateClick={recruitmentModal.open}
          onOpenShiftBoard={handleOpenShiftBoard}
          onSetupClick={isEmpty ? setupModal.open : undefined}
        />
        <StaffSection staffs={staffs} onAddClick={staffModal.open} />
      </ContentWrapper>

      <Modal
        title="新しい募集を作成"
        isOpen={recruitmentModal.isOpen}
        onOpenChange={recruitmentModal.onOpenChange}
        onSubmit={recruitmentModal.close}
        submitLabel="作成する"
        onClose={recruitmentModal.close}
      >
        <CreateRecruitmentForm />
      </Modal>

      <Modal
        title="スタッフを追加"
        isOpen={staffModal.isOpen}
        onOpenChange={staffModal.onOpenChange}
        onSubmit={staffModal.close}
        submitLabel="登録する"
        onClose={staffModal.close}
        isSubmitDisabled={!hasStaffEntry}
        maxW="640px"
      >
        <AddStaffForm onEntriesChange={handleStaffEntriesChange} />
      </Modal>

      {isEmpty && (
        <SetupModal
          isOpen={setupModal.isOpen}
          onOpenChange={setupModal.onOpenChange}
          onComplete={(data) => {
            console.log("Setup complete:", data);
            setupModal.close();
          }}
        />
      )}
    </>
  );
};
