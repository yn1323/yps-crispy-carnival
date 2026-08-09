import { useMutation } from "convex/react";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShopFormData } from "@/src/components/features/ShopForm";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { selectedShopAtom } from "@/src/stores/shop";
import type { OrganizationCreationDialogState } from "./types";

type Input = {
  canCreateOrganization: boolean;
  onCreated: (shopId: string) => void;
};

export function useOrganizationCreationController(input: Input) {
  // 新しいグループ自体は選択中店舗に属さないため、shop mutationにはしない。
  // sourceShopIdは現在のcanonical personを安全に引き継ぐためだけに送る。
  const createOrganization = useMutation(api.setup.mutations.createOrganization);
  const selectedShop = useAtomValue(selectedShopAtom);
  const [dialog, setDialog] = useState<OrganizationCreationDialogState | null>(null);
  const latestRef = useRef(input);
  latestRef.current = input;

  useEffect(() => {
    if (!dialog) return;
    if (!input.canCreateOrganization) setDialog(null);
  }, [dialog, input.canCreateOrganization]);

  const { run } = useSingleFlight(async (data: ShopFormData) => {
    const latest = latestRef.current;
    if (!latest.canCreateOrganization) {
      setDialog(null);
      return;
    }

    try {
      const { shopId } = await createOrganization({
        shopName: data.shopName,
        ...(selectedShop ? { sourceShopId: selectedShop.shopId as Id<"shops"> } : {}),
        regularClosedDays: data.regularClosedDays,
        submissionPattern: data.submissionPattern,
        requestId: crypto.randomUUID(),
      });
      showSuccessToast({ title: "新しいグループを作りました" });
      setDialog(null);
      latest.onCreated(shopId);
    } catch (error) {
      showErrorToast(error);
      throw error;
    }
  });

  return {
    createOrganization: () => {
      if (latestRef.current.canCreateOrganization) setDialog({ kind: "createOrganization" });
    },
    dialog: {
      dialog,
      onClose: () => setDialog(null),
      onSubmit: (data: ShopFormData) => run(data).catch(() => undefined),
    },
  };
}
