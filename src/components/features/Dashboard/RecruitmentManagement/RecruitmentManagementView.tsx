import { Text } from "@chakra-ui/react";
import type { RegularClosedDay } from "@/convex/shop/schemas";
import { type CreateRecruitmentData, CreateRecruitmentForm } from "@/src/components/features/CreateRecruitmentForm";
import { Dialog } from "@/src/components/ui/Dialog";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { formatDateShort } from "@/src/domains/shift/date";
import { RecruitmentBoard } from "../RecruitmentBoard";
import type { DashboardRecruitmentGroup, PaginationStatus, Recruitment } from "../types";

type Props = {
  regularClosedDays: RegularClosedDay[];
  groups: DashboardRecruitmentGroup[];
  isReadOnly: boolean;
  pastStatus: PaginationStatus;
  hasPastRecruitments: boolean;
  isPastRecruitmentsVisible: boolean;
  canLoadMorePastRecruitments: boolean;
  tourRecruitmentId?: Recruitment["_id"];
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
  onCreate: (data: CreateRecruitmentData) => void | Promise<void>;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onDeleteClick: (recruitment: Recruitment) => void;
  onDeleteConfirm: () => void | Promise<void>;
  onShowPastRecruitments: () => void;
  onLoadMorePastRecruitments: () => void;
};

export function RecruitmentManagementView({
  regularClosedDays,
  groups,
  isReadOnly,
  pastStatus,
  hasPastRecruitments,
  isPastRecruitmentsVisible,
  canLoadMorePastRecruitments,
  tourRecruitmentId,
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
  const deleteTitle = deleteTarget
    ? `${formatDateShort(deleteTarget.periodStart)}〜${formatDateShort(deleteTarget.periodEnd)}のシフト募集を削除`
    : "シフト募集を削除";

  return (
    <>
      <RecruitmentBoard
        groups={groups}
        isReadOnly={isReadOnly}
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
      >
        <CreateRecruitmentForm
          regularClosedDays={regularClosedDays}
          onSubmit={onCreate}
          onCancel={createDialog.close}
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
      >
        <Text>この募集を削除すると元に戻せません。</Text>
      </Dialog>
    </>
  );
}
