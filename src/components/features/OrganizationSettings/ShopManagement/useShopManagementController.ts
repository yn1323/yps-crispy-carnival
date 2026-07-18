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
    } else if (!latest.shops.find((candidate) => candidate.id === operation.shopId)?.canDelete) {
      setDialog(null);
      return;
    }

    const requestId =
      operation.kind === "deleteShop"
        ? (deleteRequestIdsRef.current.get(operation.shopId) ?? crypto.randomUUID())
        : crypto.randomUUID();
    if (operation.kind === "deleteShop") deleteRequestIdsRef.current.set(operation.shopId, requestId);
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
          deleteRequestIdsRef.current.delete(operation.shopId);
          if (selectedShop?.shopId === operation.shopId) setSelectedShop(null);
          showSuccessToast({ title: "店舗の削除を受け付けました" });
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
      onClose: () => {
        if (dialog?.kind === "shopDetails") deleteRequestIdsRef.current.delete(dialog.shop.id);
        setDialog(null);
      },
      onSubmit: (operation: ShopManagementOperation) => run(operation).catch(() => undefined),
    },
  };
}
