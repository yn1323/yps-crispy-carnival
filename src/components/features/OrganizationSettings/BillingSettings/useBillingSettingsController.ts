import { useMutation } from "convex/react";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { toaster } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { selectedShopAtom } from "@/src/stores/shop";
import type { OrganizationBillingView } from "../types";

type Input = {
  organizationId?: Id<"organizations">;
  billing: OrganizationBillingView;
};

export function useBillingSettingsController(input: Input) {
  const selectedShop = useAtomValue(selectedShopAtom);
  const updateBillingEmail = useMutation(api.organizationBilling.mutations.updateBillingEmail);
  const updateBillingEmailForOrganization = useMutation(
    api.organizationBilling.mutations.updateBillingEmailForOrganization,
  );
  const [isBillingEmailOpen, setIsBillingEmailOpen] = useState(false);
  const latestRef = useRef(input);
  latestRef.current = input;

  useEffect(() => {
    if (!input.billing.canUpdateBillingEmail) setIsBillingEmailOpen(false);
  }, [input.billing.canUpdateBillingEmail]);

  const { run: submitBillingEmail, isRunning: isUpdatingBillingEmail } = useSingleFlight(async (email: string) => {
    const latest = latestRef.current;
    if (!latest.billing.canUpdateBillingEmail || (!latest.organizationId && !selectedShop?.shopId)) {
      setIsBillingEmailOpen(false);
      return;
    }
    try {
      const requestId = crypto.randomUUID();
      if (latest.organizationId) {
        await updateBillingEmailForOrganization({ organizationId: latest.organizationId, email, requestId });
      } else if (selectedShop) {
        await updateBillingEmail({
          shopId: selectedShop.shopId as Id<"shops">,
          email,
          requestId,
        });
      }
      showSuccessToast({ title: "請求先メールアドレスを変更しました" });
      setIsBillingEmailOpen(false);
    } catch (error) {
      showErrorToast(error);
      throw error;
    }
  });

  const openExternalBillingNotice = () => {
    toaster.create({
      title: "決済機能は準備中です",
      description: "料金設定と外部決済サービスの接続が完了するまで、プラン・支払い方法・請求書の操作は利用できません。",
      type: "info",
      duration: 8000,
    });
  };

  return {
    managePlan: openExternalBillingNotice,
    updatePaymentMethod: openExternalBillingNotice,
    openBillingDocuments: openExternalBillingNotice,
    updateBillingEmail: () => {
      if (latestRef.current.billing.canUpdateBillingEmail) setIsBillingEmailOpen(true);
    },
    dialog: {
      isOpen: isBillingEmailOpen,
      billingEmail: input.billing.billingEmail,
      isRunning: isUpdatingBillingEmail,
      onClose: () => setIsBillingEmailOpen(false),
      onSubmit: (email: string) => void submitBillingEmail(email).catch(() => undefined),
    },
  };
}
