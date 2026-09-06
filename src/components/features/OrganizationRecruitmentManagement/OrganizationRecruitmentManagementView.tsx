import { Text } from "@chakra-ui/react";
import type { CreateRecruitmentData, CreateRecruitmentShop } from "@/src/components/features/CreateRecruitmentForm";
import { CreateRecruitmentForm } from "@/src/components/features/CreateRecruitmentForm";
import { RecruitmentBoard } from "@/src/components/features/Dashboard/RecruitmentBoard";
import type { DashboardRecruitmentGroup, Recruitment } from "@/src/components/features/Dashboard/types";
import { Dialog } from "@/src/components/ui/Dialog";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { formatDateShort } from "@/src/domains/shift/date";
import type { OrganizationRecruitmentShop, OrganizationRecruitmentShopMetadata } from "./types";

type DialogState = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  close: () => void;
};

type Props = {
  groups: DashboardRecruitmentGroup[];
  shops: readonly OrganizationRecruitmentShop[];
  canCreateRecruitments: boolean;
  createDisabledReason?: string;
  canDeleteRecruitments: boolean;
  deleteDisabledReason?: string;
  createSessionKey: string;
  createDialog: DialogState;
  deleteDialog: DialogState;
  deleteTarget: Recruitment | null;
  isCreateBusy: boolean;
  isDeleting: boolean;
  pastStatus: "CanLoadMore" | "LoadingMore" | "LoadingFirstPage" | "Exhausted";
  hasPastRecruitments: boolean;
  isPastRecruitmentsVisible: boolean;
  canLoadMorePastRecruitments: boolean;
  pastListNotice?: string;
  getRecruitmentShop: (recruitment: Recruitment) => OrganizationRecruitmentShopMetadata | undefined;
  onOpenCreate: () => void;
  onCreate: (data: CreateRecruitmentData, selectedShop?: CreateRecruitmentShop) => void | Promise<void>;
  onCreateSubmittingChange: (isSubmitting: boolean) => void;
  onOpenShiftBoard: (recruitmentId: Recruitment["_id"]) => void;
  onDeleteClick: (recruitment: Recruitment, shop?: OrganizationRecruitmentShopMetadata) => void;
  onEditClick: (recruitment: Recruitment) => void;
  onDeleteConfirm: () => void | Promise<void>;
  onShowPastRecruitments: () => void;
  onLoadMorePastRecruitments: () => void;
};

export function OrganizationRecruitmentManagementView({
  groups,
  shops,
  canCreateRecruitments,
  createDisabledReason,
  canDeleteRecruitments,
  deleteDisabledReason,
  createSessionKey,
  createDialog,
  deleteDialog,
  deleteTarget,
  isCreateBusy,
  isDeleting,
  pastStatus,
  hasPastRecruitments,
  isPastRecruitmentsVisible,
  canLoadMorePastRecruitments,
  pastListNotice,
  getRecruitmentShop,
  onOpenCreate,
  onCreate,
  onCreateSubmittingChange,
  onOpenShiftBoard,
  onDeleteClick,
  onEditClick,
  onDeleteConfirm,
  onShowPastRecruitments,
  onLoadMorePastRecruitments,
}: Props) {
  const selectableShops = shops
    .filter((shop) => shop.canCreate)
    .map(({ shopId, shopName, regularClosedDays }) => ({ shopId, shopName, regularClosedDays }));
  const selectableShopSignature = selectableShops
    .map((shop) => `${shop.shopId}:${shop.shopName}:${shop.regularClosedDays.join(",")}`)
    .join("|");
  const deleteTitle = deleteTarget
    ? `${formatDateShort(deleteTarget.periodStart)}〜${formatDateShort(deleteTarget.periodEnd)}のシフト募集を削除`
    : "シフト募集を削除";
  const hasVisibleRecruitments = groups.some((group) => group.recruitments.length > 0);

  return (
    <>
      <RecruitmentBoard
        title="シフト一覧"
        groups={groups}
        canCreateRecruitments={canCreateRecruitments}
        createRecruitmentDisabledReason={createDisabledReason}
        showRecruitmentMenus
        canDeleteRecruitments={canDeleteRecruitments}
        deleteRecruitmentDisabledReason={deleteDisabledReason}
        pastStatus={pastStatus}
        hasPastRecruitments={hasPastRecruitments}
        isPastRecruitmentsVisible={isPastRecruitmentsVisible}
        canLoadMorePastRecruitments={canLoadMorePastRecruitments}
        getRecruitmentShopName={(recruitment) => getRecruitmentShop(recruitment)?.shopName}
        getCanEditRecruitment={(recruitment) => {
          const target = getRecruitmentShop(recruitment);
          return !!target && shops.some((shop) => shop.shopId === target.shopId && shop.canCreate);
        }}
        onCreateClick={onOpenCreate}
        onOpenShiftBoard={(recruitmentId) => onOpenShiftBoard(recruitmentId as Recruitment["_id"])}
        onDeleteRecruitment={(recruitment) => onDeleteClick(recruitment, getRecruitmentShop(recruitment))}
        onEditRecruitment={onEditClick}
        onShowPastRecruitments={onShowPastRecruitments}
        onLoadMorePastRecruitments={onLoadMorePastRecruitments}
      />

      {pastListNotice && isPastRecruitmentsVisible && hasVisibleRecruitments && (
        <Text fontSize="sm" color="fg.muted" textAlign={{ base: "left", md: "center" }}>
          {pastListNotice}
        </Text>
      )}

      <StepperDialog
        title="新しい募集をつくる"
        isOpen={createDialog.isOpen && canCreateRecruitments && selectableShops.length > 0}
        onOpenChange={createDialog.onOpenChange}
        onClose={createDialog.close}
        preventClose={isCreateBusy}
      >
        <CreateRecruitmentForm
          key={`${createSessionKey}:${selectableShopSignature}`}
          shopTarget={{ mode: "select", shops: selectableShops }}
          onSubmit={onCreate}
          onCancel={createDialog.close}
          onSubmittingChange={onCreateSubmittingChange}
        />
      </StepperDialog>

      <Dialog
        title={deleteTitle}
        isOpen={deleteDialog.isOpen && canDeleteRecruitments}
        onOpenChange={deleteDialog.onOpenChange}
        onClose={deleteDialog.close}
        onSubmit={onDeleteConfirm}
        submitLabel="この募集を削除"
        role="alertdialog"
        submitColorPalette="red"
        isLoading={isDeleting}
        isSubmitDisabled={!canDeleteRecruitments || isDeleting}
        preventClose={isDeleting}
      >
        <Text>この募集を削除すると元に戻せません。</Text>
      </Dialog>
    </>
  );
}
