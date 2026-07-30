import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { toaster } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { UserShopDetailMembership, UserShopDetailRecruitment } from "./types";

const RECRUITMENT_QUERY_PAGE_SIZE = 100;

export function useUserShopNotificationActions({
  targetShopId,
  membership,
  isReadOnly,
}: {
  targetShopId: Id<"shops">;
  membership: UserShopDetailMembership;
  isReadOnly: boolean;
}) {
  const recruitments = usePaginatedQuery(
    api.dashboard.queries.getDashboardRecruitments,
    { shopId: targetShopId },
    { initialNumItems: RECRUITMENT_QUERY_PAGE_SIZE },
  );
  const currentRecruitments = useQuery(api.dashboard.queries.getDashboardCurrentRecruitments, {
    shopId: targetShopId,
  });
  const sendOpenRecruitmentNotifications = useMutation(api.staff.mutations.sendOpenRecruitmentNotifications);
  const sendCurrentShiftNotification = useMutation(api.staff.mutations.sendCurrentShiftNotification);

  const { run: sendRecruitments, isRunning: isSendingRecruitments } = useSingleFlight(async () => {
    if (isReadOnly || membership.shopId !== targetShopId) return;
    try {
      const result = await sendOpenRecruitmentNotifications({ shopId: targetShopId, staffId: membership.staffId });
      if (result.scheduled) {
        showSuccessToast({ title: "シフト募集通知を再送しました" });
        return;
      }
      toaster.create({
        title:
          result.reason === "rateLimited" ? "少し時間をおいて再送してください" : "送信できるシフト募集がありません",
        type: result.reason === "rateLimited" ? "error" : "info",
      });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: sendCurrentShift, isRunning: isSendingCurrentShift } = useSingleFlight(async () => {
    if (isReadOnly || membership.shopId !== targetShopId) return;
    try {
      const result = await sendCurrentShiftNotification({ shopId: targetShopId, staffId: membership.staffId });
      if (result.scheduled) {
        showSuccessToast({ title: "確定シフト通知を再送しました" });
        return;
      }
      toaster.create({
        title:
          result.reason === "rateLimited"
            ? "少し時間をおいて再送してください"
            : result.reason === "unconfirmedChanges"
              ? "未確定の変更があるため、シフトを確定してから再送してください"
              : result.reason === "tooManyCurrentShifts"
                ? "確定シフトが40件を超えるため、一度に再送できません"
                : "送信できる確定シフトがありません",
        type: result.reason === "noCurrentShift" ? "info" : "error",
      });
    } catch (error) {
      showErrorToast(error);
    }
  });

  return {
    openRecruitments: recruitments.results.filter(
      (recruitment) => recruitment.status === "open",
    ) as UserShopDetailRecruitment[],
    currentRecruitments: (currentRecruitments ?? []) as UserShopDetailRecruitment[],
    isLoading: recruitments.status === "LoadingFirstPage" || currentRecruitments === undefined,
    sendRecruitments,
    sendCurrentShift,
    isSendingRecruitments,
    isSendingCurrentShift,
  };
}
