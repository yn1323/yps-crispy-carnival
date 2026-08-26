import { useMutation } from "convex/react";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { SetupData } from "../SetupModal";
import { SetupView } from "./SetupView";
import { isPromotionCodeInvalidError } from "./script";

type Props = {
  managerProfileDefaults?: {
    name: string;
    email: string;
  };
  showAccountDeletion: boolean;
  announcement: ReactNode;
};

export function Setup({ managerProfileDefaults, showAccountDeletion, announcement }: Props) {
  const dialog = useDialog();
  // 店舗未作成状態でも呼ぶため、shopIdを必要としないauthenticatedMutationを使う。
  const setupShopAndManager = useMutation(api.setup.mutations.setupShopAndManager);
  const { run: handleComplete, isRunning: isSubmitting } = useSingleFlight(async (data: SetupData) => {
    try {
      await setupShopAndManager({
        shopName: data.shopName,
        submissionPattern: data.submissionPattern,
        managerName: data.name,
        managerEmail: data.email,
        acceptedLegal: data.acceptedLegal as true,
        ...(data.promotionCode ? { promotionCode: data.promotionCode } : {}),
      });
      showSuccessToast({ title: "セットアップが完了しました" });
      return { kind: "completed" } as const;
    } catch (error) {
      if (isPromotionCodeInvalidError(error)) return { kind: "promotionCodeInvalid" } as const;
      showErrorToast(error);
      return { kind: "failed" } as const;
    }
  });

  return (
    <SetupView
      announcement={announcement}
      dialog={dialog}
      managerProfileDefaults={managerProfileDefaults}
      showAccountDeletion={showAccountDeletion}
      isSubmitting={isSubmitting}
      onComplete={handleComplete}
    />
  );
}
