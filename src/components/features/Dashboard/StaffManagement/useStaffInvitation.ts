import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { AddStaffFormData } from "../AddStaffForm";

export function useStaffInvitation() {
  const dialog = useDialog();
  const [mode, setMode] = useState<"qr" | "manual">("qr");
  const [registrationUrl, setRegistrationUrl] = useState<string | null>(null);
  const addStaffs = useShopMutation(api.staff.mutations.addStaffs);
  const ensureShopRegistrationLink = useShopMutation(api.staffRegistration.mutations.ensureShopRegistrationLink);

  const { run: handleAddStaffs, isRunning: isAddingStaffs } = useSingleFlight(async (data: AddStaffFormData) => {
    try {
      await addStaffs({ entries: data.entries });
      dialog.close();
      showSuccessToast({
        title: "スタッフを追加し、案内通知を送りました",
        description: "同意依頼とLINE連携案内をメールで送りました。募集中シフトがある場合は提出リンクも届きます。",
      });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: loadRegistrationUrl, isRunning: isRegistrationUrlLoading } = useSingleFlight(async () => {
    try {
      const result = await ensureShopRegistrationLink({});
      setRegistrationUrl(result.registrationUrl);
    } catch (error) {
      showErrorToast(error);
    }
  });

  const handleOpen = () => {
    setMode("qr");
    dialog.open();
    void loadRegistrationUrl();
  };

  const handleBackOrClose = () => {
    if (mode === "manual") {
      setMode("qr");
      return;
    }
    dialog.close();
  };

  return {
    dialog,
    mode,
    registrationUrl,
    isRegistrationUrlLoading,
    isAddingStaffs,
    onOpen: handleOpen,
    onBackOrClose: handleBackOrClose,
    onShowManualEntry: () => setMode("manual"),
    onAddStaffs: handleAddStaffs,
  };
}
