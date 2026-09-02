import { useAtomValue } from "jotai";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { RegularClosedDay } from "@/convex/shop/schemas";
import type {
  CreateRecruitmentData,
  CreateRecruitmentShopTarget,
} from "@/src/components/features/CreateRecruitmentForm";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useShopPaginatedQuery } from "@/src/hooks/useShopPaginatedQuery";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { selectedShopAtom } from "@/src/stores/shop";
import { buildDashboardRecruitmentGroups, sortRecruitmentsByCreatedAt } from "../script";
import type { DashboardRecruitmentGroup, PaginationStatus, Recruitment } from "../types";
import { getCreateRecruitmentErrorMessage } from "./presentation";
import { RecruitmentManagementView } from "./RecruitmentManagementView";

const ACTIVE_RECRUITMENT_QUERY_PAGE_SIZE = 100;
const PAST_RECRUITMENT_PAGE_SIZE = 5;

export type RecruitmentManagementData = {
  recruitments: Recruitment[];
  recruitmentList?: Recruitment[];
  groups?: DashboardRecruitmentGroup[];
  currentRecruitments?: Recruitment[];
  hasPastRecruitments?: boolean;
  isPastRecruitmentsVisible?: boolean;
  pastStatus?: PaginationStatus;
  canLoadMorePastRecruitments?: boolean;
  onShowPastRecruitments?: () => void;
  onLoadMorePastRecruitments?: () => void;
};

type RenderContentOptions = {
  onBeforeOpenShiftBoard?: (recruitmentId: Recruitment["_id"]) => void;
};

export type RecruitmentManagementState = {
  isInitialLoading: boolean;
  recruitments: Recruitment[];
  knownRecruitments: Recruitment[];
  groups: DashboardRecruitmentGroup[];
  openCreateRecruitment: () => void;
  openShiftBoard: (
    recruitmentId: Recruitment["_id"],
    onBeforeOpenShiftBoard?: (recruitmentId: Recruitment["_id"]) => void,
  ) => void;
  renderContent: (options?: RenderContentOptions) => ReactNode;
};

type Props = {
  regularClosedDays: RegularClosedDay[];
  shopTarget?: Extract<CreateRecruitmentShopTarget, { mode: "fixed" }>;
  data?: RecruitmentManagementData;
  isReadOnly?: boolean;
  title?: string;
  enablePastRecruitmentsQuery?: boolean;
  showRecruitmentMenus?: boolean;
  canDeleteRecruitments?: boolean;
  deleteRecruitmentDisabledReason?: string;
  onOpenShiftBoard?: (recruitmentId: Recruitment["_id"]) => void;
  children: (state: RecruitmentManagementState) => ReactNode;
};

