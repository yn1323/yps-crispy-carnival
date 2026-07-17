import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { OrganizationShopView } from "../types";
import type { ShopManagementDialogState, ShopManagementOperation } from "./types";

type Input = {
  canAddShop: boolean;
  shops: OrganizationShopView[];
};

export function useShopManagementController(input: Input) {
  const addShop = useShopMutation(api.organization.mutations.addShop);
  const deleteShop = useMutation(api.organization.mutations.deleteShop);
  const [dialog, setDialog] = useState<ShopManagementDialogState | null>(null);
  const latestRef = useRef(input);
  latestRef.current = input;

  useEffect(() => {
    if (!dialog) return;
    if (dialog.kind === "addShop") {
      if (!input.canAddShop) setDialog(null);
      return;
    }
    const latestShop = input.shops.find((shop) => shop.id === dialog.shop.id);
    if (!latestShop) {
      setDialog(null);
      return;
    }
    if (latestShop !== dialog.shop) setDialog({ ...dialog, shop: latestShop });
  }, [dialog, input.canAddShop, input.shops]);

  const { run, isRunning } = useSingleFlight(async (operation: ShopManagementOperation) => {
    const latest = latestRef.current;
    if (operation.kind === "addShop") {
      if (!latest.canAddShop) {
        setDialog(null);
        return;
      }
    } else if (!latest.shops.find((candidate) => candidate.id === operation.shopId)?.canDelete) {
      setDialog(null);
      return;
    }

    const requestId = crypto.randomUUID();
    try {
      switch (operation.kind) {
        case "addShop":
          await addShop({
            ...operation.data,
            requestId,
          });
          showSuccessToast({ title: "店舗を追加しました" });
          break;
        case "deleteShop":
          await deleteShop({
            shopId: operation.shopId as Id<"shops">,
            confirmShopId: operation.shopId as Id<"shops">,
            requestId,
          });
          showSuccessToast({ title: "店舗を削除しました" });
          break;
      }
      setDialog(null);
    } catch (error) {
      showErrorToast(error);
      throw error;
    }
  });

  const openShop = (shopId: string) => {
    const shop = latestRef.current.shops.find((candidate) => candidate.id === shopId);
    if (shop) setDialog({ kind: "shopDetails", shop });
  };

  return {
    addShop: () => {
      if (latestRef.current.canAddShop) setDialog({ kind: "addShop" });
    },
    openShop,
    dialog: {
      dialog,
      isRunning,
      onClose: () => setDialog(null),
      onSubmit: (operation: ShopManagementOperation) => run(operation).catch(() => undefined),
    },
  };
}
