import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { toaster } from "@/src/components/ui/toaster";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useShopPaginatedQuery } from "@/src/hooks/useShopPaginatedQuery";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { UserDetailMembership, UserDetailRecruitment } from "./types";

const RECRUITMENT_QUERY_PAGE_SIZE = 100;

export function useUserNotificationActions({
  membership,
  enabled,
  isReadOnly,
}: {
  membership: UserDetailMembership | null;
  enabled: boolean;
  isReadOnly: boolean;
}) {
  const shouldQuery = enabled && membership !== null;
  const recruitments = useShopPaginatedQuery(
    api.dashboard.queries.getDashboardRecruitments,
    shouldQuery ? {} : "skip",
    { initialNumItems: RECRUITMENT_QUERY_PAGE_SIZE },
  );
  const currentRecruitments = useShopQuery(
    api.dashboard.queries.getDashboardCurrentRecruitments,
    shouldQuery ? {} : "skip",
  );
  const sendOpenRecruitmentNotifications = useShopMutation(api.staff.mutations.sendOpenRecruitmentNotifications);
  const sendCurrentShiftNotification = useShopMutation(api.staff.mutations.sendCurrentShiftNotification);

  const { run: sendRecruitments, isRunning: isSendingRecruitments } = useSingleFlight(async () => {
    if (isReadOnly || !membership) return;
    try {
      const result = await sendOpenRecruitmentNotifications({ staffId: membership.staffId });
      if (result.scheduled) {
        showSuccessToast({ title: "シフト募集通知を送りました" });
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
    if (isReadOnly || !membership) return;
    try {
      const result = await sendCurrentShiftNotification({ staffId: membership.staffId });
      if (result.scheduled) {
        showSuccessToast({ title: "現在の確定シフトを送りました" });
        return;
      }
      toaster.create({
        title:
          result.reason === "rateLimited"
            ? "少し時間をおいて再送してください"
            : "送信できる現在の確定シフトがありません",
        type: result.reason === "rateLimited" ? "error" : "info",
      });
    } catch (error) {
      showErrorToast(error);
    }
  });

  return {
    openRecruitments: (shouldQuery
      ? recruitments.results.filter((recruitment) => recruitment.status === "open")
      : []) as UserDetailRecruitment[],
    currentRecruitments: (currentRecruitments ?? []) as UserDetailRecruitment[],
    isLoading: shouldQuery && (recruitments.status === "LoadingFirstPage" || currentRecruitments === undefined),
    sendRecruitments,
    sendCurrentShift,
    isSendingRecruitments,
    isSendingCurrentShift,
  };
}
