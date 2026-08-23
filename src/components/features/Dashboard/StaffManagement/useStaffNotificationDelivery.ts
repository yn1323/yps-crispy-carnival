import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { showNotificationResendCooldownToast } from "@/src/components/shared/NotificationResendCooldownNotice";
import { toaster } from "@/src/components/ui/toaster";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { Staff } from "../types";

export function useStaffNotificationDelivery(isReadOnly = false) {
  const sendOpenRecruitmentNotifications = useShopMutation(api.staff.mutations.sendOpenRecruitmentNotifications);
  const sendCurrentShiftNotification = useShopMutation(api.staff.mutations.sendCurrentShiftNotification);

  const { run: handleSendRecruitments, isRunning: isSendingRecruitments } = useSingleFlight(async (staff: Staff) => {
    if (isReadOnly) return;
    try {
      const result = await sendOpenRecruitmentNotifications({ staffId: staff._id });
      if (result.scheduled) {
        showSuccessToast({ title: "シフト募集通知を再送しました" });
        return;
      }
      if (result.reason === "recentlySent") {
        showNotificationResendCooldownToast();
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

  const { run: handleSendCurrentShift, isRunning: isSendingCurrentShift } = useSingleFlight(async (staff: Staff) => {
    if (isReadOnly) return;
    try {
      const result = await sendCurrentShiftNotification({ staffId: staff._id });
      if (result.scheduled) {
        showSuccessToast({ title: "確定シフト通知を再送しました" });
        return;
      }
      if (result.reason === "recentlySent") {
        showNotificationResendCooldownToast();
        return;
      }
      toaster.create({
        title:
          result.reason === "rateLimited"
            ? "少し時間をおいて再送してください"
            : result.reason === "unconfirmedChanges"
              ? "未確定の変更があります。\nシフトを確定してから再送してください。"
              : result.reason === "tooManyCurrentShifts"
                ? "確定シフトが40件を超えるため、一度に再送できません。"
                : "送信できる確定シフトがありません",
        type: result.reason === "noCurrentShift" ? "info" : "error",
      });
    } catch (error) {
      showErrorToast(error);
    }
  });

  return {
    onSendRecruitments: handleSendRecruitments,
    isSendingRecruitments,
    onSendCurrentShift: handleSendCurrentShift,
    isSendingCurrentShift,
  };
}
