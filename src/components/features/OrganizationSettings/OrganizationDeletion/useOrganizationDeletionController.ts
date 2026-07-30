import { useMutation } from "convex/react";
import { useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { type ShopContextOption, toSelectedShop } from "@/src/domains/shop/context";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { selectedShopAtom } from "@/src/stores/shop";
import { EMPTY_USER, userAtom } from "@/src/stores/user";
import type { OrganizationDeletionDialogState } from "./OrganizationDeletionDialog";

type Input = {
  organizationId?: string;
  organizationUpdatedAt?: number;
  organizationName: string;
  canDeleteOrganization: boolean;
  selectedShopId: string;
  shops: readonly ShopContextOption[];
};

type DeletionIntent = {
  organizationId: string;
  organizationUpdatedAt: number;
  organizationName: string;
  selectedShopId: string;
  requestId: string;
};

type ControllerOptions = {
  replaceLocation?: (path: string) => void;
};

export function useOrganizationDeletionController(
  input: Input,
  { replaceLocation = (path) => window.location.replace(path) }: ControllerOptions = {},
) {
  const deleteOrganization = useMutation(api.organization.mutations.deleteOrganization);
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
      input.organizationName !== intent.organizationName ||
      input.selectedShopId !== intent.selectedShopId
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
      latest.organizationName !== intent.organizationName ||
      latest.selectedShopId !== intent.selectedShopId
    ) {
      setIntent(null);
      return;
    }

    try {
      await deleteOrganization({
        shopId: intent.selectedShopId as Id<"shops">,
        organizationId: intent.organizationId as Id<"organizations">,
        confirmOrganizationId: intent.organizationId as Id<"organizations">,
        expectedOrganizationUpdatedAt: intent.organizationUpdatedAt,
        requestId: intent.requestId,
      });
      const nextShop = latest.shops.find((shop) => shop.organizationId !== intent.organizationId);
      const nextUrl = nextShop ? `/dashboard?shop=${encodeURIComponent(nextShop.shopId)}` : "/dashboard";
      // Dialogの履歴guardを先に戻し、そのhistory.back()に遷移を上書きされないようにする。
      pendingRedirectRef.current = nextUrl;
      setSelectedShop(nextShop ? toSelectedShop(nextShop) : null);
      setUser(EMPTY_USER);
      setIntent(null);
      showSuccessToast({ title: "グループの削除を受け付けました" });
    } catch (error) {
      showErrorToast(error);
      throw error;
    }
  });

  const open = () => {
    const latest = latestRef.current;
    if (!latest.canDeleteOrganization || !latest.organizationId || latest.organizationUpdatedAt === undefined) {
      return;
    }
    setIntent({
      organizationId: latest.organizationId,
      organizationUpdatedAt: latest.organizationUpdatedAt,
      organizationName: latest.organizationName,
      selectedShopId: latest.selectedShopId,
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
