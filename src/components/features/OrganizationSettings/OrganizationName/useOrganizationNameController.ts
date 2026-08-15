import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";

type Input = {
  organizationId: Id<"organizations">;
  organizationName: string;
  canUpdateOrganizationName: boolean;
};

export function useOrganizationNameController(input: Input) {
  const updateOrganizationNameForOrganization = useMutation(
    api.organization.mutations.updateOrganizationNameForOrganization,
  );
  const [isOpen, setIsOpen] = useState(false);
  const latestRef = useRef(input);
  latestRef.current = input;

  useEffect(() => {
    if (!input.canUpdateOrganizationName) setIsOpen(false);
  }, [input.canUpdateOrganizationName]);

  const { run: submit, isRunning } = useSingleFlight(async (name: string) => {
    const latest = latestRef.current;
    if (!latest.canUpdateOrganizationName) {
      setIsOpen(false);
      return;
    }

    try {
      const requestId = crypto.randomUUID();
      await updateOrganizationNameForOrganization({
        organizationId: latest.organizationId,
        name,
        requestId,
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
