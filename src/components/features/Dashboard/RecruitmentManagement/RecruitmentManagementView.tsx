import { Text } from "@chakra-ui/react";
import { useState } from "react";
import type { RegularClosedDay } from "@/convex/shop/schemas";
import {
  type CreateRecruitmentData,
  CreateRecruitmentForm,
  type CreateRecruitmentShop,
  type CreateRecruitmentShopTarget,
} from "@/src/components/features/CreateRecruitmentForm";
import { Dialog } from "@/src/components/ui/Dialog";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { formatDateShort } from "@/src/domains/shift/date";
import { RecruitmentBoard } from "../RecruitmentBoard";
import type { DashboardRecruitmentGroup, PaginationStatus, Recruitment } from "../types";

type Props = {
  regularClosedDays: RegularClosedDay[];
  shopTarget?: CreateRecruitmentShopTarget;
  title?: string;
  groups: DashboardRecruitmentGroup[];
  isReadOnly: boolean;
  showRecruitmentMenus?: boolean;
  canDeleteRecruitments?: boolean;
  deleteRecruitmentDisabledReason?: string;
  pastStatus: PaginationStatus;
  hasPastRecruitments: boolean;
  isPastRecruitmentsVisible: boolean;
  canLoadMorePastRecruitments: boolean;
  tourRecruitmentId?: Recruitment["_id"];
  createSessionKey: string;
  createDialog: {
    isOpen: boolean;
    onOpenChange: (details: { open: boolean }) => void;
    close: () => void;
  };
  deleteDialog: {
    isOpen: boolean;
    onOpenChange: (details: { open: boolean }) => void;
    close: () => void;
  };
  deleteTarget: Recruitment | null;
  isDeleting: boolean;
  onOpenCreate: () => void;
  onCreate: (data: CreateRecruitmentData, selectedShop?: CreateRecruitmentShop) => void | Promise<void>;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onDeleteClick: (recruitment: Recruitment) => void;
  onDeleteConfirm: () => void | Promise<void>;
  onShowPastRecruitments: () => void;
  onLoadMorePastRecruitments: () => void;
};

export function RecruitmentManagementView({
  regularClosedDays,
  shopTarget,
  title,
  groups,
  isReadOnly,
  showRecruitmentMenus,
  canDeleteRecruitments,
  deleteRecruitmentDisabledReason,
  pastStatus,
  hasPastRecruitments,
  isPastRecruitmentsVisible,
  canLoadMorePastRecruitments,
  tourRecruitmentId,
  createSessionKey,
  createDialog,
  deleteDialog,
  deleteTarget,
  isDeleting,
  onOpenCreate,
  onCreate,
  onOpenShiftBoard,
  onDeleteClick,
  onDeleteConfirm,
  onShowPastRecruitments,
  onLoadMorePastRecruitments,
}: Props) {
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const deleteTitle = deleteTarget
    ? `${formatDateShort(deleteTarget.periodStart)}〜${formatDateShort(deleteTarget.periodEnd)}のシフト募集を削除`
    : "シフト募集を削除";

  return (
    <>
      <RecruitmentBoard
        title={title}
        groups={groups}
        isReadOnly={isReadOnly}
        showRecruitmentMenus={showRecruitmentMenus}
        canDeleteRecruitments={canDeleteRecruitments}
        deleteRecruitmentDisabledReason={deleteRecruitmentDisabledReason}
        pastStatus={pastStatus}
        hasPastRecruitments={hasPastRecruitments}
        isPastRecruitmentsVisible={isPastRecruitmentsVisible}
        canLoadMorePastRecruitments={canLoadMorePastRecruitments}
        tourRecruitmentId={tourRecruitmentId}
        onCreateClick={onOpenCreate}
        onOpenShiftBoard={onOpenShiftBoard}
        onDeleteRecruitment={onDeleteClick}
        onShowPastRecruitments={onShowPastRecruitments}
        onLoadMorePastRecruitments={onLoadMorePastRecruitments}
      />

      <StepperDialog
        title="新しい募集をつくる"
        isOpen={createDialog.isOpen && !isReadOnly}
        onOpenChange={createDialog.onOpenChange}
        onClose={createDialog.close}
        preventClose={isCreateSubmitting}
      >
        <CreateRecruitmentForm
          key={createSessionKey}
          regularClosedDays={regularClosedDays}
          shopTarget={shopTarget}
          onSubmit={onCreate}
          onCancel={createDialog.close}
          onSubmittingChange={setIsCreateSubmitting}
        />
      </StepperDialog>

      <Dialog
        title={deleteTitle}
        isOpen={deleteDialog.isOpen && !isReadOnly}
        onOpenChange={deleteDialog.onOpenChange}
        onClose={deleteDialog.close}
        onSubmit={onDeleteConfirm}
        submitLabel="この募集を削除"
        role="alertdialog"
        submitColorPalette="red"
        isLoading={isDeleting}
        isSubmitDisabled={isReadOnly || isDeleting}
        mobileActionLayout="stacked"
      >
        <Text>この募集を削除すると元に戻せません。</Text>
      </Dialog>
    </>
  );
}