export function RecruitmentManagement({
  regularClosedDays,
  shopTarget,
  data,
  isReadOnly = false,
  title,
  enablePastRecruitmentsQuery = false,
  showRecruitmentMenus,
  canDeleteRecruitments,
  deleteRecruitmentDisabledReason,
  onOpenShiftBoard,
  children,
}: Props) {
  const selectedShop = useAtomValue(selectedShopAtom);
  const createDialog = useDialog();
  const deleteDialog = useDialog();
  const [createSessionRevision, setCreateSessionRevision] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Recruitment | null>(null);
  const [isPastRecruitmentsVisible, setIsPastRecruitmentsVisible] = useState(data?.isPastRecruitmentsVisible ?? false);
  const recruitments = useShopPaginatedQuery(api.dashboard.queries.getDashboardRecruitments, data ? "skip" : {}, {
    initialNumItems: ACTIVE_RECRUITMENT_QUERY_PAGE_SIZE,
  });
  const hasPastRecruitments = useShopQuery(api.dashboard.queries.hasDashboardPastRecruitments, data ? "skip" : {});
  const pastRecruitments = useShopPaginatedQuery(
    api.dashboard.queries.getDashboardPastRecruitments,
    !isPastRecruitmentsVisible || (data && !enablePastRecruitmentsQuery) ? "skip" : {},
    { initialNumItems: PAST_RECRUITMENT_PAGE_SIZE },
  );
  const createRecruitment = useShopMutation(api.recruitment.mutations.createRecruitment);
  const deleteRecruitment = useShopMutation(api.recruitment.mutations.deleteRecruitment);

  const resolvedRecruitments = data?.recruitments ?? recruitments.results;
  const recruitmentList = data?.recruitmentList ?? [...resolvedRecruitments, ...pastRecruitments.results];
  const groups = data?.groups ?? buildDashboardRecruitmentGroups({ recruitments: recruitmentList }).groups;
  const knownRecruitments = sortRecruitmentsByCreatedAt(
    Array.from(
      new Map(
        [...recruitmentList, ...(data?.currentRecruitments ?? [])].map((recruitment) => [recruitment._id, recruitment]),
      ).values(),
    ),
  );
  const resolvedHasPastRecruitments = data?.hasPastRecruitments ?? hasPastRecruitments ?? false;
  const resolvedPastStatus = data?.pastStatus ?? pastRecruitments.status;
  const resolvedCanLoadMorePastRecruitments =
    data?.canLoadMorePastRecruitments ??
    (isPastRecruitmentsVisible &&
      (pastRecruitments.status === "CanLoadMore" || pastRecruitments.status === "LoadingMore"));
  const isInitialLoading = !data && (hasPastRecruitments === undefined || recruitments.status === "LoadingFirstPage");

  const handleShowPastRecruitments = data?.onShowPastRecruitments ?? (() => setIsPastRecruitmentsVisible(true));
  const handleLoadMorePastRecruitments =
    data?.onLoadMorePastRecruitments ?? (() => pastRecruitments.loadMore(PAST_RECRUITMENT_PAGE_SIZE));

  useEffect(() => {
    if (!isReadOnly) return;
    createDialog.close();
    deleteDialog.close();
    setDeleteTarget(null);
  }, [createDialog.close, deleteDialog.close, isReadOnly]);

  const { run: handleCreate } = useSingleFlight(async (formData: CreateRecruitmentData) => {
    if (isReadOnly) return;
    try {
      await createRecruitment(formData);
      createDialog.close();
      showSuccessToast({
        title: "シフト提出依頼をスタッフに送りました",
      });
    } catch (error) {
      const message = getCreateRecruitmentErrorMessage(error);
      if (message) {
        toaster.create({ title: message, type: "error", duration: Number.POSITIVE_INFINITY });
        return;
      }
      showErrorToast(error);
    }
  });

  const handleDeleteClick = (recruitment: Recruitment) => {
    if (isReadOnly) return;
    setDeleteTarget(recruitment);
    deleteDialog.open();
  };

  const { run: handleDelete, isRunning: isDeleting } = useSingleFlight(async () => {
    if (isReadOnly || !deleteTarget) return;
    try {
      await deleteRecruitment({ recruitmentId: deleteTarget._id });
      deleteDialog.close();
      setDeleteTarget(null);
      showSuccessToast({ title: "シフト募集を削除しました" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const handleOpenShiftBoard = (
    recruitmentId: Recruitment["_id"],
    onBeforeOpenShiftBoard?: (recruitmentId: Recruitment["_id"]) => void,
  ) => {
    onBeforeOpenShiftBoard?.(recruitmentId);
    onOpenShiftBoard?.(recruitmentId);
  };

  const handleOpenCreate = () => {
    if (isReadOnly) return;
    setCreateSessionRevision((revision) => revision + 1);
    createDialog.open();
  };

  const renderContent = ({ onBeforeOpenShiftBoard }: RenderContentOptions = {}) => (
    <RecruitmentManagementView
      regularClosedDays={regularClosedDays}
      shopTarget={
        shopTarget ??
        (selectedShop
          ? { mode: "fixed", shop: { shopId: selectedShop.shopId, shopName: selectedShop.shopName } }
          : undefined)
      }
      title={title}
      groups={groups}
      isReadOnly={isReadOnly}
      showRecruitmentMenus={showRecruitmentMenus}
      canDeleteRecruitments={canDeleteRecruitments}
      deleteRecruitmentDisabledReason={deleteRecruitmentDisabledReason}
      pastStatus={resolvedPastStatus}
      hasPastRecruitments={resolvedHasPastRecruitments}
      isPastRecruitmentsVisible={data?.isPastRecruitmentsVisible ?? isPastRecruitmentsVisible}
      canLoadMorePastRecruitments={resolvedCanLoadMorePastRecruitments}
      tourRecruitmentId={knownRecruitments[0]?._id}
      createSessionKey={String(createSessionRevision)}
      createDialog={createDialog}
      deleteDialog={deleteDialog}
      deleteTarget={deleteTarget}
      isDeleting={isDeleting}
      onOpenCreate={handleOpenCreate}
      onCreate={handleCreate}
      onOpenShiftBoard={(recruitmentId) =>
        handleOpenShiftBoard(recruitmentId as Recruitment["_id"], onBeforeOpenShiftBoard)
      }
      onDeleteClick={handleDeleteClick}
      onDeleteConfirm={handleDelete}
      onShowPastRecruitments={handleShowPastRecruitments}
      onLoadMorePastRecruitments={handleLoadMorePastRecruitments}
    />
  );

  return children({
    isInitialLoading,
    recruitments: resolvedRecruitments,
    knownRecruitments,
    groups,
    openCreateRecruitment: handleOpenCreate,
    openShiftBoard: handleOpenShiftBoard,
    renderContent,
  });
}
