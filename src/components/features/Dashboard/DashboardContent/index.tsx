import { useBreakpointValue } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ContentWrapper } from "@/src/components/templates/ContentWrapper";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { AddStaffForm } from "../AddStaffForm/index.tsx";
import { CreateRecruitmentForm } from "../CreateRecruitmentForm/index.tsx";
import { RecruitmentSection } from "../RecruitmentSection";
import type { SetupData } from "../SetupModal";
import { SetupModal } from "../SetupModal";
import { StaffSection } from "../StaffSection";
import type { Recruitment, Staff } from "../types";

type Props = {
  shop: { name: string } | null;
  recruitments: Recruitment[];
  staffs: Staff[];
};

export const DashboardContent = ({ shop, recruitments, staffs }: Props) => {
  const navigate = useNavigate();
  const recruitmentModal = useDialog();
  const staffModal = useDialog();
  const isMobile = useBreakpointValue({ base: true, lg: false });
  const isSetupRequired = shop === null;

  const setupShopAndOwner = useMutation(api.setup.mutations.setupShopAndOwner);
  const createRecruitment = useMutation(api.recruitment.mutations.createRecruitment);
  const addStaffs = useMutation(api.staff.mutations.addStaffs);

  const Modal = isMobile ? BottomSheet : Dialog;

  const handleOpenShiftBoard = (recruitmentId: string) => {
    navigate({ to: "/shiftboard/$recruitmentId", params: { recruitmentId } });
  };

  const handleSetupComplete = async (data: SetupData) => {
    try {
      await setupShopAndOwner({
        shopName: data.shopName,
        shiftStartTime: data.shiftStartTime,
        shiftEndTime: data.shiftEndTime,
        ownerName: data.name,
        ownerEmail: data.email,
      });
      toaster.create({ title: "セットアップが完了しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  };

  const handleCreateRecruitment = async (data: { periodStart: string; periodEnd: string; deadline: string }) => {
    try {
      await createRecruitment(data);
      recruitmentModal.close();
      toaster.create({ title: "シフトを作成しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  };

  const handleAddStaffs = async (data: { entries: Array<{ name: string; email: string }> }) => {
    try {
      await addStaffs({ entries: data.entries });
      staffModal.close();
      toaster.create({ title: "スタッフを追加しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
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
        title="シフト希望を集める"
        isOpen={recruitmentModal.isOpen}
        onOpenChange={recruitmentModal.onOpenChange}
        formId="create-recruitment-form"
        submitLabel="作成する"
        onClose={recruitmentModal.close}
      >
        <CreateRecruitmentForm onSubmit={handleCreateRecruitment} />
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
        <AddStaffForm onSubmit={handleAddStaffs} />
      </Modal>

      {isSetupRequired && <SetupModal isOpen={true} onOpenChange={() => {}} onComplete={handleSetupComplete} />}
    </>
  );
};
