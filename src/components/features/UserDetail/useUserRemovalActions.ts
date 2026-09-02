import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorMessage } from "@/src/lib/convex/error";
import type { UserDetailData, UserDetailDialog } from "./types";

export function useUserRemovalActions({
  data,
  selectedShopId,
  onPersonRemoved,
  expectedOrganizationId,
}: {
  data: UserDetailData;
  selectedShopId: string | null;
  onPersonRemoved: (personId: UserDetailData["person"]["id"]) => void;
  expectedOrganizationId: Id<"organizations">;
}) {
  const [dialog, setDialog] = useState<UserDetailDialog>(null);
  const removePerson = useMutation(api.organization.mutations.removePersonFromOrganization);
  const operationShopId =
    data.shops.find((shop) => shop.shopId === selectedShopId)?.shopId ?? data.shops[0]?.shopId ?? null;

  useEffect(() => {
    setDialog((current) => {
      if (!current) return current;
      if (current.personId !== data.person.id || !operationShopId || current.shopId !== operationShopId) return null;
      return data.canRemove && hasSameRemovalPreview(current.removalPreview, data.removalPreview) ? current : null;
    });
  }, [data.canRemove, data.person.id, data.removalPreview, operationShopId]);

  const { run: confirmRemoval, isRunning: isRemoving } = useSingleFlight(async () => {
    if (!operationShopId || !dialog || !data.canRemove || dialog.removalPreview.kind !== "ready") return;
    if (dialog.personId !== data.person.id || dialog.shopId !== operationShopId) return;

    try {
      await removePerson({
        shopId: dialog.shopId,
        personId: dialog.personId,
        requestId: dialog.requestId,
        removalPreview: {
          assignmentCount: dialog.removalPreview.assignmentCount,
          fingerprint: dialog.removalPreview.fingerprint,
        },
        expectedOrganizationId,
      });
      setDialog(null);
      showSuccessToast({
        title: "ユーザーを組織から削除しました",
        description: "過去のシフト履歴は保持されます。",
      });
      onPersonRemoved(dialog.personId);
    } catch (error) {
      if (getConvexErrorMessage(error)?.includes("今日以降のシフトの割り当てが変更されました")) setDialog(null);
      showErrorToast(error);
    }
  });

  return {
    dialog,
    isRemoving,
    onRequestRemovePerson: () => {
      if (operationShopId && data.canRemove) {
        setDialog({
          kind: "removePerson",
          personId: data.person.id,
          shopId: operationShopId,
          removalPreview: data.removalPreview,
          requestId: crypto.randomUUID(),
        });
      }
    },
    onConfirmRemoval: confirmRemoval,
    onCloseDialog: () => setDialog(null),
  };
}

function hasSameRemovalPreview(left: UserDetailData["removalPreview"], right: UserDetailData["removalPreview"]) {
  if (left.kind !== right.kind || left.asOfDate !== right.asOfDate) return false;
  if (left.kind === "ready" && right.kind === "ready") {
    return left.assignmentCount === right.assignmentCount && left.fingerprint === right.fingerprint;
  }
  return (
    left.kind === "tooMany" &&
    right.kind === "tooMany" &&
    left.assignmentCountAtLeast === right.assignmentCountAtLeast &&
    left.limit === right.limit
  );
}
