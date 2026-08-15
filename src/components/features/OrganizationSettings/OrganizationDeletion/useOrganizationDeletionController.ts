import { useMutation } from "convex/react";
import { useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { selectedShopAtom } from "@/src/stores/shop";
import { EMPTY_USER, userAtom } from "@/src/stores/user";
import type { OrganizationDeletionDialogState } from "./OrganizationDeletionDialog";

type Input = {
  organizationId: Id<"organizations">;
  organizationUpdatedAt: number;
  organizationName: string;
  canDeleteOrganization: boolean;
};

type DeletionIntent = {
  organizationId: Id<"organizations">;
  organizationUpdatedAt: number;
  organizationName: string;
  requestId: string;
};

type ControllerOptions = {
  replaceLocation?: (path: string) => void;
};

export function useOrganizationDeletionController(
  input: Input,
  { replaceLocation = (path) => window.location.replace(path) }: ControllerOptions = {},
) {
  const deleteOrganizationForOrganization = useMutation(api.organization.mutations.deleteOrganizationForOrganization);
  const setSelectedShop = useSetAtom(selectedShopAtom);
  const setUser = useSetAtom(userAtom);
  const [intent, setIntent] = useState<DeletionIntent | null>(null);
  const latestRef = useRef(input);
  const pendingRedirectRef = useRef<string | null>(null);
  latestRef.current = input;

  useEffect(() => {
    if (!intent) return;
    if (
      !input.canDeleteOrganization ||
      input.organizationId !== intent.organizationId ||
      input.organizationUpdatedAt !== intent.organizationUpdatedAt ||
      input.organizationName !== intent.organizationName
    ) {
      setIntent(null);
    }
  }, [input, intent]);

  const { run, isRunning } = useSingleFlight(async () => {
    if (!intent) return;
    const latest = latestRef.current;
    if (
      !latest.canDeleteOrganization ||
      latest.organizationId !== intent.organizationId ||
      latest.organizationUpdatedAt !== intent.organizationUpdatedAt ||
      latest.organizationName !== intent.organizationName
    ) {
      setIntent(null);
      return;
    }

    try {
      const deletionArgs = {
        organizationId: intent.organizationId,
        confirmOrganizationId: intent.organizationId,
        expectedOrganizationUpdatedAt: intent.organizationUpdatedAt,
        requestId: intent.requestId,
      };
      await deleteOrganizationForOrganization(deletionArgs);
      // Dialogの履歴guardを先に戻し、そのhistory.back()に遷移を上書きされないようにする。
      pendingRedirectRef.current = "/dashboard";
      setSelectedShop(null);
      setUser(EMPTY_USER);
      setIntent(null);
      showSuccessToast({ title: "組織の削除を受け付けました" });
    } catch (error) {
      showErrorToast(error);
      throw error;
    }
  });

  const open = () => {
    const latest = latestRef.current;
    if (!latest.canDeleteOrganization) return;
    setIntent({
      organizationId: latest.organizationId,
      organizationUpdatedAt: latest.organizationUpdatedAt,
      organizationName: latest.organizationName,
      requestId: crypto.randomUUID(),
    });
  };

  const dialog: OrganizationDeletionDialogState | null = intent
    ? { intentKey: intent.requestId, organizationName: intent.organizationName }
    : null;
  return {
    open,
    dialog: {
      dialog,
      isRunning,
      onClose: () => {
        if (!isRunning) setIntent(null);
      },
      onBackGuardRemoved: () => {
        const nextUrl = pendingRedirectRef.current;
        if (!nextUrl) return;
        pendingRedirectRef.current = null;
        replaceLocation(nextUrl);
      },
      onSubmit: () => run().catch(() => undefined),
    },
  };
}
