import { useMutation } from "convex/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { selectedShopAtom } from "@/src/stores/shop";
import type { OrganizationShopView } from "../types";
import type { ShopManagementDialogState, ShopManagementOperation } from "./types";

type Input = {
  canAddShop: boolean;
  shops: OrganizationShopView[];
};

export function useShopManagementController(input: Input) {
  const addShop = useShopMutation(api.organization.mutations.addShop);
  const updateShop = useMutation(api.shop.mutations.updateShopSettings);
  const deleteShop = useMutation(api.organization.mutations.deleteShop);
  const selectedShop = useAtomValue(selectedShopAtom);
  const setSelectedShop = useSetAtom(selectedShopAtom);
  const [dialog, setDialog] = useState<ShopManagementDialogState | null>(null);
  const deleteRequestIdsRef = useRef(new Map<string, string>());
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
    } else {
      const targetShop = latest.shops.find((candidate) => candidate.id === operation.shopId);
      const canRun = operation.kind === "updateShop" ? targetShop?.canUpdateSettings : targetShop?.canDelete;
      if (!canRun) {
        setDialog(null);
        return;
      }
    }

    try {
      switch (operation.kind) {
        case "addShop": {
          const requestId = crypto.randomUUID();
          await addShop({
            ...operation.data,
            requestId,
          });
          showSuccessToast({ title: "店舗を追加しました" });
          break;
        }
        case "updateShop":
          await updateShop({
            shopId: operation.shopId as Id<"shops">,
            ...operation.data,
          });
          showSuccessToast({ title: "店舗設定を更新しました" });
          break;
        case "deleteShop": {
          const requestId = deleteRequestIdsRef.current.get(operation.shopId) ?? crypto.randomUUID();
          deleteRequestIdsRef.current.set(operation.shopId, requestId);
          await deleteShop({
            shopId: operation.shopId as Id<"shops">,
            confirmShopId: operation.shopId as Id<"shops">,
            requestId,
          });
          deleteRequestIdsRef.current.delete(operation.shopId);
          if (selectedShop?.shopId === operation.shopId) setSelectedShop(null);
          showSuccessToast({ title: "店舗の削除を受け付けました" });
          break;
        }
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

  const openShopSettings = (shopId: string) => {
    const shop = latestRef.current.shops.find((candidate) => candidate.id === shopId);
    if (shop?.canUpdateSettings) setDialog({ kind: "shopSettings", shop });
  };

  return {
    addShop: () => {
      if (latestRef.current.canAddShop) setDialog({ kind: "addShop" });
    },
    openShop,
    openShopSettings,
    dialog: {
      dialog,
      isRunning,
      onClose: () => {
        if (dialog?.kind === "shopDetails") deleteRequestIdsRef.current.delete(dialog.shop.id);
        setDialog(null);
      },
      onSubmit: (operation: ShopManagementOperation) => run(operation).catch(() => undefined),
    },
  };
}
