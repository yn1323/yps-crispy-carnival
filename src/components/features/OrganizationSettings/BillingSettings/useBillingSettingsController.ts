import { useMutation } from "convex/react";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { toaster } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { selectedShopAtom } from "@/src/stores/shop";
import type { FreeSelectionSummary, OrganizationBillingView } from "../types";

type Input = {
  billing: OrganizationBillingView;
  freeSelection: FreeSelectionSummary;
};

export function useBillingSettingsController(input: Input) {
  const selectedShop = useAtomValue(selectedShopAtom);
  const updateBillingEmail = useMutation(api.organizationBilling.mutations.updateBillingEmail);
  const setFreeSelection = useMutation(api.organizationBilling.mutations.setFreeSelection);
  const [isBillingEmailOpen, setIsBillingEmailOpen] = useState(false);
  const latestRef = useRef(input);
  latestRef.current = input;

  useEffect(() => {
    if (!input.billing.canUpdateBillingEmail) setIsBillingEmailOpen(false);
  }, [input.billing.canUpdateBillingEmail]);

  const { run: submitBillingEmail, isRunning: isUpdatingBillingEmail } = useSingleFlight(async (email: string) => {
    if (!latestRef.current.billing.canUpdateBillingEmail || !selectedShop?.shopId) {
      setIsBillingEmailOpen(false);
      return;
    }
    try {
      await updateBillingEmail({
        shopId: selectedShop.shopId as Id<"shops">,
        email,
        requestId: crypto.randomUUID(),
      });
      showSuccessToast({ title: "請求先メールアドレスを変更しました" });
      setIsBillingEmailOpen(false);
    } catch (error) {
      showErrorToast(error);
      throw error;
    }
  });

  const { run: saveFreeSelection } = useSingleFlight(
    async (managerPersonId: string | null, freeShopId: string | null) => {
      const latest = latestRef.current;
      const managerIsCurrent =
        managerPersonId === null ||
        latest.freeSelection.managerCandidates.some((candidate) => candidate.id === managerPersonId);
      const shopIsCurrent =
        freeShopId === null || latest.freeSelection.shopCandidates.some((candidate) => candidate.id === freeShopId);
      if (!latest.billing.canScheduleFree || !managerIsCurrent || !shopIsCurrent || !selectedShop?.shopId) return;

      try {
        const result = await setFreeSelection({
          shopId: selectedShop.shopId as Id<"shops">,
          managerPersonId: managerPersonId as Id<"organizationPeople"> | null,
          freeShopId: freeShopId as Id<"shops"> | null,
          requestId: crypto.randomUUID(),
        });
        showSuccessToast({
          title: result.stateKind === "free" ? "Freeで利用を再開しました" : "Freeで残す内容を保存しました",
          description:
            result.stateKind === "restricted"
              ? "利用人数を4名以下へ整理すると、Freeで利用を再開できます。"
              : "Free適用時まで、店舗・利用者・シフトのデータは削除されません。",
        });
      } catch (error) {
        showErrorToast(error);
        throw error;
      }
    },
  );

  const openExternalBillingNotice = () => {
    toaster.create({
      title: "決済機能は準備中です",
      description: "料金と外部決済の接続が完了するまで、プラン・支払い方法・請求書の操作は利用できません。",
      type: "info",
      duration: 8000,
    });
  };

  return {
    managePlan: openExternalBillingNotice,
    updatePaymentMethod: openExternalBillingNotice,
    openInvoice: openExternalBillingNotice,
    updateBillingEmail: () => {
      if (latestRef.current.billing.canUpdateBillingEmail) setIsBillingEmailOpen(true);
    },
    saveFreeSelection: async (managerPersonId: string | null, shopId: string | null) => {
      await saveFreeSelection(managerPersonId, shopId);
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
