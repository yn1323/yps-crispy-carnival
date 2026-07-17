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
  const archiveShop = useMutation(api.organization.mutations.archiveShop);
  const reactivateShop = useMutation(api.organization.mutations.reactivateShop);
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
    const canRun = dialog.kind === "archiveShop" ? latestShop?.canArchive : latestShop?.canReactivate;
    if (!latestShop || !canRun) {
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
      const shop = latest.shops.find((candidate) => candidate.id === operation.shopId);
      const canRun = operation.kind === "archiveShop" ? shop?.canArchive : shop?.canReactivate;
      if (!canRun) {
        setDialog(null);
        return;
      }
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
        case "archiveShop":
          await archiveShop({ shopId: operation.shopId as Id<"shops">, requestId });
          showSuccessToast({
            title: "店舗をアーカイブしました",
            description: "店舗データと過去のシフトは保持されます。",
          });
          break;
        case "reactivateShop":
          await reactivateShop({ shopId: operation.shopId as Id<"shops">, requestId });
          showSuccessToast({ title: "店舗を再稼働しました" });
          break;
      }
      setDialog(null);
    } catch (error) {
      showErrorToast(error);
      throw error;
    }
  });

  const openShopDialog = (kind: "archiveShop" | "reactivateShop", shopId: string) => {
    const shop = latestRef.current.shops.find((candidate) => candidate.id === shopId);
    const canRun = kind === "archiveShop" ? shop?.canArchive : shop?.canReactivate;
    if (shop && canRun) setDialog({ kind, shop });
  };

  return {
    addShop: () => {
      if (latestRef.current.canAddShop) setDialog({ kind: "addShop" });
    },
    archiveShop: (shopId: string) => openShopDialog("archiveShop", shopId),
    reactivateShop: (shopId: string) => openShopDialog("reactivateShop", shopId),
    dialog: {
      dialog,
      isRunning,
      onClose: () => setDialog(null),
      onSubmit: (operation: ShopManagementOperation) => run(operation).catch(() => undefined),
    },
  };
}
