import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { RegularClosedDay, ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { CreateRecruitmentData } from "@/src/components/features/CreateRecruitmentForm";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useShopPaginatedQuery } from "@/src/hooks/useShopPaginatedQuery";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
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
  currentRecruitments: Recruitment[];
  openRecruitments: Recruitment[];
  openCreateRecruitment: () => void;
  openShiftBoard: (
    recruitmentId: Recruitment["_id"],
    onBeforeOpenShiftBoard?: (recruitmentId: Recruitment["_id"]) => void,
  ) => void;
  renderContent: (options?: RenderContentOptions) => ReactNode;
};

type Props = {
  regularClosedDays: RegularClosedDay[];
  submissionPattern: ShiftSubmissionPattern;
  data?: RecruitmentManagementData;
  children: (state: RecruitmentManagementState) => ReactNode;
};

export function RecruitmentManagement({ regularClosedDays, submissionPattern, data, children }: Props) {
  const navigate = useNavigate();
  const createDialog = useDialog();
  const deleteDialog = useDialog();
  const [deleteTarget, setDeleteTarget] = useState<Recruitment | null>(null);
  const [isPastRecruitmentsVisible, setIsPastRecruitmentsVisible] = useState(data?.isPastRecruitmentsVisible ?? false);
  const recruitments = useShopPaginatedQuery(api.dashboard.queries.getDashboardRecruitments, data ? "skip" : {}, {
    initialNumItems: ACTIVE_RECRUITMENT_QUERY_PAGE_SIZE,
  });
  const hasPastRecruitments = useShopQuery(api.dashboard.queries.hasDashboardPastRecruitments, data ? "skip" : {});
  const pastRecruitments = useShopPaginatedQuery(
    api.dashboard.queries.getDashboardPastRecruitments,
    data || !isPastRecruitmentsVisible ? "skip" : {},
    { initialNumItems: PAST_RECRUITMENT_PAGE_SIZE },
  );
  const createRecruitment = useShopMutation(api.recruitment.mutations.createRecruitment);
  const deleteRecruitment = useShopMutation(api.recruitment.mutations.deleteRecruitment);

  const resolvedRecruitments = data?.recruitments ?? recruitments.results;
  const recruitmentList = data?.recruitmentList ?? [...resolvedRecruitments, ...pastRecruitments.results];
  const groups = data?.groups ?? buildDashboardRecruitmentGroups({ recruitments: recruitmentList }).groups;
  const currentRecruitments =
    data?.currentRecruitments ?? groups.find((group) => group.key === "current")?.recruitments ?? [];
  const openRecruitments = groups.find((group) => group.key === "collecting")?.recruitments ?? [];
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

  const { run: handleCreate } = useSingleFlight(async (formData: CreateRecruitmentData) => {
    try {
      await createRecruitment(formData);
      createDialog.close();
      showSuccessToast({
        title: "募集をつくり、スタッフに通知しました",
        description: "LINE連携済みのスタッフにはLINE、未連携のスタッフにはメールで届きます。",
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
    setDeleteTarget(recruitment);
    deleteDialog.open();
  };

  const { run: handleDelete, isRunning: isDeleting } = useSingleFlight(async () => {
    if (!deleteTarget) return;
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
    navigate({ to: "/shiftboard/$recruitmentId", params: { recruitmentId } });
  };

  const renderContent = ({ onBeforeOpenShiftBoard }: RenderContentOptions = {}) => (
    <RecruitmentManagementView
      regularClosedDays={regularClosedDays}
      submissionPattern={submissionPattern}
      groups={groups}
      pastStatus={resolvedPastStatus}
      hasPastRecruitments={resolvedHasPastRecruitments}
      isPastRecruitmentsVisible={data?.isPastRecruitmentsVisible ?? isPastRecruitmentsVisible}
      canLoadMorePastRecruitments={resolvedCanLoadMorePastRecruitments}
      tourRecruitmentId={knownRecruitments[0]?._id}
      createDialog={createDialog}
      deleteDialog={deleteDialog}
      deleteTarget={deleteTarget}
      isDeleting={isDeleting}
      onOpenCreate={createDialog.open}
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
    currentRecruitments,
    openRecruitments,
    openCreateRecruitment: createDialog.open,
    openShiftBoard: handleOpenShiftBoard,
    renderContent,
  });
}
