import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { CreateRecruitmentData, CreateRecruitmentShop } from "@/src/components/features/CreateRecruitmentForm";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { EditRecruitmentDialog } from "@/src/components/features/EditRecruitmentDialog";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { OrganizationRecruitmentPastConnection } from "./OrganizationRecruitmentPastConnection";
import type { OrganizationRecruitmentManagementProps, OrganizationRecruitmentShopMetadata } from "./types";

const TARGET_SHOP_UNAVAILABLE_MESSAGE = "対象の店舗を確認できません。\nシフト一覧を再読み込みしてください。";

type DeleteTarget = {
  recruitment: Recruitment;
  shop: OrganizationRecruitmentShopMetadata;
};

export type {
  OrganizationRecruitmentManagementProps,
  OrganizationRecruitmentShop,
  OrganizationRecruitmentShopMetadata,
} from "./types";

export function OrganizationRecruitmentManagement({
  organizationId,
  shopFilter,
  isSingleShop,
  groups,
  shops,
  getRecruitmentShop,
  onOpenShiftBoard,
}: OrganizationRecruitmentManagementProps) {
  const createRecruitment = useMutation(api.recruitment.mutations.createRecruitment);
  const deleteRecruitment = useMutation(api.recruitment.mutations.deleteRecruitment);
  const createDialog = useDialog();
  const deleteDialog = useDialog();
  const [createSessionRevision, setCreateSessionRevision] = useState(0);
  const [isCreateFormSubmitting, setIsCreateFormSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [editTarget, setEditTarget] = useState<DeleteTarget | null>(null);
  const interactionScopeKey = `${organizationId}:${shopFilter}`;
  const previousInteractionScopeKeyRef = useRef(interactionScopeKey);
  const activeInteractionScopeKeyRef = useRef(interactionScopeKey);
  activeInteractionScopeKeyRef.current = interactionScopeKey;
  const writableShops = useMemo(() => shops.filter((shop) => shop.canCreate), [shops]);
  const filteredShop = useMemo(
    () =>
      shopFilter === "all" ? (isSingleShop ? shops[0] : undefined) : shops.find((shop) => shop.shopId === shopFilter),
    [isSingleShop, shopFilter, shops],
  );
  const resolveRecruitmentShop = useCallback(
    (recruitment: Recruitment) =>
      getRecruitmentShop(recruitment) ??
      (filteredShop ? { shopId: filteredShop.shopId, shopName: filteredShop.shopName } : undefined),
    [filteredShop, getRecruitmentShop],
  );
  const canCreateRecruitments = writableShops.length > 0;
  const canDeleteRecruitments = filteredShop
    ? filteredShop.canCreate
    : groups
        .flatMap((group) => group.recruitments)
        .every((recruitment) => {
          const targetShop = resolveRecruitmentShop(recruitment);
          return !!targetShop && shops.some((shop) => shop.canCreate && shop.shopId === targetShop.shopId);
        });
  const createDisabledReason = canCreateRecruitments
    ? undefined
    : (shops.find((shop) => !shop.canCreate)?.createDisabledReason ?? "募集を作成できる店舗がありません。");
  const deleteDisabledReason = canDeleteRecruitments
    ? undefined
    : (filteredShop?.createDisabledReason ??
      groups
        .flatMap((group) => group.recruitments)
        .map(resolveRecruitmentShop)
        .filter((shop) => shop !== undefined)
        .map((targetShop) => shops.find((shop) => shop.shopId === targetShop.shopId))
        .find((shop) => shop && !shop.canCreate)?.createDisabledReason ??
      "対象店舗を確認できない募集があるため、削除できません。");

  const closeCreateDialog = createDialog.close;
  const closeDeleteDialog = deleteDialog.close;
  useEffect(() => {
    if (previousInteractionScopeKeyRef.current === interactionScopeKey) return;
    previousInteractionScopeKeyRef.current = interactionScopeKey;
    closeCreateDialog();
    closeDeleteDialog();
    setCreateSessionRevision((revision) => revision + 1);
    setIsCreateFormSubmitting(false);
    setDeleteTarget(null);
    setEditTarget(null);
  }, [closeCreateDialog, closeDeleteDialog, interactionScopeKey]);

  useEffect(() => {
    if (canCreateRecruitments) return;
    closeCreateDialog();
  }, [canCreateRecruitments, closeCreateDialog]);

  useEffect(() => {
    if (canDeleteRecruitments) return;
    closeDeleteDialog();
    setDeleteTarget(null);
  }, [canDeleteRecruitments, closeDeleteDialog]);

  const { run: handleCreate, isRunning: isCreating } = useSingleFlight(
    async (data: CreateRecruitmentData, selectedShop?: CreateRecruitmentShop) => {
      if (!canCreateRecruitments || !selectedShop) return;
      const targetShop = shops.find((shop) => shop.shopId === selectedShop.shopId && shop.canCreate);
      if (!targetShop) {
        showErrorToast(new Error(TARGET_SHOP_UNAVAILABLE_MESSAGE));
        return;
      }

      const requestedOrganizationId = organizationId;
      const requestedInteractionScopeKey = interactionScopeKey;
      try {
        await createRecruitment({
          ...data,
          shopId: targetShop.shopId,
          expectedOrganizationId: requestedOrganizationId,
        });
        if (activeInteractionScopeKeyRef.current !== requestedInteractionScopeKey) return;
        createDialog.close();
        showSuccessToast({
          title: "シフト提出依頼をスタッフに送りました",
        });
      } catch (error) {
        if (activeInteractionScopeKeyRef.current !== requestedInteractionScopeKey) return;
        showErrorToast(error);
      }
    },
  );

  const handleOpenCreate = useCallback(() => {
    if (!canCreateRecruitments) return;
    setCreateSessionRevision((revision) => revision + 1);
    setIsCreateFormSubmitting(false);
    createDialog.open();
  }, [canCreateRecruitments, createDialog.open]);

  const handleDeleteClick = useCallback(
    (recruitment: Recruitment, recruitmentShop?: OrganizationRecruitmentShopMetadata) => {
      if (!canDeleteRecruitments) return;
      const targetShop = recruitmentShop ?? resolveRecruitmentShop(recruitment);
      if (!targetShop || !writableShops.some((shop) => shop.shopId === targetShop.shopId)) {
        showErrorToast(new Error(TARGET_SHOP_UNAVAILABLE_MESSAGE));
        return;
      }
      setDeleteTarget({ recruitment, shop: targetShop });
      deleteDialog.open();
    },
    [canDeleteRecruitments, deleteDialog.open, resolveRecruitmentShop, writableShops],
  );

  const { run: handleDelete, isRunning: isDeleting } = useSingleFlight(async () => {
    if (!canDeleteRecruitments || !deleteTarget) return;
    if (!shops.some((shop) => shop.canCreate && shop.shopId === deleteTarget.shop.shopId)) {
      deleteDialog.close();
      setDeleteTarget(null);
      showErrorToast(new Error(TARGET_SHOP_UNAVAILABLE_MESSAGE));
      return;
    }

    const requestedOrganizationId = organizationId;
    const requestedInteractionScopeKey = interactionScopeKey;
    try {
      await deleteRecruitment({
        recruitmentId: deleteTarget.recruitment._id,
        shopId: deleteTarget.shop.shopId,
        expectedOrganizationId: requestedOrganizationId,
      });
      if (activeInteractionScopeKeyRef.current !== requestedInteractionScopeKey) return;
      deleteDialog.close();
      setDeleteTarget(null);
      showSuccessToast({ title: "シフト募集を削除しました" });
    } catch (error) {
      if (activeInteractionScopeKeyRef.current !== requestedInteractionScopeKey) return;
      showErrorToast(error);
    }
  });

  return (
    <>
      <OrganizationRecruitmentPastConnection
        organizationId={organizationId}
        shopFilter={shopFilter}
        isSingleShop={isSingleShop}
        groups={groups}
        shops={shops}
        canCreateRecruitments={canCreateRecruitments}
        createDisabledReason={createDisabledReason}
        canDeleteRecruitments={canDeleteRecruitments}
        deleteDisabledReason={deleteDisabledReason}
        createSessionKey={`${organizationId}:${createSessionRevision}`}
        createDialog={createDialog}
        deleteDialog={deleteDialog}
        deleteTarget={deleteTarget?.recruitment ?? null}
        isCreateBusy={isCreating || isCreateFormSubmitting}
        isDeleting={isDeleting}
        getRecruitmentShop={resolveRecruitmentShop}
        onOpenCreate={handleOpenCreate}
        onCreate={handleCreate}
        onCreateSubmittingChange={setIsCreateFormSubmitting}
        onOpenShiftBoard={onOpenShiftBoard}
        onDeleteClick={handleDeleteClick}
        onEditClick={(recruitment) => {
          const shop = resolveRecruitmentShop(recruitment);
          if (shop && writableShops.some((item) => item.shopId === shop.shopId)) setEditTarget({ recruitment, shop });
        }}
        onDeleteConfirm={handleDelete}
      />
      {editTarget && writableShops.some((shop) => shop.shopId === editTarget.shop.shopId) && (
        <EditRecruitmentDialog
          key={`${organizationId}:${editTarget.recruitment._id}`}
          recruitment={
            groups.flatMap((group) => group.recruitments).find((item) => item._id === editTarget.recruitment._id) ??
            null
          }
          shop={{
            ...editTarget.shop,
            regularClosedDays: shops.find((shop) => shop.shopId === editTarget.shop.shopId)?.regularClosedDays ?? [],
          }}
          expectedOrganizationId={organizationId}
          onClose={() => setEditTarget(null)}
        />
      )}
    </>
  );
}
