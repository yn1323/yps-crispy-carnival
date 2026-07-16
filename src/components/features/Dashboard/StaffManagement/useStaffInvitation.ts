import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import {
  classifyPeopleCapacityError,
  type PeopleCapacityResolution,
} from "@/src/domains/organizationBilling/peopleCapacity";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorMessage } from "@/src/lib/convex/error";
import type { AddStaffFormData } from "../AddStaffForm";

export function useStaffInvitation(isReadOnly = false) {
  const isReadOnlyRef = useRef(isReadOnly);
  isReadOnlyRef.current = isReadOnly;
  const dialog = useDialog();
  const reactivationDialog = useDialog();
  const [mode, setMode] = useState<"qr" | "manual">("qr");
  const [registrationUrl, setRegistrationUrl] = useState<string | null>(null);
  const [peopleCapacityResolution, setPeopleCapacityResolution] = useState<PeopleCapacityResolution | null>(null);
  const [pendingReactivation, setPendingReactivation] = useState<{
    data: AddStaffFormData;
    requestId: string;
    candidates: Array<{
      personId: Id<"organizationPeople">;
      name: string;
      email: string;
    }>;
  } | null>(null);
  const addStaffs = useShopMutation(api.staff.mutations.addStaffs);
  const ensureShopRegistrationLink = useShopMutation(api.staffRegistration.mutations.ensureShopRegistrationLink);

  useEffect(() => {
    if (!isReadOnly) return;
    dialog.close();
    reactivationDialog.close();
    setMode("qr");
    setRegistrationUrl(null);
    setPeopleCapacityResolution(null);
    setPendingReactivation(null);
  }, [dialog.close, isReadOnly, reactivationDialog.close]);

  const { run: handleAddStaffs, isRunning: isAddingStaffs } = useSingleFlight(async (data: AddStaffFormData) => {
    if (isReadOnlyRef.current) return;
    setPeopleCapacityResolution(null);
    try {
      const requestId = crypto.randomUUID();
      const result = await addStaffs({ entries: data.entries, requestId });
      if (result.status === "requiresConfirmation") {
        setPendingReactivation({ data, requestId, candidates: result.candidates });
        reactivationDialog.open();
        return;
      }
      dialog.close();
      showSuccessToast({
        title: "スタッフを追加し、案内通知を送りました",
        description: "同意依頼とLINE連携案内をメールで送りました。募集中シフトがある場合は提出リンクも届きます。",
      });
    } catch (error) {
      const resolution = classifyPeopleCapacityError(getConvexErrorMessage(error));
      if (resolution) {
        setPeopleCapacityResolution(resolution);
        return;
      }
      showErrorToast(error);
    }
  });

  const { run: handleConfirmReactivation, isRunning: isConfirmingReactivation } = useSingleFlight(async () => {
    if (isReadOnlyRef.current || !pendingReactivation) return;

    setPeopleCapacityResolution(null);
    try {
      const result = await addStaffs({
        entries: pendingReactivation.data.entries,
        requestId: pendingReactivation.requestId,
        confirmReactivationPersonIds: pendingReactivation.candidates.map((candidate) => candidate.personId),
      });
      if (result.status !== "added") {
        throw new Error("確認対象が変わりました。追加内容をもう一度確認してください");
      }
      reactivationDialog.close();
      dialog.close();
      setPendingReactivation(null);
      showSuccessToast({
        title: "スタッフを再追加し、案内通知を送りました",
        description: "この店舗のスタッフとして再追加しました。以前の管理者権限や他店舗所属は復元していません。",
      });
    } catch (error) {
      const resolution = classifyPeopleCapacityError(getConvexErrorMessage(error));
      if (resolution) {
        setPeopleCapacityResolution(resolution);
        return;
      }
      showErrorToast(error);
    }
  });

  const { run: loadRegistrationUrl, isRunning: isRegistrationUrlLoading } = useSingleFlight(async () => {
    if (isReadOnlyRef.current) return;
    try {
      const result = await ensureShopRegistrationLink({});
      if (isReadOnlyRef.current) return;
      setRegistrationUrl(result.registrationUrl);
    } catch (error) {
      if (isReadOnlyRef.current) return;
      showErrorToast(error);
    }
  });

  const handleOpen = () => {
    if (isReadOnlyRef.current) return;
    setMode("qr");
    setRegistrationUrl(null);
    setPeopleCapacityResolution(null);
    setPendingReactivation(null);
    reactivationDialog.close();
    dialog.open();
    void loadRegistrationUrl();
  };

  const handleBackOrClose = () => {
    if (reactivationDialog.isOpen) return;
    if (mode === "manual") {
      setMode("qr");
      return;
    }
    dialog.close();
  };

  return {
    dialog,
    mode,
    registrationUrl,
    peopleCapacityResolution,
    isRegistrationUrlLoading,
    isAddingStaffs,
    onOpen: handleOpen,
    onBackOrClose: handleBackOrClose,
    onShowManualEntry: () => {
      if (isReadOnlyRef.current) return;
      setPeopleCapacityResolution(null);
      setMode("manual");
    },
    onAddStaffs: handleAddStaffs,
    reactivationConfirmation: {
      dialog: {
        isOpen: reactivationDialog.isOpen,
        onOpenChange: ({ open }: { open: boolean }) => {
          if (open) {
            if (isReadOnlyRef.current) return;
            reactivationDialog.open();
            return;
          }
          reactivationDialog.close();
          setPendingReactivation(null);
        },
      },
      candidates: pendingReactivation?.candidates ?? [],
      isConfirming: isConfirmingReactivation,
      onConfirm: handleConfirmReactivation,
      onClose: () => {
        reactivationDialog.close();
        setPendingReactivation(null);
      },
    },
  };
}
