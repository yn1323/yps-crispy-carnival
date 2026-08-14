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
  onCreated: (shopId: string, organizationId?: Id<"organizations">) => void;
  sourceShopId?: string | null;
  appMode?: boolean;
  organizationId?: Id<"organizations">;
};

export function useOrganizationCreationController(input: Input) {
  // 新しい組織自体は選択中店舗に属さないため、shop mutationにはしない。
  // sourceShopIdは現在のcanonical personを安全に引き継ぐためだけに送る。
  const createOrganization = useMutation(api.setup.mutations.createOrganization);
  const createOrganizationForApp = useMutation(api.setup.mutations.createOrganizationForApp);
  const selectedShop = useAtomValue(selectedShopAtom);
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
      const result = latest.appMode
        ? {
            ...(await createOrganizationForApp({
              ...baseArgs,
              organizationId: requireAppOrganizationId(latest.organizationId),
            })),
            appMode: true as const,
          }
        : {
            ...(await createOrganization({
              ...baseArgs,
              ...((latest.sourceShopId === undefined ? selectedShop?.shopId : latest.sourceShopId)
                ? {
                    sourceShopId: (latest.sourceShopId === undefined
                      ? selectedShop?.shopId
                      : latest.sourceShopId) as Id<"shops">,
                  }
                : {}),
            })),
            appMode: false as const,
          };
      showSuccessToast({ title: "新しい組織を作りました" });
      setDialog(null);
      if (result.appMode) {
        latest.onCreated(result.shopId, result.organizationId);
      } else {
        latest.onCreated(result.shopId);
      }
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

function requireAppOrganizationId(organizationId: Id<"organizations"> | undefined): Id<"organizations"> {
  if (!organizationId) throw new Error("app組織作成にはorganizationIdが必要です。");
  return organizationId;
}
