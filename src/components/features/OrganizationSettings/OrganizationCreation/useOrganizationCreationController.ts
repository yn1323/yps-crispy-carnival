import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { ShopFormData } from "@/src/components/features/ShopForm";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { OrganizationCreationDialogState } from "./types";

type Input = {
  canCreateOrganization: boolean;
  onCreated: (shopId: string) => void;
};

export function useOrganizationCreationController(input: Input) {
  // グループ作成は選択中店舗に依存しないため、shopIdを注入しない素のmutationを使う。
  const createOrganization = useMutation(api.setup.mutations.createOrganization);
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
