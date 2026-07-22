import { useMutation } from "convex/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useRef } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { selectedShopAtom } from "@/src/stores/shop";
import type { ShopDetailData } from "./types";

type Input = {
  shop: ShopDetailData;
  onDeleted: () => void;
};

export function useShopDeletionController(input: Input) {
  const deleteShopMutation = useMutation(api.organization.mutations.deleteShop);
  const selectedShop = useAtomValue(selectedShopAtom);
  const setSelectedShop = useSetAtom(selectedShopAtom);
  const latestRef = useRef(input);
  const deleteRequestIdsRef = useRef(new Map<string, string>());
  latestRef.current = input;

  const { run, isRunning } = useSingleFlight(async () => {
    const latest = latestRef.current;
    if (!latest.shop.canDelete) return false;

    const requestId = deleteRequestIdsRef.current.get(latest.shop.id) ?? crypto.randomUUID();
    deleteRequestIdsRef.current.set(latest.shop.id, requestId);

    try {
      await deleteShopMutation({
        shopId: latest.shop.id as Id<"shops">,
        confirmShopId: latest.shop.id as Id<"shops">,
        requestId,
      });
      deleteRequestIdsRef.current.delete(latest.shop.id);
      if (selectedShop?.shopId === latest.shop.id) setSelectedShop(null);
      showSuccessToast({ title: "店舗の削除を受け付けました" });
      latest.onDeleted();
      return true;
    } catch (error) {
      showErrorToast(error);
      throw error;
    }
  });

  return {
    isDeleting: isRunning,
    deleteShop: async () => {
      try {
        return (await run()) === true;
      } catch {
        return false;
      }
    },
  };
}
