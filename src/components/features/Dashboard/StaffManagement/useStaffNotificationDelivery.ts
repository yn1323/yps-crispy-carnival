import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { toaster } from "@/src/components/ui/toaster";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { Staff } from "../types";

export function useStaffNotificationDelivery() {
  const sendOpenRecruitmentNotifications = useShopMutation(api.staff.mutations.sendOpenRecruitmentNotifications);
  const sendCurrentShiftNotification = useShopMutation(api.staff.mutations.sendCurrentShiftNotification);

  const { run: handleSendRecruitments, isRunning: isSendingRecruitments } = useSingleFlight(async (staff: Staff) => {
    try {
      const result = await sendOpenRecruitmentNotifications({ staffId: staff._id });
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

  const { run: handleSendCurrentShift, isRunning: isSendingCurrentShift } = useSingleFlight(async (staff: Staff) => {
    try {
      const result = await sendCurrentShiftNotification({ staffId: staff._id });
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
    onSendRecruitments: handleSendRecruitments,
    isSendingRecruitments,
    onSendCurrentShift: handleSendCurrentShift,
    isSendingCurrentShift,
  };
}
