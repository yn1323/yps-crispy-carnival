import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShopFormData } from "@/src/components/features/ShopForm";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { OrganizationCreationDialogState } from "./types";

type Input = {
  canCreateOrganization: boolean;
  onCreated: (shopId: string, organizationId: Id<"organizations">) => void;
  organizationId: Id<"organizations">;
};

export function useOrganizationCreationController(input: Input) {
  const createOrganizationForApp = useMutation(api.setup.mutations.createOrganizationForApp);
  const [dialog, setDialog] = useState<OrganizationCreationDialogState | null>(null);
  const latestRef = useRef(input);
  latestRef.current = input;

  useEffect(() => {
    if (!dialog) return;
    if (!input.canCreateOrganization) setDialog(null);
  }, [dialog, input.canCreateOrganization]);

  const { run, isRunning } = useSingleFlight(async ({ data, requestId }: { data: ShopFormData; requestId: string }) => {
    if (dialog?.requestId !== requestId) return;
    const latest = latestRef.current;
    if (!latest.canCreateOrganization) {
      setDialog(null);
      return;
    }

    try {
      const baseArgs = {
        shopName: data.shopName,
        regularClosedDays: data.regularClosedDays,
        submissionPattern: data.submissionPattern,
        requestId,
      };
      const result = await createOrganizationForApp({
        ...baseArgs,
        organizationId: latest.organizationId,
      });
      showSuccessToast({ title: "新しい組織を作りました" });
      setDialog(null);
      latest.onCreated(result.shopId, result.organizationId);
    } catch (error) {
      showErrorToast(error);
      throw error;
    }
  });

  return {
    createOrganization: () => {
      if (latestRef.current.canCreateOrganization) {
        setDialog({ kind: "createOrganization", requestId: crypto.randomUUID() });
      }
    },
    dialog: {
      dialog,
      isRunning,
      onClose: () => setDialog(null),
      onSubmit: (data: ShopFormData) => {
        if (!dialog) return Promise.resolve();
        return run({ data, requestId: dialog.requestId }).then(
          () => undefined,
          () => undefined,
        );
      },
    },
  };
}
