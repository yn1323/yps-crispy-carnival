import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { ShopManagementDialogState, ShopManagementOperation } from "./types";

type Input = {
  organizationId?: Id<"organizations">;
  canAddShop: boolean;
};

export function useShopManagementController(input: Input) {
  const addShop = useShopMutation(api.organization.mutations.addShop);
  const addShopForOrganization = useMutation(api.organization.mutations.addShopForOrganization);
  const [dialog, setDialog] = useState<ShopManagementDialogState | null>(null);
  const latestRef = useRef(input);
  latestRef.current = input;

  useEffect(() => {
    if (!dialog) return;
    if (!input.canAddShop) setDialog(null);
  }, [dialog, input.canAddShop]);

  const { run, isRunning } = useSingleFlight(async (operation: ShopManagementOperation) => {
    const latest = latestRef.current;
    if (!latest.canAddShop) {
      setDialog(null);
      return;
    }

    try {
      const requestId = crypto.randomUUID();
      const args = { ...operation.data, requestId };
      if (latest.organizationId) {
        await addShopForOrganization({ organizationId: latest.organizationId, ...args });
      } else {
        await addShop(args);
      }
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
      isRunning,
      onClose: () => setDialog(null),
      onSubmit: (operation: ShopManagementOperation) => run(operation).catch(() => undefined),
    },
  };
}
