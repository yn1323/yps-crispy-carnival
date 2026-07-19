import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { ShopManagementDialogState, ShopManagementOperation } from "./types";

type Input = {
  canAddShop: boolean;
};

export function useShopManagementController(input: Input) {
  const addShop = useShopMutation(api.organization.mutations.addShop);
  const [dialog, setDialog] = useState<ShopManagementDialogState | null>(null);
  const latestRef = useRef(input);
  latestRef.current = input;

  useEffect(() => {
    if (!dialog) return;
    if (!input.canAddShop) setDialog(null);
  }, [dialog, input.canAddShop]);

  const { run } = useSingleFlight(async (operation: ShopManagementOperation) => {
    const latest = latestRef.current;
    if (!latest.canAddShop) {
      setDialog(null);
      return;
    }

    try {
      const requestId = crypto.randomUUID();
      await addShop({
        ...operation.data,
        requestId,
      });
      showSuccessToast({ title: "店舗を追加しました" });
      setDialog(null);
    } catch (error) {
      showErrorToast(error);
      throw error;
    }
  });

  return {
    addShop: () => {
      if (latestRef.current.canAddShop) setDialog({ kind: "addShop" });
    },
    dialog: {
      dialog,
      onClose: () => setDialog(null),
      onSubmit: (operation: ShopManagementOperation) => run(operation).catch(() => undefined),
    },
  };
}
