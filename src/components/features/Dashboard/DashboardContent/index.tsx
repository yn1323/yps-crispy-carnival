import { useBreakpointValue } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { ContentWrapper } from "@/src/components/templates/ContentWrapper";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { AddStaffForm } from "../AddStaffForm/index.tsx";
import { CreateRecruitmentForm } from "../CreateRecruitmentForm/index.tsx";
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
  const hasNoRecruitments = recruitments.length === 0;

  const Modal = isMobile ? BottomSheet : Dialog;

  const handleOpenShiftBoard = (recruitmentId: string) => {
    navigate({ to: "/shiftboard/$recruitmentId", params: { recruitmentId } });
  };

  return (
    <>
      <ContentWrapper>
        <RecruitmentSection
          recruitments={recruitments}
          onCreateClick={hasNoRecruitments ? setupModal.open : recruitmentModal.open}
          onOpenShiftBoard={handleOpenShiftBoard}
          onSetupClick={hasNoRecruitments ? setupModal.open : undefined}
        />
        <StaffSection staffs={staffs} onAddClick={staffModal.open} />
      </ContentWrapper>

      <Modal
        title="新しい募集を作成"
        isOpen={recruitmentModal.isOpen}
        onOpenChange={recruitmentModal.onOpenChange}
        formId="create-recruitment-form"
        submitLabel="作成する"
        onClose={recruitmentModal.close}
      >
        <CreateRecruitmentForm
          onSubmit={(data) => {
            console.log("Recruitment created:", data);
            recruitmentModal.close();
          }}
        />
      </Modal>

      <Modal
        title="スタッフを追加"
        isOpen={staffModal.isOpen}
        onOpenChange={staffModal.onOpenChange}
        formId="add-staff-form"
        submitLabel="登録する"
        onClose={staffModal.close}
        maxW="640px"
        maxH="85dvh"
      >
        <AddStaffForm
          onSubmit={(data) => {
            console.log("Staff added:", data);
            staffModal.close();
          }}
        />
      </Modal>

      {hasNoRecruitments && (
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
