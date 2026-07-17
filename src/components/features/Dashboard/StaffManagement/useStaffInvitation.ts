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
import type { StaffInvitationTab } from "./StaffInvitationDialog";

export function useStaffInvitation(isReadOnly = false) {
  const isReadOnlyRef = useRef(isReadOnly);
  const invitationMutationInFlightRef = useRef(false);
  isReadOnlyRef.current = isReadOnly;
  const dialog = useDialog();
  const reactivationDialog = useDialog();
  const [activeTab, setActiveTab] = useState<StaffInvitationTab>("link");
  const [registrationUrl, setRegistrationUrl] = useState<string | null>(null);
  const [peopleCapacityResolution, setPeopleCapacityResolution] = useState<PeopleCapacityResolution | null>(null);
  const [addingOrganizationPersonId, setAddingOrganizationPersonId] = useState<Id<"organizationPeople"> | null>(null);
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
  const addOrganizationPersonToShop = useShopMutation(api.staff.mutations.addOrganizationPersonToShop);
  const ensureShopRegistrationLink = useShopMutation(api.staffRegistration.mutations.ensureShopRegistrationLink);

  useEffect(() => {
    if (!isReadOnly) return;
    dialog.close();
    reactivationDialog.close();
    setActiveTab("link");
    setRegistrationUrl(null);
    setPeopleCapacityResolution(null);
    setAddingOrganizationPersonId(null);
    setPendingReactivation(null);
  }, [dialog.close, isReadOnly, reactivationDialog.close]);

  const { run: handleAddStaffs, isRunning: isAddingStaffs } = useSingleFlight(async (data: AddStaffFormData) => {
    if (isReadOnlyRef.current || invitationMutationInFlightRef.current) return;
    invitationMutationInFlightRef.current = true;
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
    } finally {
      invitationMutationInFlightRef.current = false;
    }
  });

  const { run: handleConfirmReactivation, isRunning: isConfirmingReactivation } = useSingleFlight(async () => {
    if (isReadOnlyRef.current || !pendingReactivation || invitationMutationInFlightRef.current) return;

    invitationMutationInFlightRef.current = true;
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
    } finally {
      invitationMutationInFlightRef.current = false;
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

  const { run: handleAddOrganizationPerson, isRunning: isAddingOrganizationPerson } = useSingleFlight(
    async (personId: Id<"organizationPeople">) => {
      if (isReadOnlyRef.current || invitationMutationInFlightRef.current) return;

      invitationMutationInFlightRef.current = true;
      setAddingOrganizationPersonId(personId);
      try {
        await addOrganizationPersonToShop({ personId, requestId: crypto.randomUUID() });
        if (isReadOnlyRef.current) return;
        dialog.close();
        showSuccessToast({
          title: "スタッフを追加しました",
          description: "この店舗のスタッフとして追加しました。",
        });
      } catch (error) {
        if (!isReadOnlyRef.current) showErrorToast(error);
      } finally {
        setAddingOrganizationPersonId(null);
        invitationMutationInFlightRef.current = false;
      }
    },
  );

  const handleOpen = () => {
    if (isReadOnlyRef.current || invitationMutationInFlightRef.current) return;
    setActiveTab("link");
    setRegistrationUrl(null);
    setPeopleCapacityResolution(null);
    setAddingOrganizationPersonId(null);
    setPendingReactivation(null);
    reactivationDialog.close();
    dialog.open();
    void loadRegistrationUrl();
  };

  const handleClose = () => {
    if (reactivationDialog.isOpen || invitationMutationInFlightRef.current) return;
    dialog.close();
  };

  return {
    dialog: {
      isOpen: dialog.isOpen,
      onOpenChange: ({ open }: { open: boolean }) => {
        if (open) {
          handleOpen();
          return;
        }
        handleClose();
      },
    },
    activeTab,
    registrationUrl,
    peopleCapacityResolution,
    isRegistrationUrlLoading,
    isAddingStaffs,
    addingOrganizationPersonId,
    isAddingOrganizationPerson,
    onOpen: handleOpen,
    onClose: handleClose,
    onTabChange: (tab: StaffInvitationTab) => {
      if (isReadOnlyRef.current || invitationMutationInFlightRef.current) return;
      setPeopleCapacityResolution(null);
      setActiveTab(tab);
    },
    onAddStaffs: handleAddStaffs,
    onAddOrganizationPerson: handleAddOrganizationPerson,
    reactivationConfirmation: {
      dialog: {
        isOpen: reactivationDialog.isOpen,
        onOpenChange: ({ open }: { open: boolean }) => {
          if (open) {
            if (isReadOnlyRef.current || invitationMutationInFlightRef.current) return;
            reactivationDialog.open();
            return;
          }
          if (invitationMutationInFlightRef.current) return;
          reactivationDialog.close();
          setPendingReactivation(null);
        },
      },
      candidates: pendingReactivation?.candidates ?? [],
      isConfirming: isConfirmingReactivation,
      onConfirm: handleConfirmReactivation,
      onClose: () => {
        if (invitationMutationInFlightRef.current) return;
        reactivationDialog.close();
        setPendingReactivation(null);
      },
    },
  };
}
