import { useBreakpointValue } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { ContentWrapper } from "@/src/components/templates/ContentWrapper";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { AddStaffForm } from "../AddStaffForm";
import { CreateRecruitmentForm } from "../CreateRecruitmentForm";
import { RecruitmentSection } from "../RecruitmentSection";
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
  const isMobile = useBreakpointValue({ base: true, lg: false });

  const Modal = isMobile ? BottomSheet : Dialog;

  const handleOpenShiftBoard = (recruitmentId: string) => {
    navigate({ to: "/shiftboard/$recruitmentId", params: { recruitmentId } });
  };

  return (
    <>
      <ContentWrapper>
        <RecruitmentSection
          recruitments={recruitments}
          onCreateClick={recruitmentModal.open}
          onOpenShiftBoard={handleOpenShiftBoard}
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
        submitLabel="追加する"
        onClose={staffModal.close}
      >
        <AddStaffForm />
      </Modal>
    </>
  );
};
