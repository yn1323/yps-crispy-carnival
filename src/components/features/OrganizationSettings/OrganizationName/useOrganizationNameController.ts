import { useMutation } from "convex/react";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { selectedShopAtom } from "@/src/stores/shop";

type Input = {
  organizationName: string;
  canUpdateOrganizationName: boolean;
};

export function useOrganizationNameController(input: Input) {
  const selectedShop = useAtomValue(selectedShopAtom);
  const updateOrganizationName = useMutation(api.organization.mutations.updateOrganizationName);
  const [isOpen, setIsOpen] = useState(false);
  const latestRef = useRef(input);
  latestRef.current = input;

  useEffect(() => {
    if (!input.canUpdateOrganizationName) setIsOpen(false);
  }, [input.canUpdateOrganizationName]);

  const { run: submit, isRunning } = useSingleFlight(async (name: string) => {
    const latest = latestRef.current;
    if (!latest.canUpdateOrganizationName || !selectedShop?.shopId) {
      setIsOpen(false);
      return;
    }

    try {
      await updateOrganizationName({
        shopId: selectedShop.shopId as Id<"shops">,
        name,
        requestId: crypto.randomUUID(),
      });
      showSuccessToast({ title: "組織名を変更しました" });
      setIsOpen(false);
    } catch (error) {
      showErrorToast(error);
      throw error;
    }
  });

  return {
    open: () => {
      if (latestRef.current.canUpdateOrganizationName) setIsOpen(true);
    },
    dialog: {
      isOpen,
      organizationName: input.organizationName,
      isRunning,
      onClose: () => setIsOpen(false),
      onSubmit: (name: string) => void submit(name).catch(() => undefined),
    },
  };
}
